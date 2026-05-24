import io as sio
import logging
import re
from PIL import Image, ImageOps

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from surya.recognition import RecognitionPredictor
from surya.detection import DetectionPredictor
from surya.foundation import FoundationPredictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="SBA OCR Service - Surya")


def normalize_weight_text(text: str) -> str:
    """Join <br> sub-rows and replace . and - between digits with +."""
    segments = re.split(r'\s*<br>\s*', text)
    out = []
    for seg in segments:
        seg = re.sub(r'(\d)\s*[.\-]\s*(\d)', r'\1+\2', seg)
        seg = seg.rstrip('. ').strip()
        if seg:
            out.append(seg)
    result = '+'.join(out)
    result = re.sub(r'\++', '+', result)
    return result.strip('+').strip()


def is_price(text: str) -> bool:
    return bool(re.match(r'^\d+[.,\-](000|500)$', text.strip()))


def is_pure_number(text: str) -> bool:
    clean = re.sub(r'<br>', ' ', text)
    return bool(re.match(r'^[\d\s.,\-]+$', clean.strip()))


# Grade range patterns: "300-500", "500-900", "1UP", "1-UP", "3UP", "2UP", "HIS"
_GRADE_TEXT_RE = re.compile(
    r'^\d+\s*[-–]\s*\d+$'             # "300-500", "500-900"
    r'|^\d+\s*(UP|up)$'               # "1UP", "3UP"
    r'|^\d+\s*[-–]\s*(UP|up)$'        # "1-UP"
    r'|^(HIS|his)$'                   # "HIS" standalone
    r'|^\d+[-–]\d{2,}$',              # "1-49" OCR misread of "1UP"
    re.IGNORECASE,
)


def _is_grade_text(text: str) -> bool:
    return bool(_GRADE_TEXT_RE.match(text.strip()))


def _normalise_grade(text: str) -> str:
    """Clean up OCR grade text into a canonical form.

    Fixes common OCR misreads on sortir forms:
      "1-49" → "1UP"   (low-res "UP" read as digits)
      "2-08" → "2UP"
      "3-1110" → "3UP"
      "1-00"  → "1UP"
      "500 -900" → "500-900"  (space around dash)
      ",200-300" → "200-300"  (leading comma OCR noise)
    """
    t = text.strip().lstrip(',').strip()
    # Normalise spaces around dash: "500 - 900" → "500-900"
    t = re.sub(r'\s*[-–]\s*', '-', t)
    # Detect "NUP" OCR misreads: "N-XX" where XX is 2–4 digits all different from weight range
    # Weight ranges: both sides are 3-digit numbers (100-999)
    # Grade "NUP": left side is 1–2 digits, right side <= 2 digits or looks like noise
    m = re.match(r'^(\d{1,2})-(\d{1,4})$', t)
    if m:
        left, right = m.group(1), m.group(2)
        # If right side < 10 or is clearly not a weight value (< 100), treat as NUP
        if int(right) < 100:
            return f"{left}UP"
    return t


def _clean_number(text: str) -> str:
    """Strip trailing noise (=, ;, -, kg) from a weight/total OCR token."""
    t = text.strip()
    t = re.sub(r'\s*[kK][gG]$', '', t)
    t = re.sub(r'[\s=;~\-]+$', '', t)
    return t.strip()


def _is_number_like(text: str) -> bool:
    """Text starts with digits — tolerates trailing noise like '725 =' or '77kg'."""
    return bool(re.match(r'^\d[\d.,]*', text.strip()))


logger.info("Loading Surya models...")
foundation_predictor = FoundationPredictor()
rec_predictor = RecognitionPredictor(foundation_predictor)
det_predictor = DetectionPredictor()
logger.info("Surya models loaded.")


@app.get("/health")
def health():
    return {"status": "ok"}


_TIMBANGAN_KW = re.compile(r'\bTIMBANGAN\b|\bKAPAL\b|\bTRANSPORT\b', re.IGNORECASE)
# Raw timbangan fish codes: short all-caps, no parens
_FISH_CODE_RE = re.compile(r'^[A-Z0-9]([A-Z0-9 ]{0,10}[A-Z0-9])?$')
# Sortir fish-code cells: e.g. "BDR (SF)", "SIM (SP)", "CKL (PC)", "BP12 (SF)"
# Also matches empty-category synthetic anchors: "SIM HIS ()"
# First char must be alpha; rest can be alphanumeric (handles OCR noise like "BP12")
_SORTIR_CODE_RE = re.compile(r'^([A-Z][A-Z0-9 ]{1,9})\s*\(([A-Z]{0,3})\)$')

