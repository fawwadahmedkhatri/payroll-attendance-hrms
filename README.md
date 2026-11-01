# PayTrack HRMS — Payroll, Attendance & Leave Management System

A full-stack web application for about 500 employees, covering:

- **Role-based login**: Admin, HR and Employee
- **Employee master**: add, edit, deactivate/reactivate, per-employee salary overrides
- **Biometric attendance**: REST API for fingerprint/face terminals, a built-in **simulated device feed**, and **Excel/CSV import**
- **Attendance rules**: shifts, grace period, **late-arrival tracking**, half days, holidays, weekly offs, HR manual corrections
- **Leave management**: online application, HR approval/rejection, balances, carry-forward, half days, any number of leave types
- **Payroll**: monthly processing, **automatic deductions for unpaid leave, absence and late attendance**, configurable earnings/deductions/employer contributions, **PDF payslips**, draft → finalize (locked)
- **HR dashboard and reports**: attendance summary, late arrivals, leave usage, payroll register (CSV)
- **Sample data**: 500 employees with about 3 months of attendance, leave and payroll history

Nothing is tied to one country. Currency, timezone, weekly offs, shifts, late rules, leave types and the whole salary structure (including tax slabs) are configured in **Settings**.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (React 19, TypeScript), Tailwind CSS, SWR, Recharts |
| Backend | Node.js 22, Express 5 (TypeScript), REST API, Zod validation |
| Database | PostgreSQL 16 with Prisma ORM (migrations included) |
| Auth | JWT in an httpOnly cookie, bcrypt password hashing, role middleware |
| Files | ExcelJS / PapaParse (import and export), PDFKit (payslips) |
| Hosting | Docker Compose (local) and Kubernetes manifests |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and module walkthrough, [docs/API.md](docs/API.md) for the endpoint reference, and [docs/DESIGN.md](docs/DESIGN.md) for the UI design system (light/dark/system themes, brand tokens, motion).

---

## 1. Quick start with Docker (recommended)

Requirements: Docker Desktop.

```bash
docker compose up -d --build
```

On the **first** start, load the sample data (takes a few minutes; follow it with `docker compose logs -f api`):

```bash
SEED_ON_START=true docker compose up -d api
```

On Windows PowerShell: `$env:SEED_ON_START="true"; docker compose up -d api`

Open **http://localhost:3000**.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api/health |
| PostgreSQL | localhost:**5433** (user `hrms`, db `hrms`) |

> Postgres is published on host port 5433 so it does not clash with a locally installed PostgreSQL. Before sharing beyond your machine, set `POSTGRES_PASSWORD` and `JWT_SECRET` in a `.env` file next to `docker-compose.yml`.

### Demo logins (sample data)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@hrms.local` | `Admin@123` |
| HR | `hr@hrms.local` | `Hr@12345` |
| Employee | any seeded employee email (see the Employees list) | `Employee@123` |

These are demo credentials created by the seed script. Change them for any real use.

---

## 2. Local development (without Docker for the app)

Requirements: Node.js 20+ and PostgreSQL (the Compose database works: `docker compose up -d db`).

```bash
# API
cd api
cp .env.example .env          # set JWT_SECRET to a long random value
npm install
npx prisma migrate deploy     # create tables
npm run db:seed               # ~500 sample employees (takes a few minutes)
npm run dev                   # http://localhost:4000

# Web (second terminal)
cd web
npm install
npm run dev                   # http://localhost:3000
```

`npm run dev` in `web/` uses Turbopack and pre-compiles every page in the background right after start-up (about a minute; watch for "Pre-compiled N pages"), so page switches are fast while you work. Dev mode is still slower than production: switching pages takes about 0.5–1.5 s in dev versus about 60–150 ms in the production build used by Docker.

Useful scripts (in `api/`):

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the payroll engine and attendance rules |
| `npm run db:seed` | Seeds sample data (skips if data exists; `SEED_FORCE=true` wipes and reseeds) |
| `npm run db:reset` | Drops and recreates the database |
| `npm run simulate` | Stand-alone biometric device simulator (needs `DEVICE_KEY`) |

---

## 3. Kubernetes

Manifests live in [`deploy/k8s`](deploy/k8s). These steps were written for Docker Desktop's built-in Kubernetes, which can use locally built images. For another cluster, push the two images to a registry and update `image:` in `api.yaml`, `web.yaml` and `seed-job.yaml`.

```bash
docker compose build                                       # builds payroll-hrms-api:latest and payroll-hrms-web:latest

cp deploy/k8s/secret.example.yaml deploy/k8s/secret.yaml   # edit the placeholder values
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -k deploy/k8s
kubectl -n hrms rollout status deploy/api

kubectl apply -f deploy/k8s/seed-job.yaml                  # optional sample data
kubectl -n hrms logs -f job/hrms-seed
```

Open **http://localhost:30080** (NodePort), or apply `ingress.yaml` if you run an ingress controller.

---

## 4. Using the system (demo script)

1. **Settings** (admin): company, currency and timezone, weekly offs, late rule, shifts, holidays, leave types, pay components, biometric devices.
2. **Attendance → Simulate device feed**: generates realistic fingerprint/face punches for a working day. Late arrivals and half days are calculated automatically.
3. **Import Attendance**: download the template, fill it in, then validate (row-level errors) and import.
4. **Employee login → My Leave → Apply**: the request appears for HR under **Leave Requests** to approve or reject.
5. **Payroll → Run payroll** for a month. Review the draft (loss-of-pay and late deductions appear as separate lines), open a payslip, download the PDF, then **Finalize** to lock it and publish to employees.
6. **Reports**: monthly attendance summary, late arrivals, leave usage (CSV export). The payroll register is on each payroll run.

---

## 5. Project structure

```
api/                    Express REST API
  prisma/               schema.prisma, migrations, seed
  src/modules/          auth, employees, attendance, leave, payroll, reports, settings
  src/lib/              dates, money, validation, errors, audit
  tests/                unit tests (payroll engine, attendance rules)
  scripts/              device simulator
web/                    Next.js frontend
  app/                  routes (login, (app)/… pages, /api proxy)
  components/           UI kit and screen views
deploy/k8s/             Kubernetes manifests
docs/                   architecture and API documentation
docker-compose.yml
```
