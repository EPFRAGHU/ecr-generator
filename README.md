# ECR Register & Generator

Flask webapp version of `ECRfile_Template_v2_1.xlsm` — replaces the "Create ECR
Text File" / "Create Exit Text File" macro buttons with a browser-based wage
register that any employer can fill in and download the same `#~#`-delimited
`.txt` files from.

No database. Stateless — same as the original Excel macro (fill in data,
click generate, get a file).

## Run locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py        # dev server on http://localhost:5000
```

For production-like local testing:

```bash
gunicorn --bind 0.0.0.0:5000 app:app
```

## Deploy on your Coolify VPS

Same pattern as `ecr-viewer` and `est_master`:

1. Push this folder to a new GitHub repo, e.g. `EPFRAGHU/ecr-generator`.
2. In Coolify: **New Resource → Public Repository** (or connect the GitHub
   App if the repo is private), point it at the repo, branch `main`.
3. Build pack: **Nixpacks** — it will detect `requirements.txt` and the
   `Procfile` automatically and run gunicorn, not the Flask dev server.
4. Set the port Coolify expects (Nixpacks reads `$PORT` — no manual env var
   needed unless you want to pin one).
5. Add a domain, e.g. `ecr-generator.epf-dashboard.online`, same subdomain
   pattern as your other tools.
6. Deploy.

No database connection to wire up — there's nothing to point at Neon here.

## What it does

- **Wage Register tab** — manual row entry or Excel/CSV upload. Uploads are
  auto-matched to UAN / Name / Gross Wages / EPF Wages by header name; if a
  required column can't be matched, a mapping step appears so you can pick it
  by hand. EPS Wages, EDLI Wages, EPF/EPS contributions and the diff are
  calculated automatically, same formulas as Sheet1 of the original workbook.
- **Exit Register tab** — UAN, name (reference only), exit date, reason code.
- **Challan summary panel** — live totals (Gross/EPF/EPS/EDLI wages, A/c 1/2/10/21/22),
  mirroring the Textmain sheet.
- **Generate buttons** — call `/api/ecr/generate` and `/api/exit/generate`,
  which return the `.txt` file with the same filename convention as the macro:
  `<establishment code><YYYY><MM>.txt` and `...exit.txt`.

## Known deliberate difference from the original macro

The original `TEXTFILE()` macro has a bug where the "Refund of Advances"
field is read from the wrong column (L instead of K) once the check passes,
so it silently falls back to 0 in most real files. This version reads the
correct column. If you specifically need byte-for-byte output parity with
the old macro (bug included), say so and it can be reverted.
