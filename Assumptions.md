# Architectural & Design Assumptions

### 1. Multi-Process & Distributed Concurrency Safety (Bonus Requirement)
- Seat allocation concurrency is enforced directly inside PostgreSQL using row-level pessimistic locking (`SELECT ... FOR UPDATE`) within database transactions.
- Because locks are managed at the database engine level (rather than in-memory within application processes), running multiple instances of the C#/.NET backend across different ports or containers connected to the same PostgreSQL instance guarantees that `held + confirmed <= totalSeats` under concurrent load without race conditions.

### 2. Student Identity Model
- As specified, authentication/JWT is omitted. 
- The student's 17-digit Birth Registration Number passed via the `X-Student-Id` request header serves as the sole identity key.

### 3. Seat Limit & Unique Reservation Rules
- Total seat limits satisfy: `HeldSeats + ConfirmedSeats <= TotalSeats`.
- Enforced at the DB level with a unique partial index (`ClassId`, `StudentId`) ensuring a student cannot hold more than one active (`HELD` or `CONFIRMED`) seat per class.

### 4. Expiration Mechanism
- Expiration is managed via a two-tier strategy:
  1. **Dynamic Read Filtering:** Endpoint queries check `ExpiresAt > DateTime.UtcNow`, treating expired holds as released dynamically.
  2. **Periodic Background Cleanup:** `HoldExpirationWorker` updates stale database rows to `EXPIRED` status asynchronously.

### 5. Idempotent Confirmation
- Re-submitting payment confirmation for an already `CONFIRMED` hold returns HTTP 200 with the existing record, preventing double counting.