from __future__ import annotations

import re
import statistics
import unicodedata
import zlib
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any


TRANSACTION_PATTERN = re.compile(
    r"(?<![A-Z0-9])[A-Z][A-Z0-9]{5}-\d{6}-\d{6}(?![A-Z0-9])"
)


class PdfExtractionError(Exception):
    """An error that can be shown to the dashboard user."""


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return normalized.replace("\u3000", " ").strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", "", normalize_text(value))


def _line_value(lines: list[str], label: str) -> str:
    label_key = compact(label)
    for line in lines:
        compact_line = compact(line)
        if compact_line.startswith(label_key):
            return compact_line[len(label_key) :].strip()
    return ""


def parse_certificate_text(
    text: str,
    *,
    page_number: int,
    position: int,
) -> dict[str, Any] | None:
    normalized = normalize_text(text)
    if "利用証明書" not in compact(normalized):
        return None

    lines = [normalize_text(line) for line in normalized.splitlines() if line.strip()]
    transaction_match = TRANSACTION_PATTERN.search(compact(normalized))
    if not transaction_match:
        return None

    operator = ""
    phone = ""
    registration_number = ""
    for line in lines:
        line_key = compact(line)
        if "お客さまセンター" in line_key:
            operator = line_key.split("お客さまセンター", 1)[0]
        if not phone:
            phone_match = re.search(r"\b0\d{1,4}-\d{2,4}-\d{3,4}\b", line_key)
            if phone_match:
                phone = phone_match.group(0)
        if not registration_number:
            registration_match = re.search(r"登録番号[:：]?([A-Z0-9]+)", line_key)
            if registration_match:
                registration_number = registration_match.group(1)

    full_text = compact(normalized)
    date_match = re.search(
        r"(\d{2,4})年(\d{1,2})月(\d{1,2})日"
        r"(\d{1,2})時(\d{1,2})分",
        full_text,
    )
    if not date_match:
        return None

    year = int(date_match.group(1))
    if year < 100:
        year += 2000
    occurred_at = datetime(
        year,
        int(date_match.group(2)),
        int(date_match.group(3)),
        int(date_match.group(4)),
        int(date_match.group(5)),
    )

    fee_match = re.search(r"通行料金[￥¥]?([\d,]+)[ー-]?", full_text)
    vehicle_match = re.search(r"車種(\d+)", full_text)

    return {
        "page": page_number,
        "position": position,
        "operator": operator,
        "phone": phone,
        "registration_number": registration_number,
        "entry_ic": _line_value(lines, "料金所(自)"),
        "exit_ic": _line_value(lines, "料金所(至)"),
        "date": occurred_at.strftime("%Y-%m-%d"),
        "time": occurred_at.strftime("%H:%M"),
        "fee": int(fee_match.group(1).replace(",", "")) if fee_match else 0,
        "vehicle_type": vehicle_match.group(1) if vehicle_match else "",
        "transaction_number": transaction_match.group(0),
    }


