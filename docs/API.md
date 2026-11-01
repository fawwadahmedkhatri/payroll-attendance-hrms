# REST API Reference

Base URL: `http://localhost:4000/api` directly, or `/api` through the web app.
Auth: send the `hrms_token` cookie (set by `/auth/login`) or `Authorization: Bearer <token>`.
Errors: `{ "error": "message", "details"?: [...] }` with status 400, 401, 403, 404, 409 or 500.
Lists: paged lists accept `page` and `pageSize` and return `{ items, total, page, pageSize, totalPages }`.

## Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → sets the cookie and returns the user |
| POST | `/auth/logout` | any | Clears the cookie |
| GET | `/auth/me` | any | Current user, employee and company currency |
| POST | `/auth/change-password` | any | `{ currentPassword, newPassword }` |

## Employees (HR/Admin)
| Method | Path | Description |
|---|---|---|
| GET | `/employees?search&departmentId&status&page` | List |
| GET | `/employees/:id` | Detail, including overrides and login info |
| POST | `/employees` | Create employee, login account and leave balances |
| PUT | `/employees/:id` | Update |
| POST | `/employees/:id/deactivate` | `{ dateOfExit? }` → disables login, keeps history |
| POST | `/employees/:id/activate` | Re-activate |
| POST | `/employees/:id/reset-password` | Admin only |
| PUT | `/employees/:id/overrides` | Per-employee pay component overrides |

## Attendance
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/device/punches` | device key | Biometric terminals push punches (see ARCHITECTURE §6) |
| GET | `/attendance?from&to&status&departmentId&search` | HR | Daily register (`status=LATE` for late arrivals) |
| GET | `/attendance/punches?employeeId&date` | HR | Raw punches for one day |
| PUT | `/attendance/manual` | HR | Manual correction `{ employeeId, date, status, checkIn?, checkOut?, remarks }` |
| POST | `/attendance/:id/reset` | HR | Undo a manual correction |
| POST | `/attendance/process` | HR | Re-process `{ from, to }` (max 62 days) |
| POST | `/attendance/simulate` | HR | Simulated device feed `{ date }` |
| GET | `/attendance/import/template?format=xlsx\|csv` | HR | Import template |
| POST | `/attendance/import?dryRun=true\|false` | HR | Multipart `file` (.xlsx/.csv) → validation or import |
| GET | `/attendance/me?from&to` | Employee | Own attendance |

## Leave
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/leave/me/balances?year` | Employee | Own balances |
| GET | `/leave/me/requests` | Employee | Own requests |
| POST | `/leave/me/requests` | Employee | Apply `{ leaveTypeId, startDate, endDate, isHalfDay, reason }` |
| GET | `/leave/days?startDate&endDate&isHalfDay` | any | Working days in a range |
| POST | `/leave/requests/:id/cancel` | owner / HR | Withdraw a pending request (HR can also cancel an approved one) |
| GET | `/leave/requests?status&search` | HR | Review queue |
| POST | `/leave/requests/:id/approve` | HR | `{ comment? }` → deducts balance and updates attendance |
| POST | `/leave/requests/:id/reject` | HR | `{ comment }` |
| GET | `/leave/balances/:employeeId?year` | HR | An employee's balances |
| POST | `/leave/balances/allocate` | Admin | `{ year }` yearly allocation with carry-forward |

## Payroll
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/payroll/runs` | HR | All runs |
| POST | `/payroll/runs` | HR | Process or re-process `{ year, month }` (draft) |
| GET | `/payroll/runs/:id?search&page` | HR | Run with payslips and department totals |
| POST | `/payroll/runs/:id/finalize` | HR | Lock and publish to employees |
| DELETE | `/payroll/runs/:id` | HR | Delete a draft |
| GET | `/payroll/runs/:id/export` | HR | Payroll register CSV |
| GET | `/payroll/payslips/:id` | HR / owner (finalized) | Payslip with lines |
| GET | `/payroll/payslips/:id/pdf` | HR / owner (finalized) | PDF payslip |
| GET | `/payroll/me/payslips` | Employee | Own finalized payslips |

## Reports
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/dashboard` | HR | Headcount, today's stats, 14-day trend, departments, payroll trend |
| GET | `/reports/attendance-summary?year&month&departmentId&format=csv` | HR | Per-employee monthly counts |
| GET | `/reports/late?from&to&departmentId&format=csv` | HR | Late arrivals |
| GET | `/reports/leave-summary?year` | HR | Leave usage by type |
| GET | `/reports/me` | Employee | Personal dashboard |

## Settings
| Method | Path | Role | Description |
|---|---|---|---|
| GET/PUT | `/settings/company` | read: any, write: Admin | Currency, timezone, weekly offs, pay divisor, late rule |
| CRUD | `/settings/shifts` | Admin | Start/end, grace, full/half-day hours, default |
| CRUD | `/settings/holidays?year` | Admin | Holiday calendar |
| CRUD | `/settings/leave-types` | Admin | Quota, paid/unpaid, half day, carry-forward |
| CRUD | `/settings/pay-components` | Admin | Salary rules (fixed, percentage, slab) |
| CRUD | `/settings/departments`, `/settings/designations` | Admin | Lookups |
| GET/POST/PUT | `/settings/devices`, `/settings/devices/:id/rotate-key` | Admin | Biometric devices and API keys |
| GET | `/settings/audit-logs?limit` | Admin | Audit trail |
