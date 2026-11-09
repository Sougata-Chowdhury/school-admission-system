# AI Usage Summary

### 1. Architectural Guidance & Concurrency Strategy
- Used Gemini for guidance on pessimistic database locking (`SELECT ... FOR UPDATE`) in EF Core with PostgreSQL.
- Formulated the dynamic seat calculation model to prevent out-of-sync state.

### 2. Automated Test Suite
- AI assistance was used to structure parallel race-condition unit tests using `Task.WhenAll`.

### 3. Frontend Component Generation
- AI assisted in designing Vite/React state management and polling mechanisms for synchronized seat counts.