# Matches a single CODE (CAT) token anywhere in a string — used to split merged lines
_SORTIR_TOKEN_RE = re.compile(r'([A-Z][A-Z0-9 ]{1,9}?)\s*\(([A-Z]{2,3})\)')

# Known category strings (for fuzzy/no-paren fallback matching)
_KNOWN_CATS = {'SF', 'SP', 'PC'}


def _is_fish_code_candidate(text: str) -> bool:
    t = text.strip()
    return (
        len(t) <= 12
        and bool(_FISH_CODE_RE.match(t))
        and not is_pure_number(t)
        and not is_price(t)
    )


def _is_sortir_code_candidate(text: str) -> bool:
    return bool(_SORTIR_CODE_RE.match(text.strip()))


def _expand_merged_sortir_lines(lines):
    """Return an expanded line list where merged anchor tokens are split.

    Some OCR lines contain multiple CODE (CAT) tokens squeezed into one
    bbox (e.g. "SIM (SP) SIM (SF)") or garbled variants (e.g. "SIM his,,
    SIM (SE)" for "SLM HIS (SF)", "WCKL CPC" for "CKL (PC)").

    Strategy:
    1. If a line already matches a single clean token → keep as-is.
    2. If a line contains ≥2 token matches → split into synthetic lines,
       distributing the bbox X range evenly.
    3. Try a no-paren fallback: "WCKL CPC" → strip noise, extract CODE + CAT.
    4. Fuzzy fallback for garbled lines that contain a known category string:
       "SIM his,, SIM (SE)" → emit "SIM HIS (SF)" using the captured CAT
       with fuzzy normalisation of "SE" → "SF".
    """
    result = []
    for line in lines:
        t = line["text"].strip()
        x1, y1, x2, y2 = line["bbox"]
        cx = (x1 + x2) / 2

        # 1. Already a clean single match → keep
        if _SORTIR_CODE_RE.match(t):
            result.append(line)
            continue

        # 2. Multiple CODE (CAT) tokens in one line → split
        tokens = _SORTIR_TOKEN_RE.findall(t)
        if len(tokens) >= 2:
            n = len(tokens)
            span = (x2 - x1) / n
            for i, (code, cat) in enumerate(tokens):
                code = code.strip()
                cat = _fuzzy_cat(cat)
                sx1 = x1 + i * span
                sx2 = x1 + (i + 1) * span
                result.append({
                    "text": f"{code} ({cat})",
                    "confidence": line["confidence"],
                    "bbox": [sx1, y1, sx2, y2],
                })
            continue

        # 3. No-paren fallback for lines like "WCKL CPC", "WCKL PC", "W CKL PC"
        # The last token may be an OCR-garbled category: "CPC"→PC, "CSF"→SF etc.
        t_up = t.upper()
        # Normalise garbled categories at end of string: C+CAT or CAT alone
        t_norm = re.sub(r'\bC(SF|SP|PC)\b', r'(\1)', t_up)
        t_norm = re.sub(r'\b(SF|SP|PC)\b', r'(\1)', t_norm)
        np_m = _SORTIR_CODE_RE.match(t_norm.strip())
        if not np_m:
            # try searching anywhere in normalised string
            np_m2 = re.search(r'([A-Z][A-Z0-9]{1,5})\s+\((SF|SP|PC)\)', t_norm)
            if np_m2:
                code = np_m2.group(1).strip()
                cat = np_m2.group(2)
                result.append({
                    "text": f"{code} ({cat})",
                    "confidence": line["confidence"] * 0.8,
                    "bbox": line["bbox"],
                })
                continue
        else:
            code = np_m.group(1).strip()
            cat = np_m.group(2)
            result.append({
                "text": f"{code} ({cat})",
                "confidence": line["confidence"] * 0.8,
                "bbox": line["bbox"],
            })
            continue

        # 4. Fuzzy fallback: handles garbled lines like "SIM his,, SIM (SE)"
        # Strategy: find all paren tokens in uppercased text, then check if a
        # non-paren prefix segment looks like its own separate fish code.
        t_upper = re.sub(r'[,\.]+', ' ', t.upper()).strip()
        fuzzy_tokens = list(re.finditer(r'([A-Z][A-Z0-9 ]{1,9}?)\s*\(([A-Z]{2,3})\)', t_upper))
        if fuzzy_tokens:
            synthetic = []
            # Check for a leading prefix before the FIRST paren token
            first_start = fuzzy_tokens[0].start()
            prefix_raw = t_upper[:first_start].strip()
            # Clean prefix: keep only uppercase alpha/space, collapse spaces
            prefix = re.sub(r'[^A-Z ]', ' ', prefix_raw).strip()
            prefix = re.sub(r'\s+', ' ', prefix).strip()
            if prefix and re.match(r'^[A-Z]{2,6}( [A-Z]{2,6})?$', prefix):
                synthetic.append((prefix, ''))
            for m in fuzzy_tokens:
                synthetic.append((m.group(1).strip(), _fuzzy_cat(m.group(2))))
            n = len(synthetic)
            span = (x2 - x1) / max(n, 1)
            for i, (code, cat) in enumerate(synthetic):
                sx1 = x1 + i * span
                sx2 = x1 + (i + 1) * span
                result.append({
                    "text": f"{code} ({cat})",
                    "confidence": line["confidence"] * 0.7,
                    "bbox": [sx1, y1, sx2, y2],
                })
            continue

        # Not an anchor line — pass through unchanged
        result.append(line)

    return result


