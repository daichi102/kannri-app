from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from database import connect, load_database_config


_LOCK = threading.RLock()
_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY = False


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class WorkerStore:
    """Operational storage shared by the admin and field-worker screens."""

    def __init__(self, data_dir: Path, schema_path: Path | None = None):
        self.data_dir = data_dir
        self.jobs_path = data_dir / "logistics_jobs.json"
        self.attendance_path = data_dir / "worker_attendance.json"
        self.schema_path = schema_path or Path(__file__).resolve().parent / "sql" / "cloud_sql_schema.sql"

    @property
    def postgres_enabled(self) -> bool:
        return load_database_config().enabled

    def _ensure_schema(self, connection: Any) -> None:
        global _SCHEMA_READY
        if _SCHEMA_READY:
            return
        with _SCHEMA_LOCK:
            if _SCHEMA_READY:
                return
            with connection.cursor() as cursor:
                cursor.execute(self.schema_path.read_text(encoding="utf-8"))
            connection.commit()
            _SCHEMA_READY = True

    @staticmethod
    def _read(path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, path)

    def load_jobs(self) -> list[dict[str, Any]]:
        if not self.postgres_enabled:
            value = self._read(self.jobs_path, [])
            return value.get("jobs", []) if isinstance(value, dict) else value if isinstance(value, list) else []
        with connect() as connection:
            self._ensure_schema(connection)
            with connection.cursor() as cursor:
                cursor.execute("select payload from logistics_jobs order by scheduled_date nulls last, work_order_number")
                rows = cursor.fetchall()
            if rows:
                return [dict(row[0]) for row in rows]
            local = self._read(self.jobs_path, [])
            local = local.get("jobs", []) if isinstance(local, dict) else local
            if isinstance(local, list) and local:
                self._save_jobs_postgres(connection, local)
                return local
        return []

    def _save_jobs_postgres(self, connection: Any, jobs: list[dict[str, Any]]) -> None:
        ids: list[str] = []
        with connection.cursor() as cursor:
            for job in jobs:
                job_id = str(job.get("id") or uuid.uuid4().hex)
                job["id"] = job_id
                ids.append(job_id)
                cursor.execute(
                    """insert into logistics_jobs(id, work_order_number, scheduled_date, assigned_worker_id, payload, updated_at)
                       values (%s,%s,nullif(%s,'')::date,nullif(%s,''),%s::jsonb,now())
                       on conflict(id) do update set work_order_number=excluded.work_order_number,
                       scheduled_date=excluded.scheduled_date, assigned_worker_id=excluded.assigned_worker_id,
                       payload=excluded.payload, updated_at=now()""",
                    (job_id, str(job.get("work_order_number", "")), str(job.get("scheduled_date", "")),
                     str(job.get("assigned_worker_id", "")), json.dumps(job, ensure_ascii=False)),
                )
            if ids:
                cursor.execute("delete from logistics_jobs where not (id = any(%s))", (ids,))
        connection.commit()

    def save_jobs(self, jobs: list[dict[str, Any]]) -> None:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                self._save_jobs_postgres(connection, jobs)
            return
        with _LOCK:
            self._write(self.jobs_path, jobs)

    def load_users(self) -> dict[str, dict[str, Any]]:
        local = self._read(self.data_dir / "users.json", {})
        local = local if isinstance(local, dict) else {}
        if not self.postgres_enabled:
            return local
        with connect() as connection:
            self._ensure_schema(connection)
            with connection.cursor() as cursor:
                cursor.execute("select user_id, payload from app_users order by user_id")
                rows = cursor.fetchall()
            if rows:
                return {str(row[0]): dict(row[1]) for row in rows}
            if local:
                self._save_users_postgres(connection, local)
                return local
        return {}

    def _save_users_postgres(self, connection: Any, users: dict[str, dict[str, Any]]) -> None:
        with connection.cursor() as cursor:
            for user_id, user in users.items():
                cursor.execute(
                    """insert into app_users(user_id, role, payload, updated_at)
                       values(%s,%s,%s::jsonb,now()) on conflict(user_id) do update set
                       role=excluded.role,payload=excluded.payload,updated_at=now()""",
                    (user_id, str(user.get("role", "worker")), json.dumps(user, ensure_ascii=False)),
                )
        connection.commit()

    def save_users(self, users: dict[str, dict[str, Any]]) -> None:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                self._save_users_postgres(connection, users)
            return
        with _LOCK:
            self._write(self.data_dir / "users.json", users)

    def load_invites(self) -> list[dict[str, Any]]:
        local = self._read(self.data_dir / "user_invites.json", [])
        local = local if isinstance(local, list) else []
        if not self.postgres_enabled:
            return local
        with connect() as connection:
            self._ensure_schema(connection)
            with connection.cursor() as cursor:
                cursor.execute("select payload from worker_invites order by created_at desc")
                rows = cursor.fetchall()
            if rows:
                return [dict(row[0]) for row in rows]
            if local:
                self._save_invites_postgres(connection, local)
                return local
        return []

    def _save_invites_postgres(self, connection: Any, invites: list[dict[str, Any]]) -> None:
        with connection.cursor() as cursor:
            for invite in invites:
                cursor.execute(
                    """insert into worker_invites(token_hash,email,status,created_at,payload)
                       values(%s,%s,%s,%s,%s::jsonb) on conflict(token_hash) do update set
                       email=excluded.email,status=excluded.status,payload=excluded.payload""",
                    (str(invite.get("token_hash", "")), str(invite.get("email", "")),
                     str(invite.get("status", "pending")), str(invite.get("created_at") or _now()),
                     json.dumps(invite, ensure_ascii=False)),
                )
        connection.commit()

    def save_invites(self, invites: list[dict[str, Any]]) -> None:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                self._save_invites_postgres(connection, invites)
            return
        with _LOCK:
            self._write(self.data_dir / "user_invites.json", invites)

    def attendance(self, worker_id: str) -> list[dict[str, Any]]:
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    cursor.execute(
                        "select id, worker_id, work_date, clock_in, clock_out from worker_attendance where worker_id=%s order by work_date desc",
                        (worker_id,),
                    )
                    return [{"id": row[0], "worker_id": row[1], "work_date": str(row[2]),
                             "clock_in": row[3].isoformat(), "clock_out": row[4].isoformat() if row[4] else None}
                            for row in cursor.fetchall()]
        values = self._read(self.attendance_path, [])
        return [item for item in values if item.get("worker_id") == worker_id] if isinstance(values, list) else []

    def clock(self, worker_id: str, action: str) -> list[dict[str, Any]]:
        today = date.today().isoformat()
        now = _now()
        if action not in {"clock_in", "clock_out"}:
            raise ValueError("勤怠操作を確認できませんでした。")
        if self.postgres_enabled:
            with connect() as connection:
                self._ensure_schema(connection)
                with connection.cursor() as cursor:
                    if action == "clock_in":
                        cursor.execute(
                            """insert into worker_attendance(id,worker_id,work_date,clock_in)
                               values(%s,%s,%s,%s) on conflict(worker_id,work_date) do nothing""",
                            (uuid.uuid4().hex, worker_id, today, now),
                        )
                    else:
                        cursor.execute(
                            "update worker_attendance set clock_out=%s,updated_at=now() where worker_id=%s and work_date=%s and clock_out is null",
                            (now, worker_id, today),
                        )
                        if not cursor.rowcount:
                            raise ValueError("本日の出勤記録がありません。")
                connection.commit()
            return self.attendance(worker_id)
        with _LOCK:
            values = self._read(self.attendance_path, [])
            record = next((item for item in values if item.get("worker_id") == worker_id and item.get("work_date") == today), None)
            if action == "clock_in" and not record:
                values.append({"id": uuid.uuid4().hex, "worker_id": worker_id, "work_date": today, "clock_in": now, "clock_out": None})
            elif action == "clock_out":
                if not record:
                    raise ValueError("本日の出勤記録がありません。")
                record["clock_out"] = record.get("clock_out") or now
            self._write(self.attendance_path, values)
        return self.attendance(worker_id)