def _page_grid(page: Any) -> tuple[list[float], list[float]]:
    verticals = sorted(
        {
            round(float(line["x0"]), 2)
            for line in page.lines
            if abs(float(line["x0"]) - float(line["x1"])) < 0.8
            and float(line.get("height", 0)) > float(page.height) * 0.35
        }
    )
    if len(verticals) >= 6:
        candidate_bounds = verticals[:6]
        steps = [
            candidate_bounds[index + 1] - candidate_bounds[index]
            for index in range(5)
        ]
        if (
            candidate_bounds[-1] - candidate_bounds[0] > float(page.width) * 0.8
            and max(steps) - min(steps) < 4
        ):
            x_bounds = candidate_bounds
        else:
            verticals = [
                value
                for value in verticals
                if float(page.width) * 0.1 < value < float(page.width) * 0.9
            ][:4]
            step = statistics.median(
                verticals[index + 1] - verticals[index]
                for index in range(len(verticals) - 1)
            )
            x_bounds = [
                max(0.0, verticals[0] - step),
                *verticals,
                min(float(page.width), verticals[-1] + step),
            ]
    elif len(verticals) >= 4:
        verticals = verticals[:4]
        step = statistics.median(
            verticals[index + 1] - verticals[index]
            for index in range(len(verticals) - 1)
        )
        x_bounds = [
            max(0.0, verticals[0] - step),
            *verticals,
            min(float(page.width), verticals[-1] + step),
        ]
    else:
        x_bounds = [float(page.width) * index / 5 for index in range(6)]

    horizontal_boundaries = sorted(
        {
            round(float(line["top"]), 2)
            for line in page.lines
            if abs(float(line["top"]) - float(line["bottom"])) < 0.8
            and float(line.get("width", 0)) > float(page.width) * 0.5
        }
    )
    if horizontal_boundaries:
        middle = min(
            horizontal_boundaries,
            key=lambda value: abs(value - float(page.height) / 2),
        )
        half_height = min(middle, float(page.height) - middle)
        y_bounds = [
            max(0.0, middle - half_height),
            middle,
            min(float(page.height), middle + half_height),
        ]
    else:
        y_bounds = [0.0, float(page.height) / 2, float(page.height)]

    return x_bounds, y_bounds


def extract_pdf_certificates(path: Path) -> list[dict[str, Any]]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise PdfExtractionError(
            "PDF解析機能に必要なライブラリが未設定です。NASではContainer Managerで「構築」を実行してください。PC版ではsetup.batを実行してください。"
        ) from exc

    certificates: list[dict[str, Any]] = []
    try:
        with pdfplumber.open(path) as document:
            for page_number, page in enumerate(document.pages, start=1):
                x_bounds, y_bounds = _page_grid(page)
                position = 0
                for row in range(2):
                    for column in range(5):
                        position += 1
                        padding = 1.5
                        crop_box = (
                            x_bounds[column] + padding,
                            y_bounds[row] + padding,
                            x_bounds[column + 1] - padding,
                            y_bounds[row + 1] - padding,
                        )
                        text = (
                            page.crop(crop_box).extract_text(
                                x_tolerance=2,
                                y_tolerance=2,
                            )
                            or ""
                        )
                        certificate = parse_certificate_text(
                            text,
                            page_number=page_number,
                            position=position,
                        )
                        if certificate:
                            certificate["bbox"] = {
                                "x0": crop_box[0],
                                "top": crop_box[1],
                                "x1": crop_box[2],
                                "bottom": crop_box[3],
                            }
                            certificates.append(certificate)
    except Exception as exc:
        raise PdfExtractionError(
            f"{path.name} を解析できませんでした。"
        ) from exc

    if not certificates:
        raise PdfExtractionError(
            "利用証明書を抽出できませんでした。画像PDFの場合はOCR対応が必要です。"
        )

    return certificates


def _certificate_crop_metrics(
    source_page: Any,
    certificate: dict[str, Any],
) -> tuple[float, float, float, float, float, float]:
    source_height = float(source_page.mediabox.height)
    bbox = certificate["bbox"]
    x0 = float(bbox["x0"])
    x1 = float(bbox["x1"])
    lower_y = source_height - float(bbox["bottom"])
    upper_y = source_height - float(bbox["top"])
    crop_width = x1 - x0
    crop_height = upper_y - lower_y
    return x0, lower_y, x1, upper_y, crop_width, crop_height


