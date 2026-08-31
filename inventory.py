from __future__ import annotations

import json
import os
import re
import threading
import unicodedata
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from database import connect, load_database_config


MANUFACTURERS = ("AQUA", "ハイアール", "その他")
CATEGORIES = ("洗濯機", "冷蔵庫", "エアコン", "その他")
MOVEMENT_TYPES = {"receive", "dispatch", "return", "adjustment"}
_LOCAL_LOCK = threading.RLock()
_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY = False


class InventoryError(ValueError):
    """An inventory error that can be shown to an operator."""


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _id() -> str:
    return uuid.uuid4().hex


def normalize_jan(value: Any) -> str:
    return re.sub(r"\D", "", unicodedata.normalize("NFKC", str(value or "")))


def normalize_model(value: Any) -> str:
    return re.sub(
        r"[\s‐‑‒–—―ーｰ]+",
        "-",
        unicodedata.normalize("NFKC", str(value or "")).strip().upper(),
    )


def valid_jan(value: str) -> bool:
    jan = normalize_jan(value)
    if len(jan) not in {8, 13}:
        return False
    digits = [int(character) for character in jan]
    body = digits[:-1]
    weighted = sum(
        digit * (3 if (len(body) - index) % 2 else 1)
        for index, digit in enumerate(body)
    )
    return (10 - weighted % 10) % 10 == digits[-1]


def _positive_quantity(value: Any) -> int:
    try:
        quantity = int(value)
    except (TypeError, ValueError) as exc:
        raise InventoryError("数量は1以上の整数で入力してください。") from exc
    if quantity <= 0:
        raise InventoryError("数量は1以上の整数で入力してください。")
    return quantity


def _validate_product(payload: dict[str, Any]) -> dict[str, Any]:
    jan_code = normalize_jan(payload.get("jan_code"))
    if not valid_jan(jan_code):
        raise InventoryError("JANコードは正しい8桁または13桁で入力してください。")
    name = str(payload.get("name", "")).strip()
    model = str(payload.get("model", "")).strip()
    if not name:
        raise InventoryError("商品名を入力してください。")
    if not model:
        raise InventoryError("型番を入力してください。")
    manufacturer = str(payload.get("manufacturer", "")).strip()
    category = str(payload.get("category", "")).strip()
    if manufacturer not in MANUFACTURERS:
        raise InventoryError("メーカーを選択してください。")
    if category not in CATEGORIES:
        raise InventoryError("カテゴリーを選択してください。")
    return {
        "jan_code": jan_code,
        "name": name,
        "model": model,
        "normalized_model": normalize_model(model),
        "manufacturer": manufacturer,
        "manufacturer_other": (
            str(payload.get("manufacturer_other", "")).strip()
            if manufacturer == "その他"
            else ""
        ),
        "category": category,
        "category_other": (
            str(payload.get("category_other", "")).strip()
            if category == "その他"
            else ""
        ),
        "notes": str(payload.get("notes", "")).strip(),
        "active": bool(payload.get("active", True)),
    }