def _fuzzy_cat(cat: str) -> str:
    """Normalise OCR-garbled category strings to SF/SP/PC, or '' if uncertain."""
    c = cat.upper().strip()
    if c in ('SE', 'SG', 'SH', 'SI', 'SA', 'SB', 'SC', 'SK', 'SL', 'SM', 'SN'):
        return 'SF'
    if c == 'SP':
        return 'SP'
    if c in ('PC', 'PO', 'RC', 'FC'):
        return 'PC'
    # Return the known cat as-is, or empty string — never default to SF
    return c if c in _KNOWN_CATS else ''


def _detect_form_type(lines, w, h):
    """Return ('timbangan'|'sortir'|'simple', best_band_y, anchor_lines).

    For sortir forms, anchor_lines contains ALL sortir-code tokens across
    all horizontal bands (SF section + PC section, etc.), not just the
    densest single band — so every column is captured.

    Merged/garbled anchor lines are expanded first via _expand_merged_sortir_lines.
    """
    has_timbangan_kw = any(_TIMBANGAN_KW.search(l["text"]) for l in lines)
    if not has_timbangan_kw:
        return 'simple', None, []

    band_h = h * 0.06

    # Expand merged OCR lines ("SIM (SP) SIM (SF)" → two tokens) before detection
    expanded = _expand_merged_sortir_lines(lines)

    # Collect all distinct sortir anchor bands (each band = one row of CODE (CAT) headers)
    used_ids = set()
    all_sortir_anchors = []
    candidates = sorted(
        [l for l in expanded if _is_sortir_code_candidate(l["text"])],
        key=lambda l: (l["bbox"][1] + l["bbox"][3]) / 2,
    )
    for seed in candidates:
        if id(seed) in used_ids:
            continue
        seed_cy = (seed["bbox"][1] + seed["bbox"][3]) / 2
        band = [
            l for l in expanded
            if abs((l["bbox"][1] + l["bbox"][3]) / 2 - seed_cy) <= band_h / 2
            and _is_sortir_code_candidate(l["text"])
            and id(l) not in used_ids
        ]
        if len(band) >= 2:
            for l in band:
                used_ids.add(id(l))
            all_sortir_anchors.extend(band)

    if len(all_sortir_anchors) >= 3:
        best_band_y = (all_sortir_anchors[0]["bbox"][1] + all_sortir_anchors[0]["bbox"][3]) / 2
        # Return expanded lines too — _build_sortir_output needs them for column grouping
        return 'sortir', best_band_y, all_sortir_anchors, expanded

    # Fall through to raw timbangan detection
    best_band_y, best_count = None, 0
    for line in lines:
        cy = (line["bbox"][1] + line["bbox"][3]) / 2
        count = sum(
            1 for l in lines
            if abs((l["bbox"][1] + l["bbox"][3]) / 2 - cy) <= band_h / 2
            and _is_fish_code_candidate(l["text"])
        )
        if count > best_count:
            best_count = count
            best_band_y = cy

    if best_count >= 4:
        fish_code_lines = [
            l for l in lines
            if best_band_y is not None
            and abs((l["bbox"][1] + l["bbox"][3]) / 2 - best_band_y) <= band_h / 2
            and _is_fish_code_candidate(l["text"])
        ]
        return 'timbangan', best_band_y, fish_code_lines

    return 'simple', None, []


