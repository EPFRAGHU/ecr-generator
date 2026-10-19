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

- **Arrear Register tab** — makes the text file for the portal's "Arrear
  File Upload" (8 `#~#` fields: UAN, name, arrear EPF / EPS / EDLI wages,
  EPF, EPS and ER contributions due). Per member: monthly EPF wage already
  paid, revised monthly EPF wage, EPS member, Higher EPF. The From / Till
  months and the 12% or 10% rate apply to the whole file, as on the portal
  form. Arrears are worked out month by month; EPS and EDLI arrears (and
  EPF when Higher EPF is "No") count only up to each month's ceiling
  (₹15,000 to Aug 2026, Sep 2026 split, ₹25,000 from Oct 2026). Arrear wage
  cells can be overridden by hand. Excel/CSV upload with a sample sheet
  (`/api/arrear/template`); file name `<estab>ARR<from><till>.txt` (letters
  and digits only, 30 characters, within the portal's 32 limit).
- **POHW Arrear tab** — pension on higher wages: makes the text file for the
  portal's "POHW Arrear File Upload" (8 `#~#` fields: UAN, name, arrear EPF
  / EPS / EDLI wages, arrear EPF EE share, arrear EPF ER share, arrear EPS
  share). Per the POHW help file every field is 0 except the arrear EPS
  share, which must be more than 0 — the amount EPFO has worked out for the
  member — so only that amount is entered per member. Excel/CSV upload with
  a sample sheet (`/api/pohw/template`); file name `<estab>POHW<YYYYMM>.txt`
  using the page's wage month. On the portal the wage month must be the
  current wage month, and a UAN already with an approved, in-process or
  paid POHW arrear cannot be filed again.
- **Import ECR file** — loads an ECR text file (`#~#` format, 11 fields) back
  into the wage register. Each line is worked back to the full-month EPF
  wage and the member's options (EPS member, higher EPF, higher pension,
  VPF, September 2026 status) so that generating the ECR again reproduces
  the line exactly; a line that can't be reproduced is imported with a note
  listing the figures that will be recalculated. The establishment code and
  wage month are read from the file name when present
  (`ORBBS2012397000_ECR_SEP_2026_BATCH2.txt`, `ORBBS0017675000202609.txt`),
  otherwise the page's wage month is used.
- **Wage Register tab** — manual row entry or Excel/CSV upload. Uploads are
  auto-matched to UAN / Name / Gross Wages / EPF Wages by header name; if a
  required column can't be matched, a mapping step appears so you can pick it
  by hand. EPS Wages, EDLI Wages, EPF/EPS contributions and the diff are
  calculated automatically, same formulas as Sheet1 of the original workbook.
  "Download template" (`/api/template`) gives an Excel file with the
  expected headers — UAN, Member name, Gross wages, EPF wages, NCP days,
  VPF, Refund of advances — and an Instructions sheet; a filled-in
  template uploads without the mapping step. "Clear all" (after a
  confirmation) empties the wage and exit registers, whether entered or
  imported; the establishment code and wage month are kept.
- **Wage ceiling** — follows S.O. 5109(E): ₹15,000 up to August 2026,
  ₹25,000 from October 2026. September 2026 is a split month (1–16 Sep at
  ₹15,000, 17–30 Sep at ₹25,000, pro rata by days, single ECR) per the EPFO
  FAQ. Each row has a "Higher EPF" choice:
  - **Yes (both)** — employee and employer both contribute 12% on the
    actual wage above the ceiling.
  - **Employee only** — the employee contributes 12% on the actual wage;
    the employer's 12% is restricted to the ceiling wage (EPS ₹1,250 +
    diff ₹550 at ₹15,000; EPS ₹2,083 + diff ₹917 at ₹25,000).
  - **No**, the default — EPF wages capped at the ceiling for both, so
    EPF, EPS and EDLI wages match.

  The "Higher EPF for all members" switch above the wage table sets every
  row at once; new and uploaded rows follow the last choice, and each
  row's dropdown can still be changed (the switch shows "mixed" then).