def _normalized_certificate_page(
    source_page: Any,
    certificate: dict[str, Any],
) -> tuple[Any, float, float] | None:
    """Return a clean page whose media box is exactly the certificate crop.

    Directly merging a cropped original page can leave off-crop drawing commands
    in the generated PDF. Browser PDF viewers often tolerate that, but Acrobat can
    show "this page has an error" when those commands sit outside the intended
    box. By first drawing the source onto a fresh small page, every certificate
    becomes a self-contained, bounded page before it is placed on the A4 sheet.
    """

    from pypdf import PageObject, Transformation

    x0, lower_y, _x1, _upper_y, crop_width, crop_height = _certificate_crop_metrics(
        source_page,
        certificate,
    )
    if crop_width <= 0 or crop_height <= 0:
        return None

    crop_page = PageObject.create_blank_page(
        width=crop_width,
        height=crop_height,
    )
    crop_page.merge_transformed_page(
        source_page,
        Transformation().translate(-x0, -lower_y),
        over=True,
        expand=False,
    )
    crop_page.mediabox.lower_left = (0, 0)
    crop_page.mediabox.upper_right = (crop_width, crop_height)
    crop_page.cropbox.lower_left = (0, 0)
    crop_page.cropbox.upper_right = (crop_width, crop_height)
    crop_page.trimbox.lower_left = (0, 0)
    crop_page.trimbox.upper_right = (crop_width, crop_height)
    crop_page.bleedbox.lower_left = (0, 0)
    crop_page.bleedbox.upper_right = (crop_width, crop_height)
    crop_page.artbox.lower_left = (0, 0)
    crop_page.artbox.upper_right = (crop_width, crop_height)
    return crop_page, crop_width, crop_height


def build_cropped_pdf(
    source_path: Path,
    certificates: list[dict[str, Any]],
) -> bytes:
    if not certificates:
        raise PdfExtractionError("切り抜く利用証明書が選択されていません。")

    try:
        from copy import deepcopy

        from pypdf import PdfReader, PdfWriter, Transformation
    except ImportError as exc:
        raise PdfExtractionError(
            "PDF切り抜き機能に必要なライブラリが未設定です。NASではContainer Managerで「構築」を実行してください。PC版ではsetup.batを実行してください。"
        ) from exc

    try:
        reader = PdfReader(str(source_path))
        if reader.is_encrypted:
            reader.decrypt("")
        writer = PdfWriter()
        writer.pdf_header = "%PDF-1.4"

        page_width = 842.0
        page_height = 595.0
        margin = 24.0
        horizontal_gap = 10.0
        vertical_gap = 12.0
        columns = 5
        rows = 2
        per_page = columns * rows

        for page_start in range(0, len(certificates), per_page):
            page_certificates = certificates[page_start : page_start + per_page]
            slot_width = (
                page_width - (margin * 2) - (horizontal_gap * (columns - 1))
            ) / columns
            slot_height = (
                page_height - (margin * 2) - (vertical_gap * (rows - 1))
            ) / rows
            output_page = writer.add_blank_page(
                width=page_width,
                height=page_height,
            )

            for index, certificate in enumerate(page_certificates):
                source_page = deepcopy(
                    reader.pages[int(certificate["page"]) - 1]
                )
                normalized = _normalized_certificate_page(source_page, certificate)
                if normalized is None:
                    continue
                crop_page, crop_width, crop_height = normalized

                column = index % columns
                row = index // columns
                slot_x = margin + column * (slot_width + horizontal_gap)
                slot_y = (
                    page_height
                    - margin
                    - ((row + 1) * slot_height)
                    - (row * vertical_gap)
                )
                scale = min(
                    slot_width / crop_width,
                    slot_height / crop_height,
                )
                rendered_width = crop_width * scale
                rendered_height = crop_height * scale
                destination_x = slot_x + (slot_width - rendered_width) / 2
                destination_y = slot_y + (slot_height - rendered_height) / 2
                transformation = Transformation(
                    ctm=(
                        scale,
                        0,
                        0,
                        scale,
                        destination_x,
                        destination_y,
                    )
                )
                output_page.merge_transformed_page(
                    crop_page,
                    transformation,
                    over=True,
                    expand=False,
                )

            output_page.compress_content_streams()

        writer.compress_identical_objects()
        writer.add_metadata(
            {
                "/Title": "ETC certificates",
                "/Subject": f"{len(certificates)} certificates",
            }
        )
        output = BytesIO()
        writer.write(output)
        return output.getvalue()
    except Exception as exc:
        raise PdfExtractionError("選択した利用証明書を切り抜けませんでした。") from exc


def _format_submission_date(value: str) -> str:
    if not value:
        return ""
    normalized = str(value).replace("-", "/")
    return normalized