def _build_timbangan_output(lines, fish_code_lines, best_band_y, w, h):
    """Reconstruct timbangan table into KODE|HARGA|BATCH|TOTAL rows."""
    band_h = h * 0.06
    col_tolerance = w * 0.025
    assigned_ids = set()
    fish_columns = []

    for anchor in sorted(fish_code_lines, key=lambda l: l["bbox"][0]):
        anchor_cx = (anchor["bbox"][0] + anchor["bbox"][2]) / 2
        col_lines = []
        for l in lines:
            cx = (l["bbox"][0] + l["bbox"][2]) / 2
            if abs(cx - anchor_cx) <= col_tolerance and id(l) not in assigned_ids:
                col_lines.append(l)
                assigned_ids.add(id(l))
        col_lines.sort(key=lambda l: l["bbox"][1])
        fish_columns.append({"fish_code_text": anchor["text"], "cx": anchor_cx, "lines": col_lines})

    fish_rows = []
    for col in fish_columns:
        col_lines = col["lines"]
        fish_code = col["fish_code_text"]
        price = next((l["text"] for l in col_lines if is_price(l["text"])), "")

        num_lines = sorted(
            [l for l in col_lines if is_pure_number(l["text"]) and not is_price(l["text"])],
            key=lambda l: l["bbox"][1]
        )

        if not num_lines:
            batch_list, total = [], ""
        elif len(num_lines) == 1:
            batch_list, total = [], num_lines[0]["text"].strip()
        else:
            gaps = []
            for i in range(1, len(num_lines)):
                prev_y2 = num_lines[i-1]["bbox"][3]
                curr_y1 = num_lines[i]["bbox"][1]
                gaps.append((curr_y1 - prev_y2, i))
            gap_threshold = h * 0.10
            split_idx = None
            for gap_size, idx in sorted(gaps, key=lambda g: g[1]):
                if gap_size > gap_threshold:
                    split_idx = idx
                    break

            if split_idx is not None:
                batch_list = [l["text"] for l in num_lines[:split_idx]]
                total = num_lines[split_idx]["text"].strip()
            else:
                batch_list = [l["text"] for l in num_lines[:-1]]
                total = num_lines[-1]["text"].strip()

        batches_str = "+".join(normalize_weight_text(b) for b in batch_list)
        fish_rows.append({
            "fish_code": fish_code,
            "price": price,
            "batches": batches_str,
            "total": total,
        })

    sb = sio.StringIO()
    sb.write("=== HEADER ===\n")
    header_kws = ["TIMBANGAN", "TGL", "KAPAL", "TRANSPORT", "PT.", "Jl.", "Sarudik", "BAHARI"]
    for l in lines:
        if best_band_y and (l["bbox"][1] + l["bbox"][3]) / 2 < best_band_y - band_h:
            if any(kw in l["text"] for kw in header_kws):
                sb.write(l["text"] + "\n")
    sb.write("\n")

    sb.write("=== TABEL IKAN (KODE | HARGA | BATCH | TOTAL) ===\n")
    for row in fish_rows:
        sb.write(f"{row['fish_code']} | {row['price']} | {row['batches']} | {row['total']}\n")
    sb.write("\n")

    for l in lines:
        t = l["text"]
        if "Total" in t or "gudang" in t or "Gudang" in t:
            sb.write(t.replace("<br>", "\n") + "\n")

    table_columns = [
        {"col_index": i, "items": [{"text": l["text"], "confidence": l["confidence"]} for l in col["lines"]]}
        for i, col in enumerate(fish_columns)
    ]
    return sb.getvalue(), table_columns


