# School Admission System

A first-come, first-served (FCFS) school admission system. Parents can hold a
seat, pay the (simulated) admission fee before the hold expires, or cancel.
School administrators can create classes/shifts and watch live seat counts.

- **Backend:** C# 12 / ASP.NET Core Web API (.NET 8), Entity Framework Core
- **Database:** PostgreSQL 17
- **Frontend:** React 18 + Vite (JavaScript), Axios
- **Tests:** xUnit (backend), Vitest + Testing Library (frontend)
- **Runtime:** Docker Compose

## Run the app with Docker

Only Docker is required.

```bash
docker compose up --build
```

Wait until the backend has applied its database migrations. Then open:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8080
- **Health check:** http://localhost:8080/health

The first build takes a few minutes because the .NET and Node images are
downloaded. Later starts are much faster.

To stop the app:

```bash
docker compose down
```

The PostgreSQL data is stored in the named volume `postgres_data`, so classes,
holds and confirmed admissions survive a `down` / `up` cycle. To delete the data
as well:

```bash
docker compose down -v
```

## Using the UI

No login is required.

1. In **Parent Portal**, enter a birth registration number and click **Set
   Student ID**. It is remembered in `localStorage`, so reopening the browser
   restores the student's applications.
2. In **School Admin**, create a class such as `Class 6 - Morning Shift` with a
   seat count. Each class/shift is a separate class.
3. In **Parent Portal**, click **Apply** on a class. The application shows its
   status and a live countdown.
4. Click **Pay Admission Fee** before the countdown reaches zero to confirm the
   admission, or **Cancel** to release the seat.

Seat counts refresh every 2 seconds and applications every 3 seconds. An
expired hold becomes `EXPIRED` in the UI without a page reload, and the payment
button is disabled.

## Configuration

All settings have working defaults for local Docker use. Override them with
environment variables (for example in a `.env` file next to
`docker-compose.yml`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOLD_DURATION_SECONDS` | `600` | How long a seat is held before it is released. |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend URL written into the frontend's runtime config. |
| `POSTGRES_USER` | `myuser` | Database user. |
| `POSTGRES_PASSWORD` | `mysecretpassword` | Database password. |
| `POSTGRES_DB` | `school_admission` | Database name. |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL. |

The backend receives its connection string through
`ConnectionStrings__DefaultConnection` in `docker-compose.yml`.

Example with a short hold duration:

```bash
HOLD_DURATION_SECONDS=120 docker compose up --build
```

PowerShell:

```powershell
$env:HOLD_DURATION_SECONDS = "120"
docker compose up --build
```

The frontend reads `VITE_API_BASE_URL` when the container starts. The nginx
entrypoint writes it to `/config.js`, so the same built image can point at a
different backend without rebuilding.

## API

Base URL: `http://localhost:8080`. JSON is used for requests and responses. The
student identity is sent in the `X-Student-Id` header (the birth registration
number).

| # | Method and path | Purpose |
| --- | --- | --- |
| 1 | `POST /classes` | Create a class: `{ "name": "...", "totalSeats": 120 }` |
| 2 | `GET /classes` | List classes with `totalSeats`, `heldSeats`, `confirmedSeats`, `availableSeats` |
| 3 | `GET /classes/{classId}` | Seat status of one class |
| 4 | `POST /classes/{classId}/holds` | Apply for a seat (requires `X-Student-Id`) |
| 5 | `GET /holds/{holdId}` | Current status of an application |
| 6 | `POST /holds/{holdId}/confirm` | Confirm the admission fee (requires `X-Student-Id`) |
| 7 | `DELETE /holds/{holdId}` | Cancel an application; returns `204` (requires `X-Student-Id`) |
| 8 | `GET /me/holds` | All applications for the current student (requires `X-Student-Id`) |

Possible hold statuses: `HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`.

Common errors:

- `400` — missing/invalid input or `X-Student-Id`
- `403` — the application belongs to another student
- `404` — class or application not found
- `409` — no seats left, duplicate active application, expired/cancelled hold,
  or an attempt to cancel a confirmed admission

## Tests

### Backend (Docker only)

Start the database, then run the test container:

```bash
docker compose up -d db
docker compose --profile test run --rm backend-tests
```

This runs five tests, including a concurrency test that sends 20 simultaneous
applications for 5 seats and asserts that exactly 5 succeed.

### Backend (local .NET SDK)

```bash
docker compose up -d db
dotnet test tests/SchoolAdmissionApi.Tests.csproj
```

The tests use `localhost:5432` with the Compose credentials by default. Set
`TEST_DB_CONNECTION` to use another PostgreSQL instance.

### Frontend

```bash
cd frontend
npm ci
npm test
```

## Bonus: multiple backend processes on one database

The capacity check uses a PostgreSQL row lock (`SELECT ... FOR UPDATE`) inside a
transaction, so it works across processes, not just within one API instance.
Start a second backend on port 8081 against the same database:

```bash
docker compose --profile multi up --build
```

- API 1: http://localhost:8080
- API 2: http://localhost:8081

Both share the same PostgreSQL container and volume. See `ASSUMPTIONS.md` for
the locking details.

## Project structure

```
backend/                 ASP.NET Core API, EF Core models/services/migrations
frontend/                React + Vite application and Vitest tests
tests/                   xUnit integration/unit tests and test Dockerfile
docker-compose.yml       PostgreSQL + backend + frontend (+ optional services)
ASSUMPTIONS.md           Decisions made where the brief was open
AI_USAGE.md              AI tools used and mistakes found
```

## Notes

- Migrations are applied automatically when the backend starts, including on a
  completely empty database.
- The admission fee is simulated; no payment gateway is involved.
- The API intentionally has no authentication: the brief specifies that the
  birth registration number in `X-Student-Id` is the identity.
