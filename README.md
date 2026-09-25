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

## Visitor registration and admin page

Anyone can open the site, but they must register (name, mobile, email and a
consent tick) before they can upload a sheet or generate a file. The server
enforces this, not just the page. Registrations and usage counts (page views,
uploads, ECR and exit files) are stored in SQLite at `$DATA_DIR/visitors.db`.
Wage data is never stored.

`/admin` shows totals, the list of registered people, a CSV download and a
delete button (removes that person's details). It needs the admin login.

Set these in Coolify (Configuration → Environment Variables) and redeploy:

| Variable | Purpose |
|---|---|
| `DATA_DIR` | `/data` — **also add a Persistent Storage volume mounted at `/data`**, or registrations are lost on every redeploy |
| `ECR_USERNAME` | Admin user ID |
| `ECR_PASSWORD_HASH` | Admin password hash (preferred) — generate with `python -c "from werkzeug.security import generate_password_hash as g; print(g(input('Password: ')))"` |
| `ECR_PASSWORD` | Plain admin password (only if not using the hash) |
| `SECRET_KEY` | Long random string for signing the session cookie, e.g. `python -c "import secrets; print(secrets.token_hex(32))"` |

If no admin user ID/password is set, `/admin` stays locked. Admin sessions
last 8 hours; 5 wrong passwords from one IP lock logins from it for 15
minutes. Visitors stay registered on their device for a year.

## What it does

- **Wage Register tab** — manual row entry or Excel/CSV upload. Uploads are
  auto-matched to UAN / Name / Gross Wages / EPF Wages by header name; if a
  required column can't be matched, a mapping step appears so you can pick it
  by hand. EPS Wages, EDLI Wages, EPF/EPS contributions and the diff are
  calculated automatically, same formulas as Sheet1 of the original workbook.
- **Wage ceiling** — follows S.O. 5109(E): ₹15,000 up to August 2026,
  ₹25,000 from October 2026. September 2026 is a split month (1–16 Sep at
  ₹15,000, 17–30 Sep at ₹25,000, pro rata by days, single ECR) per the EPFO
  FAQ. Each row has an "EPS member" flag (No = EPS wages 0, full employer
  12% to EPF), and in September 2026 a "1–16 Sep status" choosing the FAQ
  Q7 scenario: capped at ₹15,000 (C), full wages, EPF-only joining EPS on
  17 Sep (B), or newly covered from 17 Sep (A). Enter the full-month EPF
  wage; the pro-rated figure written to the ECR is shown under it.
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
