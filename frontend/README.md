# Frontend

React 18 + Vite UI for the School Admission System. The root
[`README.md`](../README.md) covers running the whole stack with Docker, the API,
configuration and the required tests.

## Commands

```bash
npm ci
npm run dev      # local Vite dev server
npm run build    # production build
npm test         # Vitest + Testing Library
```

In Docker the backend URL comes from `VITE_API_BASE_URL` at container start; the
nginx entrypoint writes it into `/config.js`. For local development, copy a
different URL into `public/config.js` if the API is not on
`http://localhost:8080`.

The UI has two surfaces in one no-login app: the Parent Portal (identity,
applications, seat cards) and the Administrator console (create class, live
class list). Both are documented in the root README.