def _group_anchors_into_bands(anchor_lines, band_h):
    """Cluster anchor lines into horizontal bands (one per section, e.g. SF row, PC row)."""
    sorted_anchors = sorted(anchor_lines, key=lambda l: (l["bbox"][1] + l["bbox"][3]) / 2)
    bands = []
    for anchor in sorted_anchors:
        cy = (anchor["bbox"][1] + anchor["bbox"][3]) / 2
        placed = False
        for band in bands:
            band_cy = sum((a["bbox"][1] + a["bbox"][3]) / 2 for a in band) / len(band)
            if abs(cy - band_cy) <= band_h:
                band.append(anchor)
                placed = True
                break
        if not placed:
            bands.append([anchor])
    return bands  # list of lists, each sorted left→right


def _build_sortir_output(lines, anchor_lines, best_band_y, w, h):
    """Build structured text for sortir timbangan.

    Each horizontal anchor band (SF section, PC section) is processed
    independently so that columns at the same X position in different
    sections don't steal each other's lines.

    Per column:
      - grade  = first _is_grade_text token immediately below the anchor row
      - total  = last _is_number_like token before the NEXT anchor band (or page bottom)
    """
    band_h = h * 0.06
    col_tolerance = w * 0.03   # slightly wider than timbangan to tolerate print shift

    # Cluster anchors into separate horizontal bands (SF row / PC row / …)
    anchor_bands = _group_anchors_into_bands(anchor_lines, band_h)

    # Compute the Y range that belongs to each band:
    # band[i] owns lines from just below its anchor row down to just above band[i+1]
    band_cys = []
    for band in anchor_bands:
        band_cys.append(sum((a["bbox"][1] + a["bbox"][3]) / 2 for a in band) / len(band))

    columns = []

    for band_idx, band in enumerate(anchor_bands):
        # Y window: from anchor row down to next anchor band (or page bottom)
        y_start = band_cys[band_idx] - band_h / 2
        y_end = band_cys[band_idx + 1] - band_h / 2 if band_idx + 1 < len(anchor_bands) else h
        # Lines that belong to this band's Y slice
        band_lines = [l for l in lines if y_start <= (l["bbox"][1] + l["bbox"][3]) / 2 < y_end]

        assigned_ids = set(id(a) for a in band)  # anchors themselves don't need re-assignment

        for anchor in sorted(band, key=lambda l: l["bbox"][0]):
            anchor_cx = (anchor["bbox"][0] + anchor["bbox"][2]) / 2
            anchor_cy = (anchor["bbox"][1] + anchor["bbox"][3]) / 2

            # Collect lines in this band's Y window whose X aligns with anchor
            col_lines = []
            for l in band_lines:
                cx = (l["bbox"][0] + l["bbox"][2]) / 2
                if abs(cx - anchor_cx) <= col_tolerance and id(l) not in assigned_ids:
                    col_lines.append(l)
                    assigned_ids.add(id(l))
            col_lines.sort(key=lambda l: l["bbox"][1])

            # Parse anchor text: "BDR (SF)" → source_code=BDR, category=SF
            m = _SORTIR_CODE_RE.match(anchor["text"].strip())
            source_code = m.group(1).strip() if m else anchor["text"].strip()
            category = m.group(2) if m else ""

            # Grade: first _is_grade_text token strictly below the anchor's bottom edge
            anchor_bottom = anchor["bbox"][3]
            grade_raw = ""
            for l in col_lines:
                if l["bbox"][1] <= anchor_bottom:
                    continue  # overlaps or above anchor row
                if _is_grade_text(l["text"]):
                    grade_raw = l["text"].strip()
                    break

            grade_size = _normalise_grade(grade_raw)

            # Total: the LARGEST single number-like token in the column that is
            # NOT a grade, NOT a tally run (len > 5 when no separators), NOT price.
            # Largest by numeric value ≈ the actual weight total.
            num_candidates = []
            for l in col_lines:
                t = l["text"].strip()
                if not _is_number_like(t):
                    continue
                if is_price(t) or _is_grade_text(t):
                    continue
                cleaned = _clean_number(t)
                # Reject tally-mark misreads: repetitive digit runs "1111", "11111"
                if re.match(r'^(\d)\1{3,}$', cleaned.replace('.', '').replace(',', '')):
                    continue
                try:
                    val = float(cleaned.replace('.', '').replace(',', '.'))
                except ValueError:
                    continue
                num_candidates.append((val, cleaned))

            # Pick the largest value — that's the column total
            total = max(num_candidates, key=lambda x: x[0])[1] if num_candidates else ""

            columns.append({
                "source_code": source_code,
                "category": category,
                "grade": grade_size,
                "total": total,
            })

    sb = sio.StringIO()

    # Header (above first anchor band)
    top_anchor_y = band_cys[0] if band_cys else best_band_y
    sb.write("=== HEADER ===\n")
    header_kws = ["TIMBANGAN", "TGL", "KAPAL", "TRANSPORT", "PT.", "Jl.", "Sarudik", "BAHARI"]
    for l in lines:
        if (l["bbox"][1] + l["bbox"][3]) / 2 < top_anchor_y - band_h:
            if any(kw in l["text"] for kw in header_kws):
                sb.write(l["text"] + "\n")
    sb.write("\n")

    sb.write("=== TABEL SORTIR (KODE | KATEGORI | GRADE | TOTAL) ===\n")
    for col in columns:
        sb.write(f"{col['source_code']} | {col['category']} | {col['grade']} | {col['total']}\n")
    sb.write("\n")

    # Grand total
    for l in lines:
        if re.search(r'GT\s*=|Grand\s*Total', l["text"], re.IGNORECASE):
            sb.write(l["text"].replace("<br>", "\n") + "\n")

    table_columns = [
        {"col_index": i, "items": [{"text": anchor_lines[i]["text"], "confidence": anchor_lines[i]["confidence"]}]}
        for i in range(len(columns))
    ]
    return sb.getvalue(), table_columns


