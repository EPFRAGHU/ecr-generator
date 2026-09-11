"""
ECR Register & Generator — Flask backend.

Reproduces the logic of ECRfile_Template_v2_1.xlsm (Sheet1 formulas +
TEXTFILE / TEXTSUB macros) as HTTP endpoints, so the browser-side ledger
can generate the same #~#-delimited ECR / Exit text files EPFO expects.

No database — stateless, one session's worth of data per request, same
as the original Excel macro (open file, fill sheet, click button, get
a .txt file).
"""
from __future__ import annotations

import io
import re
from datetime import datetime

from flask import Flask, jsonify, render_template, request, send_file

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8MB upload cap

# ---------------------------------------------------------------------------
# Column auto-detection for uploaded Excel/CSV files
# ---------------------------------------------------------------------------
FIELD_SYNONYMS = {
    "uan": ["uan", "universal account number", "pf uan", "member uan"],
    "name": ["member name", "employee name", "name", "emp name"],
    "gross": ["gross wages", "gross wage", "gross salary", "gross"],
    "epf": ["epf wages", "epf wage", "pf wages", "basic wages", "epf basic"],
    "ncp": ["ncp days", "ncp", "lop days", "loss of pay days"],
    "refund": ["refund of advances", "refund", "advance refund", "refund advance"],
}
REQUIRED_FIELDS = ["uan", "name", "gross", "epf"]
OPTIONAL_FIELDS = ["ncp", "refund"]


def _normalize_header(h: str) -> str:
    return re.sub(r"\s+", " ", str(h).strip().lower())


def guess_mapping(headers: list[str]) -> dict[str, str | None]:
    normalized = {h: _normalize_header(h) for h in headers}
    mapping: dict[str, str | None] = {}
    for field, synonyms in FIELD_SYNONYMS.items():
        match = None
        for h, norm in normalized.items():
            if norm in synonyms:
                match = h
                break
        if match is None:
            for h, norm in normalized.items():
                if any(s in norm for s in synonyms):
                    match = h
                    break
        mapping[field] = match
    return mapping


# ---------------------------------------------------------------------------
# Core wage calculations (mirrors Sheet1's formulas)
# ---------------------------------------------------------------------------
def calc_row(gross, epf) -> dict:
    epf = float(epf or 0)
    eps_wages = 15000.0 if epf > 14999 else epf
    edli_wages = 15000.0 if epf > 14999 else epf
    epf_contri = round(epf * 0.12)
    eps_contri = round(eps_wages * 0.0833)
    diff = epf_contri - eps_contri
    return {
        "eps_wages": round(eps_wages),
        "edli_wages": round(edli_wages),
        "epf_contri": epf_contri,
        "eps_contri": eps_contri,
        "diff": diff,
    }


def validate_wage_row(row: dict) -> list[str]:
    issues = []
    uan = str(row.get("uan", "")).strip()
    if not re.fullmatch(r"\d{12}", uan):
        issues.append("UAN is not a 12-digit number")
    if not str(row.get("name", "")).strip():
        issues.append("Name is blank")
    try:
        gross = float(row.get("gross", 0))
        epf = float(row.get("epf", 0))
        if epf > gross:
            issues.append("EPF wages exceed gross wages")
    except (TypeError, ValueError):
        issues.append("Gross/EPF wages are not numeric")
    return issues


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload():
    """
    First call (no mapping): try to auto-detect columns; if all required
    fields are found, parse + return rows straight away. If not, return
    the headers + a guessed mapping so the browser can show a mapping
    step, then re-POST with `mapping` filled in (same file, resent).
    """
    import pandas as pd

    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded"}), 400

    filename = file.filename or ""
    try:
        if filename.lower().endswith((".xlsx", ".xlsm", ".xls")):
            df = pd.read_excel(file, dtype=str)
        else:
            df = pd.read_csv(file, dtype=str)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Could not read file: {exc}"}), 400

    df = df.dropna(how="all")
    headers = [str(c) for c in df.columns]

    mapping_json = request.form.get("mapping")
    if mapping_json:
        import json

        mapping = json.loads(mapping_json)
    else:
        mapping = guess_mapping(headers)
        missing_required = [f for f in REQUIRED_FIELDS if not mapping.get(f)]
        if missing_required:
            sample_rows = df.head(5).fillna("").to_dict(orient="records")
            return jsonify(
                {
                    "status": "needs_mapping",
                    "headers": headers,
                    "guessed_mapping": mapping,
                    "sample_rows": sample_rows,
                    "required_fields": REQUIRED_FIELDS,
                    "optional_fields": OPTIONAL_FIELDS,
                }
            )

    rows = []
    issues_by_row = []
    for _, r in df.iterrows():
        def get(field):
            col = mapping.get(field)
            if not col or col not in df.columns:
                return ""
            val = r.get(col, "")
            return "" if pd.isna(val) else str(val).strip()

        row = {
            "uan": re.sub(r"\D", "", get("uan"))[:12],
            "name": get("name"),
            "gross": get("gross") or "0",
            "epf": get("epf") or "0",
            "ncp": get("ncp") or "0",
            "refund": get("refund") or "0",
        }
        rows.append(row)
        issues_by_row.append(validate_wage_row(row))

    return jsonify(
        {
            "status": "ok",
            "mapping": mapping,
            "rows": rows,
            "issues": issues_by_row,
        }
    )