- **Higher pension** — for EPS members whose joint option for pension on
  higher wages has been accepted. "Yes" on a row (or the "Higher pension
  for all EPS members" switch) makes EPS wages the actual wage and the EPS
  contribution 8.33% of it plus 1.16% of the part above the ceiling, all
  out of the employer's 12% (the rest is the diff). It also sets Higher
  EPF to "Yes (both)" and locks that dropdown. EDLI wages stay capped. In
  September 2026 the 1.16% is on the part above ₹15,000 for 1–16 Sep and
  above ₹25,000 for 17–30 Sep. Example, October 2026, actual wage ₹40,000:
  EPF/EPS wages 40,000, EDLI wages 25,000, EPF contribution 4,800, EPS
  3,332 + 174 = 3,506, diff 1,294.

  EPS and EDLI wages are always capped, so the EPS contribution is
  restricted to 8.33% of the ceiling and the rest of the employer's share
  goes to the diff. Each row also has an "EPS member" flag (No = EPS wages 0, full
  employer 12% to EPF), and in September 2026 a "1–16 Sep status" choosing
  the FAQ Q7 scenario: EPS member throughout (C), EPF-only joining EPS on
  17 Sep (B), or newly covered from 17 Sep (A). Enter the full-month EPF
  wage; the figure written to the ECR is shown under it when it differs.
- **NCP days** — entered per member next to EPF wages (or uploaded from an
  "NCP days" / "LOP days" column). Whole days only, from 0 up to the
  number of days in the wage month; anything else highlights the row and
  blocks generation.
- **Duplicate UANs** — a UAN that appears on more than one row is
  highlighted on every such row ("duplicate — also row …") and the ECR
  can't be generated until it is fixed; the server rejects duplicates too.
- **VPF** — voluntary PF per member, as a rupee amount (or uploaded from a
  "VPF" / "Voluntary PF" column). It is added to the member's EPF
  contribution in the ECR and to the A/c 1 employee share in the challan
  summary. It does not change EPS or the employer's diff.
- **Exit Register tab** — UAN, name (reference only), exit date, reason code.
- **Challan summary panel** — live totals (Gross/EPF/EPS/EDLI wages, A/c 1/2/10/21/22),
  mirroring the Textmain sheet.
- **Generate buttons** — call `/api/ecr/generate` and `/api/exit/generate`,
  which return the `.txt` file with the same filename convention as the macro:
  `<establishment code><YYYY><MM>.txt` and `...exit.txt`.

## Version history

The version and release date/time are set in `APP_VERSION` / `APP_BUILD`
in `app.py` and shown under "Employer Module". MAJOR.MINOR changes for a
feature release; the last number (sub-version) changes for fixes and small
changes.

| Version | Date (IST) | Changes |
|---|---|---|
| 1.10.0 | 19-10-2026 11:28 | POHW Arrear tab: pension on higher wages arrear file (all fields 0 except the arrear EPS share), Excel/CSV upload and a sample Excel; typing into a blank UAN cell no longer loses the digits |
| 1.9.0 | 19-10-2026 10:49 | Arrear Register tab: makes the portal's Arrear File Upload text file (8 fields), month-by-month arrears within each month's ceiling, 12%/10% rate, hand overrides, Excel/CSV upload and a sample Excel |
| 1.8.0 | 15-10-2026 23:30 | "Import ECR file (.txt)" loads an ECR text file back into the wage register, working out each member's full-month wage and options; establishment code and wage month read from the file name |
| 1.7.1 | 15-10-2026 16:01 | Challan summary shows the higher pension 1.16% in small type under Er share and EPS total |
| 1.7.0 | 15-10-2026 15:46 | Higher pension per EPS member and for all EPS members: EPS on the actual wage (8.33% + 1.16% above the ceiling, from the employer's 12%); sets Higher EPF to Yes (both) |
| 1.6.2 | 15-10-2026 15:28 | Challan summary is as tall as the wage register on desktop, with the grand total and Generate buttons at the bottom |
| 1.6.1 | 15-10-2026 15:18 | "Clear all" button empties the wage and exit registers after a confirmation |
| 1.6.0 | 15-10-2026 15:04 | Higher EPF defaults to No (EPF, EPS and EDLI wages match); "Higher EPF for all members" switch sets every row at once |
| 1.5.2 | 13-10-2026 08:17 | Release times corrected to the actual commit times |
| 1.5.1 | 13-10-2026 08:13 | Duplicate UANs in the wage register are flagged and block ECR generation |
| 1.5.0 | 13-10-2026 08:05 | On desktop only the wage rows scroll; header, establishment code / wage month and challan summary stay in place |
| 1.4.2 | 13-10-2026 07:55 | Compact header and challan summary so the summary fits on screen; outdated "Prototype" note removed |
| 1.4.1 | 13-10-2026 07:43 | Suggestions email also on the registration form; browsers reload style/script files on each new version |
| 1.4.0 | 13-10-2026 07:34 | Higher EPF "Employee only": employer share restricted to the ceiling wage |
| 1.3.1 | 12-10-2026 21:29 | Suggestions email (raghu.epf@gmail.com) at the top middle |
| 1.3.0 | 12-10-2026 21:25 | Signed-in name and email at the top right, with a Log out button |
| 1.2.6 | 12-10-2026 20:56 | Version number shown on the page |
| 1.2.5 | 12-10-2026 20:51 | Amount cells open blank on click; blank keeps the old value |
| 1.2.4 | 12-10-2026 20:46 | Tab / Shift+Tab move between columns |
| 1.2.3 | 12-10-2026 20:42 | Template downloads with the .xlsx extension |
| 1.2.2 | 12-10-2026 20:37 | Download template button |
| 1.2.1 | 12-10-2026 20:33 | Gross and EPF wages shown as input boxes |
| 1.2.0 | 12-10-2026 20:25 | VPF per member; NCP days validated |
| 1.1.0 | 12-10-2026 15:13 | Higher EPF option (default Yes); wage month defaults to previous month |
| 1.0.0 | 25-09-2026 09:39 | Registration gate, revised wage ceiling, upload, ECR and exit files |

## Known deliberate difference from the original macro

The original `TEXTFILE()` macro has a bug where the "Refund of Advances"
field is read from the wrong column (L instead of K) once the check passes,
so it silently falls back to 0 in most real files. This version reads the
correct column. If you specifically need byte-for-byte output parity with
the old macro (bug included), say so and it can be reverted.
