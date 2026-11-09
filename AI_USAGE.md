# AI Usage

## Tools used

- **Gemini** for the initial backend/frontend scaffolding and for researching EF
  Core locking with PostgreSQL.
- **OpenCode AI coding assistant** for code review, debugging, test writing and
  documentation edits.

## What AI was used for

- ASP.NET Core controllers, EF Core entities/migrations and the React UI.
- The concurrency approach (`SELECT ... FOR UPDATE` on the class row).
- Drafting the xUnit concurrency test and the Vitest component tests.
- Drafting the Postman collection and environment under `postman/`.
- Drafting README/ASSUMPTIONS content.

All generated code was reviewed, built and exercised locally; the final choices
and wording are my responsibility.

## Mistakes the AI made, and how they were found

1. **Hardcoded frontend API URL.** The generated UI used
   `http://localhost:8080` directly, despite the requirement that the backend URL
   be configurable through an environment variable. Found by comparing the code
   with section 1.2 of the brief. Fixed with a runtime `/config.js` written by the
   nginx entrypoint from `VITE_API_BASE_URL`.
2. **No migration on startup.** The first generated `Program.cs` did not apply
   EF Core migrations, so a fresh `docker compose up` would start an API with no
   tables. Found by tracing the fresh-database path. Fixed by applying migrations
   at startup with retries.
3. **Expired holds could block re-applying.** The partial unique index treats
   every `HELD` row as active, even after its `expiresAt`. The first version
   checked expiry only in application code, so a new hold could violate the
   index and produce a 500. Found by reasoning through the expiry scenario and
   then writing an expiry test. Fixed by marking stale rows `EXPIRED` inside the
   same transaction before inserting.
4. **Potentially invalid SQL for `FOR UPDATE`.** Composing
   `FromSqlInterpolated("... FOR UPDATE").FirstOrDefaultAsync()` can append
   `LIMIT` after `FOR UPDATE`. Found while reviewing the EF-generated query.
   Fixed by materialising the raw query with `ToListAsync()` and taking the first
   item.
5. **Console-only polling errors.** The first UI caught background polling
   failures with `console.error`, which violates the requirement that errors be
   understandable in the UI. Found during a requirements checklist review. Fixed
   with visible class/application error states.
6. **Incomplete deliverables.** The generated README was truncated mid-command
   and the document filenames did not match the required casing. Found while
   checking section 2.7. Fixed by rewriting the README and renaming the files to
   `README.md`, `ASSUMPTIONS.md` and `AI_USAGE.md`.
7. **Tests assumed a developer machine.** The first test setup hardcoded
   `localhost` and provided no Docker path. Found while documenting test
   instructions. Fixed with a `TEST_DB_CONNECTION` override and a
   `backend-tests` Compose profile.
8. **Corrupted UI strings.** Reading the generated `App.jsx` showed mojibake for
   an em dash and a multiplication sign (`â€”`, `Ã—`), caused by a mis-encoded
   edit on Windows. Found during the UI redesign. Fixed by rewriting the file in
   UTF-8 with ASCII text and inline SVG icons instead of special characters.
9. **Numeric strings accepted for `totalSeats`.** ASP.NET Core's web JSON
   defaults read numbers from strings, so `{"totalSeats":"2"}` returned `201`
   even though the contract shows a JSON number. Found by fuzzing the API against
   the contract. Fixed with `JsonNumberHandling.Strict` and a Postman regression
   request that expects `400`.
10. **NUL character caused a 500.** PostgreSQL text cannot contain `\u0000`, so a
    class name with that character crashed the request. Found by fuzzing unusual
    JSON strings. Fixed by rejecting NUL in the class name (and the student
    header) with `400`, plus a Postman regression request.

## Verification performed

- `dotnet build` for the API and test project.
- Backend tests (including the 20-request / 5-seat concurrency test) against
  PostgreSQL.
- `npm test` for the React component tests.
- `docker compose up --build`, followed by real HTTP requests against the eight
  endpoints: create/list classes, hold, confirm twice, cancel, list a student's
  applications, capacity rejection and expiry rejection.
- Browser check of the running UI, including the countdown and error banner.
- The `postman/` collection was generated with the assistant, then run twice
  against the live stack with the Postman CLI; both runs passed all 43 requests
  and 58 assertions.
- Additional live audits covered response contracts, malformed input (no 5xx),
  short hold expiry with the background worker, `down`/`up` persistence and
  concurrent requests split across two backend processes.
