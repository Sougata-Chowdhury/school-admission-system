# Assumptions

The brief leaves some details open. These are the choices made, and why.

## Identity and access

- **No login or admin authentication.** The brief says no login is required and
  the birth registration number is the identity, so the frontend stores it in
  `localStorage` and sends it as `X-Student-Id`. The admin screens are therefore
  open in this demo, as specified.
- **Birth registration number format.** The example is 17 digits, but the brief
  does not define a checksum or say that other values are invalid. The API
  accepts any non-empty value up to 100 characters and trims surrounding
  whitespace. Rejecting values of a different length could make the API stricter
  than the contract.
- **A student may apply to different classes.** The one-application rule applies
  per class (per shift), not across the whole school.

## Classes, shifts and seats

- **Each shift is a separate class.** This follows section 2.2 of the brief:
  "Class 6 - Morning Shift" and "Class 6 - Day Shift" are separate entries with
  their own seat counts.
- **Duplicate class names are allowed.** The brief does not require unique
  names, and schools may legitimately create similarly named sections. The
  frontend identifies entries by ID.
- **Class name validation.** Names are trimmed and must be non-empty, at most
  255 characters, and contain no NUL character (which PostgreSQL text cannot
  store); violations return `400`.
- **`totalSeats` must be at least 1.** A class with zero seats cannot admit
  anyone and is treated as invalid input.
- **Seat definitions:**
  - `heldSeats` = applications with status `HELD` whose `expiresAt` is in the
    future.
  - `confirmedSeats` = applications with status `CONFIRMED`.
  - `availableSeats` = `totalSeats - heldSeats - confirmedSeats`, never below 0.
  - `EXPIRED` and `CANCELLED` applications do not consume seats.

## Holds, expiry and confirmation

- **Hold duration** comes from `HOLD_DURATION_SECONDS` (default `600`). Values
  that are not positive integers fall back to 600.
- **All timestamps are UTC.** `expiresAt` is returned with a `Z` suffix; the UI
  converts it to the browser's local time for display.
- **Expiry needs no API call.** Read endpoints and seat counts ignore holds past
  their deadline, and a background worker marks stale rows `EXPIRED` every 5
  seconds. This keeps the stored status tidy without making a seat wait for the
  worker.
- **Expired holds are never confirmable.** Confirming after the deadline returns
  `409`, even if the cleanup worker has not run yet.
- **Confirmation is idempotent.** Confirming an already `CONFIRMED` hold returns
  `200` with the existing record and does not increase `confirmedSeats` again.
- **Confirmed admissions cannot be cancelled.** This keeps a paid seat from
  silently disappearing. The brief only requires cancellation of an application;
  a confirmed admission is treated as final in this implementation.
- **Cancelling is idempotent for already-cancelled holds** (`204`). Cancelling an
  expired hold returns `409` because the seat has already been released.
- **Payment is simulated.** The "Pay Admission Fee" button calls the confirm
  endpoint; no gateway is involved, as allowed by the brief.

## Concurrency and consistency

- **Capacity is enforced in PostgreSQL, not in process memory.** Creating a hold
  starts a transaction and takes a row lock on the class with
  `SELECT ... FOR UPDATE`. Every API process must acquire that lock before
  counting seats and inserting a hold, so `held + confirmed <= totalSeats` holds
  even with multiple backend processes on different ports (bonus requirement).
- **Confirm/cancel also lock the application row.** This prevents a confirm and
  a cancel of the same hold from overwriting each other.
- **A partial unique index** on `(ClassId, StudentId) WHERE Status IN ('HELD',
  'CONFIRMED')` enforces one active/confirmed application per student per class
  at the database level.
- **Expired rows are moved to `EXPIRED` before a new hold is inserted.** Without
  this, an old `HELD` row past its deadline would still match the unique index
  and a student could not re-apply. This is done inside the same transaction.
- **Migrations run at API startup** with retries while PostgreSQL starts, so a
  fresh database works with a single `docker compose up`.
- **Persistence** uses a named PostgreSQL volume. `docker compose down` keeps the
  volume; `docker compose down -v` is the explicit reset.

## Frontend behaviour

- **Two distinct surfaces, one app.** The Parent Portal and the Administrator
  console are separate screens with different layouts and colour schemes, chosen
  from a header switch. This makes the role obvious without introducing login:
  the brief explicitly says no login is required. The birth registration box
  sits at the top of the Parent Portal, as required. The admin console does not
  need a student identity and therefore does not show the box; both roles remain
  reachable at any time from the same header switch.
- **Runtime API URL.** The nginx entrypoint writes `VITE_API_BASE_URL` into
  `/config.js` when the container starts. The Vite development server falls back
  to its own environment variable or `http://localhost:8080`.
- **Polling instead of websockets.** Class counts refresh every 2 seconds and
  applications every 3 seconds. This is simple, works through the Docker network,
  and meets the "without a page reload" requirement without adding a realtime
  service.
- **Client-side countdown is a display aid only.** The server remains the
  authority: confirm/cancel requests are validated against the database clock.
  A browser clock that is badly wrong can make the countdown look odd, but it
  cannot confirm an expired hold.
- **Human-readable errors.** Network failures, validation errors, full classes
  and expired holds are shown in an alert banner. Polling errors are not sent
  only to the browser console.

## Deployment

- The backend listens on port 8080 inside Docker, as required.
- The frontend is served by nginx on host port 5173. The brief does not prescribe
  the frontend port; the README documents it.
- CORS is open for local/demo use because the frontend and backend run on
  different origins. No credentials or cookies are used.