class InventoryStore:
    def __init__(self, data_dir: Path, schema_path: Path | None = None):
        self.data_dir = data_dir
        self.local_path = data_dir / "inventory.json"
        self.schema_path = schema_path or Path(__file__).resolve().parent / "sql" / "cloud_sql_schema.sql"

    @property
    def postgres_enabled(self) -> bool:
        return load_database_config().enabled

    def _local_load(self) -> dict[str, list[dict[str, Any]]]:
        if not self.local_path.exists():
            return {"products": [], "movements": [], "reservations": []}
        try:
            data = json.loads(self.local_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise InventoryError("在庫データを読み取れませんでした。") from exc
        if not isinstance(data, dict):
            raise InventoryError("在庫データの形式が正しくありません。")
        return {
            "products": data.get("products", []) if isinstance(data.get("products"), list) else [],
            "movements": data.get("movements", []) if isinstance(data.get("movements"), list) else [],
            "reservations": data.get("reservations", []) if isinstance(data.get("reservations"), list) else [],
        }

    def _local_save(self, data: dict[str, Any]) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        temporary = self.local_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, self.local_path)

    def _ensure_schema(self, connection: Any) -> None:
        global _SCHEMA_READY
        if _SCHEMA_READY:
            return
        with _SCHEMA_LOCK:
            if _SCHEMA_READY:
                return
            if not self.schema_path.exists():
                raise InventoryError("Cloud SQL用の在庫スキーマが見つかりません。")
            with connection.cursor() as cursor:
                cursor.execute(self.schema_path.read_text(encoding="utf-8"))
            connection.commit()
            _SCHEMA_READY = True

    @staticmethod
    def _dict_rows(cursor: Any) -> list[dict[str, Any]]:
        names = [column.name for column in cursor.description]
        return [dict(zip(names, row)) for row in cursor.fetchall()]

    def create_product(self, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        product = _validate_product(payload)
        product.update(id=_id(), created_at=_now(), updated_at=_now(), created_by=actor)
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                try:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            insert into inventory_products
                              (id, jan_code, name, model, normalized_model, manufacturer,
                               manufacturer_other, category, category_other, notes, active,
                               created_by, created_at, updated_at)
                            values (%(id)s, %(jan_code)s, %(name)s, %(model)s,
                                    %(normalized_model)s, %(manufacturer)s,
                                    %(manufacturer_other)s, %(category)s,
                                    %(category_other)s, %(notes)s, %(active)s,
                                    %(created_by)s, %(created_at)s, %(updated_at)s)
                            """,
                            product,
                        )
                    connection.commit()
                except Exception as exc:
                    connection.rollback()
                    if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
                        raise InventoryError("同じJANコードまたは型番の商品が登録されています。") from exc
                    raise
            return product
        with _LOCAL_LOCK:
            data = self._local_load()
            if any(item.get("jan_code") == product["jan_code"] for item in data["products"]):
                raise InventoryError("同じJANコードの商品が登録されています。")
            if any(
                item.get("normalized_model") == product["normalized_model"] and item.get("active", True)
                for item in data["products"]
            ):
                raise InventoryError("同じ型番の商品が登録されています。")
            data["products"].append(product)
            self._local_save(data)
        return product

    def update_product(self, product_id: str, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        product = _validate_product(payload)
        product.update(id=product_id, updated_at=_now(), updated_by=actor)
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        update inventory_products set
                          jan_code=%(jan_code)s, name=%(name)s, model=%(model)s,
                          normalized_model=%(normalized_model)s,
                          manufacturer=%(manufacturer)s,
                          manufacturer_other=%(manufacturer_other)s,
                          category=%(category)s, category_other=%(category_other)s,
                          notes=%(notes)s, active=%(active)s,
                          updated_by=%(updated_by)s, updated_at=%(updated_at)s
                        where id=%(id)s
                        returning created_by, created_at
                        """,
                        product,
                    )
                    row = cursor.fetchone()
                    if not row:
                        raise InventoryError("商品が見つかりません。")
                    product.update(created_by=row[0], created_at=row[1].isoformat() if hasattr(row[1], "isoformat") else row[1])
                connection.commit()
            return product
        with _LOCAL_LOCK:
            data = self._local_load()
            index = next((i for i, item in enumerate(data["products"]) if item.get("id") == product_id), -1)
            if index < 0:
                raise InventoryError("商品が見つかりません。")
            if any(item.get("jan_code") == product["jan_code"] and item.get("id") != product_id for item in data["products"]):
                raise InventoryError("同じJANコードの商品が登録されています。")
            original = data["products"][index]
            product.update(created_by=original.get("created_by", ""), created_at=original.get("created_at", ""))
            data["products"][index] = product
            self._local_save(data)
        return product

    @staticmethod
    def _local_product(data: dict[str, Any], *, product_id: str = "", jan_code: str = "", model: str = "") -> dict[str, Any]:
        normalized = normalize_model(model)
        product = next(
            (
                item for item in data["products"]
                if (product_id and item.get("id") == product_id)
                or (jan_code and item.get("jan_code") == normalize_jan(jan_code))
                or (normalized and item.get("normalized_model") == normalized)
            ),
            None,
        )
        if not product or not product.get("active", True):
            raise InventoryError("登録済みの商品が見つかりません。")
        return product

    @staticmethod
    def _local_balance(data: dict[str, Any], product_id: str) -> tuple[int, int]:
        on_hand = sum(int(item.get("quantity", 0)) for item in data["movements"] if item.get("product_id") == product_id)
        reserved = sum(
            int(item.get("quantity", 0))
            for item in data["reservations"]
            if item.get("product_id") == product_id and item.get("status") == "reserved"
        )
        return on_hand, reserved

    def _movement(self, product: dict[str, Any], movement_type: str, quantity: int, actor: str, **extra: Any) -> dict[str, Any]:
        signed_quantity = quantity if movement_type in {"receive", "return"} else -quantity
        return {
            "id": _id(),
            "product_id": product["id"],
            "movement_type": movement_type,
            "quantity": signed_quantity,
            "occurred_on": str(extra.get("occurred_on") or date.today().isoformat()),
            "job_id": str(extra.get("job_id", "")),
            "work_order_number": str(extra.get("work_order_number", "")),
            "sagyou_job_id": str(extra.get("sagyou_job_id", "")),
            "notes": str(extra.get("notes", "")).strip(),
            "created_by": actor,
            "created_at": _now(),
            "product_name": product.get("name", ""),
            "model": product.get("model", ""),
            "jan_code": product.get("jan_code", ""),
        }

    def add_stock(self, payload: dict[str, Any], actor: str, movement_type: str = "receive") -> dict[str, Any]:
        if movement_type not in {"receive", "return"}:
            raise InventoryError("在庫処理の種類が正しくありません。")
        quantity = _positive_quantity(payload.get("quantity"))
        jan_code = normalize_jan(payload.get("jan_code"))
        product_id = str(payload.get("product_id", "")).strip()
        movement_details = {
            key: value
            for key, value in payload.items()
            if key not in {"quantity", "jan_code", "product_id"}
        }
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute(
                        "select id, jan_code, name, model from inventory_products where active and (id=%s or jan_code=%s) for update",
                        (product_id, jan_code),
                    )
                    row = cursor.fetchone()
                    if not row:
                        raise InventoryError("登録済みの商品が見つかりません。")
                    product = {"id": row[0], "jan_code": row[1], "name": row[2], "model": row[3]}
                    movement = self._movement(product, movement_type, quantity, actor, **movement_details)
                    cursor.execute(
                        """
                        insert into inventory_movements
                          (id, product_id, movement_type, quantity, occurred_on, job_id,
                           work_order_number, sagyou_job_id, notes, created_by, created_at)
                        values (%(id)s, %(product_id)s, %(movement_type)s, %(quantity)s,
                                %(occurred_on)s, nullif(%(job_id)s,''),
                                nullif(%(work_order_number)s,''), nullif(%(sagyou_job_id)s,''),
                                %(notes)s, %(created_by)s, %(created_at)s)
                        """,
                        movement,
                    )
                connection.commit()
            return movement
        with _LOCAL_LOCK:
            data = self._local_load()
            product = self._local_product(data, product_id=product_id, jan_code=jan_code)
            movement = self._movement(product, movement_type, quantity, actor, **movement_details)
            data["movements"].append(movement)
            self._local_save(data)
        return movement

    def _postgres_product_by_model(self, cursor: Any, model: str) -> dict[str, Any]:
        cursor.execute(
            "select id, jan_code, name, model from inventory_products where active and normalized_model=%s for update",
            (normalize_model(model),),
        )
        row = cursor.fetchone()
        if not row:
            raise InventoryError(f"型番「{model}」の商品が商品マスターにありません。")
        return {"id": row[0], "jan_code": row[1], "name": row[2], "model": row[3]}

    def reserve_for_job(self, job: dict[str, Any], actor: str, quantity: int = 1) -> dict[str, Any]:
        job_id = str(job.get("id", "")).strip()
        work_order_number = str(job.get("work_order_number", "")).strip()
        model = str(job.get("new_product_model", "")).strip()
        if not job_id or not work_order_number:
            raise InventoryError("引当する案件を確認できません。")
        if not model:
            raise InventoryError("案件に新商品型番がありません。")
        quantity = _positive_quantity(quantity)
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute("select id, status from inventory_reservations where job_id=%s for update", (job_id,))
                    existing = cursor.fetchone()
                    if existing:
                        if existing[1] in {"reserved", "dispatched"}:
                            return {"id": existing[0], "status": existing[1], "already_exists": True}
                        raise InventoryError("この案件の引当は取消済みです。")
                    product = self._postgres_product_by_model(cursor, model)
                    cursor.execute("select coalesce(sum(quantity),0) from inventory_movements where product_id=%s", (product["id"],))
                    on_hand = int(cursor.fetchone()[0])
                    cursor.execute("select coalesce(sum(quantity),0) from inventory_reservations where product_id=%s and status='reserved'", (product["id"],))
                    reserved = int(cursor.fetchone()[0])
                    if on_hand - reserved < quantity:
                        raise InventoryError(f"{product['name']}の使用可能在庫が不足しています。")
                    reservation = {
                        "id": _id(), "product_id": product["id"], "job_id": job_id,
                        "work_order_number": work_order_number,
                        "sagyou_job_id": str(job.get("sagyou_job_id", "")),
                        "scheduled_date": str(job.get("scheduled_date", "")) or None,
                        "quantity": quantity, "status": "reserved", "created_by": actor,
                        "created_at": _now(), "updated_at": _now(),
                    }
                    cursor.execute(
                        """
                        insert into inventory_reservations
                          (id, product_id, job_id, work_order_number, sagyou_job_id,
                           scheduled_date, quantity, status, created_by, created_at, updated_at)
                        values (%(id)s,%(product_id)s,%(job_id)s,%(work_order_number)s,
                                nullif(%(sagyou_job_id)s,''),%(scheduled_date)s,%(quantity)s,
                                %(status)s,%(created_by)s,%(created_at)s,%(updated_at)s)
                        """, reservation,
                    )
                connection.commit()
            return {**reservation, **product}
        with _LOCAL_LOCK:
            data = self._local_load()
            existing = next((item for item in data["reservations"] if item.get("job_id") == job_id), None)
            if existing:
                if existing.get("status") in {"reserved", "dispatched"}:
                    return {**existing, "already_exists": True}
                raise InventoryError("この案件の引当は取消済みです。")
            try:
                product = self._local_product(data, model=model)
            except InventoryError as exc:
                raise InventoryError(f"型番「{model}」の商品が商品マスターにありません。") from exc
            on_hand, reserved = self._local_balance(data, product["id"])
            if on_hand - reserved < quantity:
                raise InventoryError(f"{product['name']}の使用可能在庫が不足しています。")
            reservation = {
                "id": _id(), "product_id": product["id"], "job_id": job_id,
                "work_order_number": work_order_number,
                "sagyou_job_id": str(job.get("sagyou_job_id", "")),
                "scheduled_date": str(job.get("scheduled_date", "")),
                "quantity": quantity, "status": "reserved", "created_by": actor,
                "created_at": _now(), "updated_at": _now(),
                "product_name": product["name"], "model": product["model"],
                "jan_code": product["jan_code"],
            }
            data["reservations"].append(reservation)
            self._local_save(data)
        return reservation

    def validate_job_reservation(self, job: dict[str, Any], quantity: int = 1) -> dict[str, Any]:
        """Check that a job can be reserved without changing inventory."""
        job_id = str(job.get("id", "")).strip()
        model = str(job.get("new_product_model", "")).strip()
        quantity = _positive_quantity(quantity)
        if not model:
            raise InventoryError("案件に新商品型番がありません。")
        snapshot = self.snapshot()
        existing = next((item for item in snapshot["reservations"] if item.get("job_id") == job_id), None)
        if existing and existing.get("status") in {"reserved", "dispatched"}:
            return existing
        product = next((item for item in snapshot["products"] if item.get("normalized_model") == normalize_model(model) and item.get("active")), None)
        if not product:
            raise InventoryError(f"型番「{model}」の商品が商品マスターにありません。")
        if int(product.get("available", 0)) < quantity:
            raise InventoryError(f"{product['name']}の使用可能在庫が不足しています。")
        return product

    def dispatch_job(self, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        job_id = str(payload.get("job_id", "")).strip()
        jan_code = normalize_jan(payload.get("jan_code"))
        if not job_id:
            raise InventoryError("案件IDを指定してください。")
        if not jan_code:
            raise InventoryError("JANコードをスキャンしてください。")
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        select r.id,r.product_id,r.quantity,r.status,r.work_order_number,
                               r.sagyou_job_id,p.jan_code,p.name,p.model
                        from inventory_reservations r join inventory_products p on p.id=r.product_id
                        where r.job_id=%s for update of r,p
                        """, (job_id,),
                    )
                    row = cursor.fetchone()
                    if not row:
                        raise InventoryError("この案件には出庫予定がありません。")
                    if row[3] == "dispatched":
                        return {"reservation_id": row[0], "status": "dispatched", "already_exists": True}
                    if row[3] != "reserved":
                        raise InventoryError("この案件の出庫予定は取消されています。")
                    if row[6] != jan_code:
                        raise InventoryError("予定商品とスキャンしたJANコードが一致しません。")
                    product = {"id": row[1], "jan_code": row[6], "name": row[7], "model": row[8]}
                    movement = self._movement(product, "dispatch", int(row[2]), actor, job_id=job_id, work_order_number=row[4], sagyou_job_id=row[5], notes=payload.get("notes", ""))
                    cursor.execute("select coalesce(sum(quantity),0) from inventory_movements where product_id=%s", (product["id"],))
                    if int(cursor.fetchone()[0]) < int(row[2]):
                        raise InventoryError("現在庫が不足しているため出庫できません。")
                    cursor.execute(
                        """insert into inventory_movements
                        (id,product_id,movement_type,quantity,occurred_on,job_id,work_order_number,sagyou_job_id,notes,created_by,created_at)
                        values (%(id)s,%(product_id)s,%(movement_type)s,%(quantity)s,%(occurred_on)s,%(job_id)s,%(work_order_number)s,nullif(%(sagyou_job_id)s,''),%(notes)s,%(created_by)s,%(created_at)s)""",
                        movement,
                    )
                    cursor.execute("update inventory_reservations set status='dispatched', updated_at=%s where id=%s", (_now(), row[0]))
                connection.commit()
            return {"reservation_id": row[0], "status": "dispatched", "movement": movement}
        with _LOCAL_LOCK:
            data = self._local_load()
            reservation = next((item for item in data["reservations"] if item.get("job_id") == job_id), None)
            if not reservation:
                raise InventoryError("この案件には出庫予定がありません。")
            if reservation.get("status") == "dispatched":
                return {"reservation_id": reservation["id"], "status": "dispatched", "already_exists": True}
            if reservation.get("status") != "reserved":
                raise InventoryError("この案件の出庫予定は取消されています。")
            product = self._local_product(data, product_id=reservation["product_id"])
            if product["jan_code"] != jan_code:
                raise InventoryError("予定商品とスキャンしたJANコードが一致しません。")
            on_hand, _ = self._local_balance(data, product["id"])
            if on_hand < int(reservation["quantity"]):
                raise InventoryError("現在庫が不足しているため出庫できません。")
            movement = self._movement(product, "dispatch", int(reservation["quantity"]), actor, job_id=job_id, work_order_number=reservation.get("work_order_number", ""), sagyou_job_id=reservation.get("sagyou_job_id", ""), notes=payload.get("notes", ""))
            data["movements"].append(movement)
            reservation["status"] = "dispatched"
            reservation["updated_at"] = _now()
            self._local_save(data)
        return {"reservation_id": reservation["id"], "status": "dispatched", "movement": movement}

    def cancel_reservation(self, job_id: str, actor: str) -> dict[str, Any]:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute("update inventory_reservations set status='cancelled', updated_at=%s, cancelled_by=%s where job_id=%s and status='reserved' returning id", (_now(), actor, job_id))
                    row = cursor.fetchone()
                    if not row:
                        raise InventoryError("取消できる出庫予定がありません。")
                connection.commit()
            return {"id": row[0], "status": "cancelled"}
        with _LOCAL_LOCK:
            data = self._local_load()
            reservation = next((item for item in data["reservations"] if item.get("job_id") == job_id and item.get("status") == "reserved"), None)
            if not reservation:
                raise InventoryError("取消できる出庫予定がありません。")
            reservation.update(status="cancelled", updated_at=_now(), cancelled_by=actor)
            self._local_save(data)
        return reservation

    def snapshot(self) -> dict[str, Any]:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        select p.*,
                          coalesce(sum(m.quantity),0)::integer as on_hand,
                          coalesce((select sum(r.quantity) from inventory_reservations r where r.product_id=p.id and r.status='reserved'),0)::integer as reserved
                        from inventory_products p left join inventory_movements m on m.product_id=p.id
                        group by p.id order by p.name,p.model
                        """
                    )
                    products = self._dict_rows(cursor)
                    cursor.execute(
                        """select r.*,p.name as product_name,p.model,p.jan_code
                        from inventory_reservations r join inventory_products p on p.id=r.product_id
                        order by r.created_at desc limit 300"""
                    )
                    reservations = self._dict_rows(cursor)
                    cursor.execute(
                        """select m.*,p.name as product_name,p.model,p.jan_code
                        from inventory_movements m join inventory_products p on p.id=m.product_id
                        order by m.created_at desc limit 200"""
                    )
                    movements = self._dict_rows(cursor)
            for rows in (products, reservations, movements):
                for row in rows:
                    for key, value in list(row.items()):
                        if hasattr(value, "isoformat"):
                            row[key] = value.isoformat()
        else:
            with _LOCAL_LOCK:
                data = self._local_load()
            products = [dict(item) for item in data["products"]]
            for product in products:
                product["on_hand"], product["reserved"] = self._local_balance(data, product["id"])
            reservations = sorted(data["reservations"], key=lambda item: item.get("created_at", ""), reverse=True)[:300]
            movements = sorted(data["movements"], key=lambda item: item.get("created_at", ""), reverse=True)[:200]
        for product in products:
            product["on_hand"] = int(product.get("on_hand", 0))
            product["reserved"] = int(product.get("reserved", 0))
            product["available"] = product["on_hand"] - product["reserved"]
        today = date.today().isoformat()
        return {
            "backend": "cloud-sql-postgres" if self.postgres_enabled else "local-json",
            "products": products,
            "reservations": reservations,
            "movements": movements,
            "summary": {
                "on_hand": sum(item["on_hand"] for item in products if item.get("active", True)),
                "reserved": sum(item["reserved"] for item in products if item.get("active", True)),
                "available": sum(item["available"] for item in products if item.get("active", True)),
                "dispatched_today": abs(sum(int(item.get("quantity", 0)) for item in movements if item.get("movement_type") == "dispatch" and item.get("occurred_on") == today)),
            },
            "choices": {"manufacturers": list(MANUFACTURERS), "categories": list(CATEGORIES)},
        }