@app.route("/api/ecr/generate", methods=["POST"])
def generate_ecr():
    data = request.get_json(force=True)
    estab_code = (data.get("estab_code") or "").strip()[:15]
    wage_month = data.get("wage_month")  # "YYYY-MM"
    rows = data.get("rows") or []

    if not estab_code or not wage_month:
        return jsonify({"error": "Establishment code and wage month are required"}), 400

    year, month = wage_month.split("-")

    lines = []
    d = "#~#"
    for row in rows:
        gross = float(row.get("gross") or 0)
        epf = float(row.get("epf") or 0)
        calc = calc_row(gross, epf)
        ncp = row.get("ncp") or 0
        refund = row.get("refund") or 0

        dd = [
            str(row.get("uan", ""))[:12],
            str(row.get("name", "")).upper(),
            str(int(gross))[:10],
            str(int(epf))[:10],
            str(calc["eps_wages"])[:10],
            str(calc["edli_wages"])[:10],
            str(calc["epf_contri"])[:10],
            str(calc["eps_contri"])[:10],
            str(calc["diff"])[:10],
            str(ncp)[:2] if float(ncp or 0) > 0 else "0",
            str(refund)[:10] if float(refund or 0) > 0 else "0",
        ]
        lines.append(d.join(dd))

    content = "\r\n".join(lines) + ("\r\n" if lines else "")
    buf = io.BytesIO(content.encode("utf-8"))
    buf.seek(0)
    filename = f"{estab_code}{year}{month}.txt"
    return send_file(
        buf,
        mimetype="text/plain",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/exit/generate", methods=["POST"])
def generate_exit():
    data = request.get_json(force=True)
    estab_code = (data.get("estab_code") or "").strip()[:15]
    wage_month = data.get("wage_month")
    rows = data.get("rows") or []

    if not estab_code or not wage_month:
        return jsonify({"error": "Establishment code and wage month are required"}), 400

    year, month = wage_month.split("-")

    lines = []
    d = "#~#"
    for row in rows:
        uan = str(row.get("uan", ""))[:12]
        name = str(row.get("name", ""))
        raw_date = row.get("date", "")
        code = str(row.get("code", ""))[:1]

        date_str = ""
        if raw_date:
            try:
                dt = datetime.strptime(raw_date, "%Y-%m-%d")
                date_str = dt.strftime("%d-%m-%Y")
            except ValueError:
                date_str = raw_date

        dd = [uan, date_str, code]
        lines.append(d.join(dd))

    content = "\r\n".join(lines) + ("\r\n" if lines else "")
    buf = io.BytesIO(content.encode("utf-8"))
    buf.seek(0)
    filename = f"{estab_code}{year}{month}exit.txt"
    return send_file(
        buf,
        mimetype="text/plain",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