def _build_simple_receipt_output(lines):
    """Output all lines as structured plain text for simple receipts (bon penjualan, bon pengeluaran)."""
    # Just emit all detected lines sorted top-to-bottom, clean of <br> inline joins
    sb = sio.StringIO()
    sb.write("=== RECEIPT OCR ===\n")
    for l in lines:
        text = l["text"].replace("<br>", "\n")
        sb.write(text + "\n")
    return sb.getvalue(), []


@app.post("/ocr")
async def run_ocr_endpoint(file: UploadFile = File(...)):
    if file.content_type and \
       not file.content_type.startswith("image/") and \
       file.content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {file.content_type}")

    try:
        contents = await file.read()
        image = Image.open(sio.BytesIO(contents))
        image = ImageOps.exif_transpose(image).convert("RGB")
        w, h = image.size
        logger.info("Image size: %dx%d", w, h)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read image: {e}")

    try:
        logger.info("Running Surya OCR on %dx%d image...", w, h)
        predictions = rec_predictor([image], det_predictor=det_predictor)
        page = predictions[0]

        lines = []
        for line in page.text_lines:
            if line.text.strip():
                bbox = line.bbox
                lines.append({
                    "text": line.text.strip(),
                    "confidence": round(float(line.confidence), 4),
                    "bbox": bbox,
                })

        lines.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))
        full_text = "\n".join(l["text"] for l in lines)

        detect_result = _detect_form_type(lines, w, h)
        if len(detect_result) == 4:
            form_type, best_band_y, anchor_lines, expanded_lines = detect_result
        else:
            form_type, best_band_y, anchor_lines = detect_result
            expanded_lines = lines
        logger.info("Document type: %s (anchor_count=%d)", form_type, len(anchor_lines))

        if form_type == 'timbangan':
            structured_text, table_columns = _build_timbangan_output(lines, anchor_lines, best_band_y, w, h)
        elif form_type == 'sortir':
            structured_text, table_columns = _build_sortir_output(expanded_lines, anchor_lines, best_band_y, w, h)
        else:
            structured_text, table_columns = _build_simple_receipt_output(lines)

        logger.info("Done: %d lines\nOutput:\n%s", len(lines), structured_text)

    except Exception as e:
        logger.exception("Surya OCR error")
        raise HTTPException(status_code=500, detail=f"OCR error: {e}")

    return JSONResponse({
        "text": structured_text,
        "full_text": full_text,
        "lines": lines,
        "table_columns": table_columns,
        "line_count": len(lines),
        "format": "structured",
    })