def _submission_font_path() -> Path | None:
    candidates = [
        Path(__file__).resolve().parent / "static" / "fonts" / "NotoSansJP-VF.ttf",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansJP-Regular.otf"),
        Path("C:/Windows/Fonts/NotoSansJP-VF.ttf"),
        Path("C:/Windows/Fonts/meiryo.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _load_submission_font(size: int, *, bold: bool = False) -> Any:
    from PIL import ImageFont

    font_path = _submission_font_path()
    if font_path:
        try:
            return ImageFont.truetype(str(font_path), size=size)
        except OSError:
            pass
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def _draw_text_fit(
    draw: Any,
    xy: tuple[int, int],
    text: Any,
    font: Any,
    fill: tuple[int, int, int],
    max_width: int,
) -> None:
    value = str(text or "")
    if not value:
        return
    suffix = "…"
    while value:
        bbox = draw.textbbox(xy, value, font=font)
        if bbox[2] - bbox[0] <= max_width:
            draw.text(xy, value, font=font, fill=fill)
            return
        value = value[:-1]
    draw.text(xy, suffix, font=font, fill=fill)


def _item_submission_date(item: dict[str, Any], fallback: str) -> str:
    csv_record = item.get("csv_record") or {}
    return _format_submission_date(
        str(item.get("date") or csv_record.get("date_start") or fallback or "")
    )


def _submission_blocks(
    items: list[dict[str, Any]],
    *,
    date_from: str,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    order: list[str] = []
    for item in items:
        work_number = str(item.get("work_number") or "作業番号未設定").strip()
        if work_number not in grouped:
            grouped[work_number] = []
            order.append(work_number)
        grouped[work_number].append(item)

    blocks: list[dict[str, Any]] = []
    max_per_block = 3
    block_number = 1
    for work_number in order:
        group_items = grouped[work_number]
        parts = (len(group_items) + max_per_block - 1) // max_per_block
        for part_index, start in enumerate(range(0, len(group_items), max_per_block), start=1):
            chunk = group_items[start : start + max_per_block]
            dates = sorted(
                date for date in (_item_submission_date(item, date_from) for item in chunk) if date
            )
            label = work_number
            if parts > 1:
                label = f"{work_number} ({part_index}/{parts})"
            blocks.append(
                {
                    "number": block_number,
                    "work_number": label,
                    "date": dates[0] if dates else _format_submission_date(date_from),
                    "items": chunk,
                    "amount": sum(int(item.get("fee", 0) or 0) for item in chunk),
                }
            )
            block_number += 1
    return blocks


def _submission_layout() -> dict[str, float]:
    page_width = 842.0
    page_height = 595.0
    margin = 24.0
    title_height = 54.0
    footer_height = 26.0
    block_gap_x = 18.0
    block_gap_y = 18.0
    block_columns = 2
    block_rows = 2
    block_width = (
        page_width - (margin * 2) - (block_gap_x * (block_columns - 1))
    ) / block_columns
    block_height = (
        page_height
        - (margin * 2)
        - title_height
        - footer_height
        - (block_gap_y * (block_rows - 1))
    ) / block_rows
    return {
        "page_width": page_width,
        "page_height": page_height,
        "margin": margin,
        "title_height": title_height,
        "footer_height": footer_height,
        "block_gap_x": block_gap_x,
        "block_gap_y": block_gap_y,
        "block_columns": float(block_columns),
        "block_rows": float(block_rows),
        "blocks_per_page": float(block_columns * block_rows),
        "block_width": block_width,
        "block_height": block_height,
        "header_height": 32.0,
    }


def _block_position(layout: dict[str, float], index: int) -> tuple[float, float]:
    columns = int(layout["block_columns"])
    column = index % columns
    row = index // columns
    block_x = layout["margin"] + column * (layout["block_width"] + layout["block_gap_x"])
    block_y = (
        layout["page_height"]
        - layout["margin"]
        - layout["title_height"]
        - ((row + 1) * layout["block_height"])
        - (row * layout["block_gap_y"])
    )
    return block_x, block_y


def _submission_overlay_image(
    page_blocks: list[dict[str, Any]],
    *,
    page_number: int,
    total_pages: int,
    total_items: int,
    total_amount: int,
    title: str,
    technician: str,
    date_from: str,
    date_to: str,
    layout: dict[str, float],
    scale: int = 2,
) -> bytes:
    from PIL import Image, ImageDraw

    page_width = int(layout["page_width"] * scale)
    page_height = int(layout["page_height"] * scale)
    image = Image.new("RGB", (page_width, page_height), "white")
    draw = ImageDraw.Draw(image)

    navy = (9, 31, 42)
    teal = (31, 181, 169)
    line = (191, 208, 216)
    ink = (15, 34, 47)
    muted = (88, 108, 119)
    amber = (255, 247, 231)
    receipt_bg = (255, 255, 255)
    receipt_line = (226, 232, 236)

    font_title = _load_submission_font(20 * scale, bold=True)
    font_sub = _load_submission_font(9 * scale)
    font_block = _load_submission_font(10 * scale, bold=True)
    font_block_small = _load_submission_font(8 * scale)
    font_label = _load_submission_font(7 * scale, bold=True)

    def px(value: float) -> int:
        return int(round(value * scale))

    def draw_centered_text(
        box: tuple[int, int, int, int],
        text: Any,
        font: Any,
        fill: tuple[int, int, int] | str,
    ) -> None:
        value = str(text or "")
        bbox = draw.textbbox((0, 0), value, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = box[0] + ((box[2] - box[0] - text_width) / 2) - bbox[0]
        y = box[1] + ((box[3] - box[1] - text_height) / 2) - bbox[1]
        draw.text((int(round(x)), int(round(y))), value, font=font, fill=fill)

    margin = layout["margin"]
    header_y = margin
    draw.rounded_rectangle(
        [
            px(margin),
            px(header_y),
            px(layout["page_width"] - margin),
            px(header_y + 36),
        ],
        radius=px(8),
        fill=navy,
    )
    draw.text((px(margin + 14), px(header_y + 7)), "提出用 ETC 明細シート", font=font_title, fill="white")
    period = (
        f"{_format_submission_date(date_from)} ～ {_format_submission_date(date_to)}"
        if date_from or date_to
        else ""
    )
    summary = f"{period}　{total_items}枚　合計 ¥{total_amount:,}"
    _draw_text_fit(
        draw,
        (px(layout["page_width"] - margin - 270), px(header_y + 12)),
        summary,
        font_sub,
        (211, 245, 240),
        px(255),
    )
    subline = "　".join(value for value in [str(title).strip(), str(technician).strip()] if value)
    if subline:
        _draw_text_fit(
            draw,
            (px(margin + 14), px(header_y + 40)),
            subline,
            font_sub,
            muted,
            px(layout["page_width"] - (margin * 2) - 28),
        )

    for index, block in enumerate(page_blocks):
        block_x, pdf_block_y = _block_position(layout, index)
        block_w = layout["block_width"]
        block_h = layout["block_height"]
        block_y = layout["page_height"] - pdf_block_y - block_h
        header_h = layout["header_height"]
        draw.rounded_rectangle(
            [px(block_x), px(block_y), px(block_x + block_w), px(block_y + block_h)],
            radius=px(10),
            fill=(255, 255, 255),
            outline=line,
            width=max(1, px(1)),
        )
        draw.rounded_rectangle(
            [
                px(block_x),
                px(block_y),
                px(block_x + block_w),
                px(block_y + header_h),
            ],
            radius=px(10),
            fill=navy,
        )
        draw.rectangle(
            [
                px(block_x),
                px(block_y + header_h - 10),
                px(block_x + block_w),
                px(block_y + header_h),
            ],
            fill=navy,
        )
        number_size = 25
        number_box = (
            px(block_x + 7),
            px(block_y + 3.5),
            px(block_x + 7 + number_size),
            px(block_y + 3.5 + number_size),
        )
        draw.ellipse(
            number_box,
            fill=teal,
            outline=(191, 247, 241),
            width=max(1, px(1)),
        )
        draw_centered_text(number_box, str(block["number"]), font_block_small, "white")
        header_text = (
            f"日付 {block['date']}　作業番号 {block['work_number']}　"
            f"技術員 {technician or '-'}"
        )
        _draw_text_fit(
            draw,
            (px(block_x + 40), px(block_y + 8)),
            header_text,
            font_block_small,
            "white",
            px(block_w - 48),
        )
        draw.rounded_rectangle(
            [
                px(block_x + 10),
                px(block_y + block_h - 26),
                px(block_x + block_w - 10),
                px(block_y + block_h - 8),
            ],
            radius=px(6),
            fill=amber,
        )
        draw.text(
            (px(block_x + 16), px(block_y + block_h - 22)),
            f"明細 {len(block['items'])}枚",
            font=font_label,
            fill=muted,
        )
        amount_text = f"¥{int(block['amount']):,}"
        draw.text(
            (px(block_x + block_w - 86), px(block_y + block_h - 22)),
            amount_text,
            font=font_block,
            fill=ink,
        )

        item_count = max(1, len(block["items"]))
        cert_gap = 8.0
        content_x = block_x + 11
        content_y = block_y + header_h + 17
        content_width = block_w - 22
        content_height = block_h - header_h - 49
        cell_width = (content_width - cert_gap * (item_count - 1)) / item_count
        for item_index in range(item_count):
            cell_x = content_x + item_index * (cell_width + cert_gap)
            draw.rounded_rectangle(
                [
                    px(cell_x),
                    px(content_y - 11),
                    px(cell_x + cell_width),
                    px(content_y + content_height + 3),
                ],
                radius=px(6),
                fill=receipt_bg,
                outline=receipt_line,
                width=max(1, px(1)),
            )
            draw.text(
                (px(cell_x + 5), px(content_y - 8)),
                f"ETC {item_index + 1}",
                font=font_label,
                fill=teal,
            )

    footer = f"{page_number} / {total_pages} ページ"
    draw.text((px(margin), px(layout["page_height"] - margin + 4)), footer, font=font_sub, fill=muted)
    return_image = BytesIO()
    image.save(return_image, format="PNG", optimize=True)
    return return_image.getvalue()


def _image_xobject(writer: Any, image_bytes: bytes) -> tuple[Any, int, int]:
    from PIL import Image
    from pypdf.generic import DecodedStreamObject, NameObject, NumberObject

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    stream = DecodedStreamObject()
    stream.set_data(zlib.compress(image.tobytes()))
    stream.update(
        {
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(width),
            NameObject("/Height"): NumberObject(height),
            NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
            NameObject("/BitsPerComponent"): NumberObject(8),
            NameObject("/Filter"): NameObject("/FlateDecode"),
        }
    )
    return writer._add_object(stream), width, height


def _add_image_to_page(
    writer: Any,
    page: Any,
    image_ref: Any,
    image_name: str,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject

    resources = page.get(NameObject("/Resources"))
    if resources is None:
        resources = DictionaryObject()
        page[NameObject("/Resources")] = resources
    else:
        resources = resources.get_object()
    xobjects = resources.get(NameObject("/XObject"))
    if xobjects is None:
        xobjects = DictionaryObject()
        resources[NameObject("/XObject")] = xobjects
    else:
        xobjects = xobjects.get_object()
    xobjects[NameObject(f"/{image_name}")] = image_ref

    stream = DecodedStreamObject()
    stream.set_data(
        (
            "q\n"
            f"{width:.4f} 0 0 {height:.4f} {x:.4f} {y:.4f} cm\n"
            f"/{image_name} Do\n"
            "Q\n"
        ).encode("ascii")
    )
    stream_ref = writer._add_object(stream)
    existing = page.get(NameObject("/Contents"))
    if existing is None:
        page[NameObject("/Contents")] = stream_ref
    elif isinstance(existing, ArrayObject):
        existing.insert(0, stream_ref)
    else:
        page[NameObject("/Contents")] = ArrayObject([stream_ref, existing])


def build_submission_pdf(
    items: list[dict[str, Any]],
    *,
    title: str = "",
    technician: str = "",
    date_from: str = "",
    date_to: str = "",
) -> bytes:
    if not items:
        raise PdfExtractionError("提出用PDFに入れる利用証明書が選択されていません。")

    try:
        from copy import deepcopy

        from PIL import Image  # noqa: F401
        from pypdf import PdfReader, PdfWriter, Transformation
    except ImportError as exc:
        raise PdfExtractionError(
            "提出PDF作成機能に必要なPDF・画像ライブラリが未設定です。NASではContainer Managerで「構築」を実行してください。PC版ではsetup.batを実行してください。"
        ) from exc

    try:
        writer = PdfWriter()
        readers: dict[Path, PdfReader] = {}
        layout = _submission_layout()
        blocks = _submission_blocks(items, date_from=date_from)
        blocks_per_page = int(layout["blocks_per_page"])
        total_pages = max(1, (len(blocks) + blocks_per_page - 1) // blocks_per_page)
        total_amount = sum(int(item.get("fee", 0) or 0) for item in items)

        for page_number, page_start in enumerate(
            range(0, len(blocks), blocks_per_page),
            start=1,
        ):
            page_blocks = blocks[page_start : page_start + blocks_per_page]
            output_page = writer.add_blank_page(
                width=layout["page_width"],
                height=layout["page_height"],
            )
            overlay_bytes = _submission_overlay_image(
                page_blocks,
                page_number=page_number,
                total_pages=total_pages,
                total_items=len(items),
                total_amount=total_amount,
                title=title,
                technician=technician,
                date_from=date_from,
                date_to=date_to,
                layout=layout,
            )
            image_ref, _, _ = _image_xobject(writer, overlay_bytes)
            _add_image_to_page(
                writer,
                output_page,
                image_ref,
                f"Submission{page_number}",
                x=0,
                y=0,
                width=layout["page_width"],
                height=layout["page_height"],
            )

            for block_index, block in enumerate(page_blocks):
                block_x, block_y = _block_position(layout, block_index)
                block_items = block["items"]
                item_count = max(1, len(block_items))
                cert_gap = 8.0
                content_x = block_x + 11
                content_y = block_y + layout["header_height"] + 17
                content_width = layout["block_width"] - 22
                content_height = layout["block_height"] - layout["header_height"] - 49
                cell_width = (
                    content_width - cert_gap * (item_count - 1)
                ) / item_count
                cell_height = content_height

                for index, item in enumerate(block_items):
                    source_path = Path(item["source_path"]).resolve()
                    if source_path not in readers:
                        reader = PdfReader(str(source_path))
                        if reader.is_encrypted:
                            reader.decrypt("")
                        readers[source_path] = reader
                    reader = readers[source_path]

                    source_page = deepcopy(reader.pages[int(item["page"]) - 1])
                    normalized = _normalized_certificate_page(source_page, item)
                    if normalized is None:
                        continue
                    crop_page, crop_width, crop_height = normalized

                    slot_x = content_x + index * (cell_width + cert_gap)
                    slot_y = content_y
                    scale = min(
                        cell_width / crop_width,
                        cell_height / crop_height,
                    )
                    rendered_width = crop_width * scale
                    rendered_height = crop_height * scale
                    destination_x = slot_x + (cell_width - rendered_width) / 2
                    destination_y = slot_y + (cell_height - rendered_height) / 2
                    transformation = Transformation(
                        ctm=(
                            scale,
                            0,
                            0,
                            scale,
                            destination_x,
                            destination_y,
                        )
                    )
                    output_page.merge_transformed_page(
                        crop_page,
                        transformation,
                        over=True,
                        expand=False,
                    )

        writer.add_metadata(
            {
                "/Title": "ETC submission PDF",
                "/Subject": f"{len(items)} ETC certificates",
            }
        )
        output = BytesIO()
        writer.write(output)
        return output.getvalue()
    except Exception as exc:
        raise PdfExtractionError("提出用PDFを作成できませんでした。") from exc
