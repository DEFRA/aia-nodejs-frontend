# aia-frontend

**AI Assure Architecture Governance** — server-rendered Node.js web application built on the Defra DDTS template. Handles document uploads and displays AI architecture assessment results using the GOV.UK Design System.

- **Framework**: Hapi 21 + Nunjucks + Webpack 5
- **Runtime**: Node.js ≥ 24 (see `.nvmrc`)
- **Styling**: SCSS → GOV.UK Frontend 6

---

## Prerequisites

- Node.js v24+
- npm v10+
- Redis (production only — dev defaults to in-memory session cache)

---

## Install

```bash
npm install
```

---

## Running the app

```bash
# Development (webpack watch + nodemon in parallel)
npm run dev

# Production
npm start
```

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm start` | Production build + start |
| `npm test` | Run all tests with v8 coverage |
| `npm run test:watch` | Interactive test watch mode |
| `npm run lint` | Run ESLint + Stylelint |
| `npm run lint:js:fix` | Auto-fix ESLint issues |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check Prettier formatting |
| `npm run pr-prep` | Full pre-PR check: lint → format:check → test |
| `npm run build:frontend` | Production webpack build only |
| `npm run security-audit` | `npm audit --audit-level=high` |

---

## Environment variables

All variables are validated at startup by Convict (`src/config/config.js`). Defaults cover local development.

### Core

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` / `development` / `test` |
| `PORT` | `3000` | Server port |
| `SESSION_COOKIE_PASSWORD` | dev value | Must be 32+ chars in production |
| `SESSION_CACHE_ENGINE` | `memory` (dev) / `redis` (prod) | Session backend |
| `REDIS_HOST` | `127.0.0.1` | Required when using Redis |

### Backend integration

| Variable | Default | Description |
|---|---|---|
| `BACKEND_API_URL` | `http://localhost:8086/api/v1` | Backend service base URL |
| `MOCK_DATA_RESULT` | `false` | When `true`, falls back to local mock JSON **only if** the backend call fails |
| `RESULT_API_TIMEOUT_MS` | `15000` | Timeout for result/document API requests (ms) |

### Polling

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL_MS` | `30000` | Interval between processing-status polls (ms) |
| `POLL_MAX_POLLS` | `20` | Maximum polls before showing timeout message (~10 min) |

### Pagination

| Variable | Default | Description |
|---|---|---|
| `ITEMS_PER_PAGE` | `10` | Records per page in upload history |
| `PAGINATION_ALIGNMENT` | `left` | Pagination alignment (`left` / `right`) |

### Upload

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_FILE_SIZE_MB` | `50` | Maximum upload file size in MB |

### Development diagnostics

| Variable | Default | Description |
|---|---|---|
| `DEV_SERVICE_LOG` | `false` | Log all backend service calls — URL, request body, response status and body |
| `LOG_LEVEL` | `info` | Pino log level (`fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent`) |
| `LOG_FORMAT` | `pino-pretty` (dev) / `ecs` (prod) | Log output format |

---

## Backend integration

The frontend proxies all data through the Hapi server — the browser never calls the backend directly.

### Upload flow

1. User selects a `.docx` file and submits the form
2. `POST /upload` → streams the file to `POST /api/v1/documents/upload`
3. Backend returns `202` immediately; the frontend redirects to `/home`
4. The upload history table polls `GET /api/poll-status` every 30 seconds
5. When a document's `documentId` disappears from `processingDocumentIds`, the row is refreshed in place
6. After 20 polls (~10 minutes) with unfinished documents, a timeout notice is shown

### Document statuses

| API value | Display label |
|---|---|
| `UPLOADING` | Uploading |
| `UPLOADED` | Uploaded |
| `PENDING` | Queued |
| `PROCESSING` | Analysing |
| `COMPLETE` | Completed |
| `PARTIAL_COMPLETE` | Completed - Partially |
| `ERROR` | Error |

### Mock data fallback

Setting `MOCK_DATA_RESULT=true` does **not** skip the API call. The app always attempts the backend first. Mock data (from `uploads.json` / `result.json`) is only used as a fallback when a backend call fails **and** `MOCK_DATA_RESULT=true`.

### Auth headers

Every backend request carries:

- `Authorization: Bearer <JWT>` — signed with `aia-documents-secret-key-for-jwt-32-chars`
- `X-User-Id` — guest UUID `00000000-0000-0000-0000-000000000001` (or session user ID when SSO is active)

---

## Development diagnostics

### Logging all backend service calls

Start the server with `DEV_SERVICE_LOG=true` to print a `WARN` pair for every backend call — one before the request (URL, method, request body) and one after (URL, status, response body):

```bash
DEV_SERVICE_LOG=true npm run dev
```

To cut through framework noise at the same time, raise the log level:

```bash
DEV_SERVICE_LOG=true LOG_LEVEL=warn npm run dev
```

Example output:

```
WARN {"url":"http://localhost:8086/api/v1/documents?page=1&limit=10","method":"GET"} Service request →
WARN {"url":"http://localhost:8086/api/v1/documents?page=1&limit=10","status":200,"responseBody":{...}} Service response ←
```

The helper is in `src/server/common/helpers/service-logger.js`. When the flag is off it is a zero-overhead pass-through.

---

## Testing

Tests live alongside source files as `*.test.js`.

```bash
npm test              # single run + coverage report
npm run test:watch    # interactive watch
```

Coverage target: **80% minimum** across all source files. Reports are written to `coverage/`.

### Test environment

- Integration tests spin up a real Hapi server via `createServer()` and mock `global.fetch` to simulate backend responses
- Unit tests mock the config module with `vi.doMock` and control `global.fetch` per scenario
- `MOCK_DATA_RESULT=false` is set in `vitest.config.js` to reflect the production default

---

## Pre-commit hook

Husky runs the following on every commit:

```
npm run security-audit → npm run format:check → npm run lint → npm test
```

All checks must pass. Use `npm run pr-prep` to run the same checks locally before pushing.

---

## Docker / local stack with Redis

```bash
# Start app + Redis via Docker Compose
docker compose up
```

Redis is only required when `SESSION_CACHE_ENGINE=redis`. Development defaults to in-memory.

---

## Key files

| File | Purpose |
|---|---|
| `src/index.js` | Application entry point |
| `src/server/server.js` | Hapi server setup, plugin registration |
| `src/server/router.js` | Route module registration |
| `src/config/config.js` | Convict config — all env vars, validated at startup |
| `src/server/home/controller.js` | Upload history, pagination, upload proxy, poll proxy |
| `src/server/result/controller.js` | Result page — fetches from API, renders markdown |
| `src/server/common/helpers/backend-headers.js` | Builds `Authorization` and `X-User-Id` headers |
| `src/server/common/helpers/service-logger.js` | `tracedFetch` — optional service call logger |
| `src/client/javascripts/status-poller.js` | Client-side singleton polling module |
| `src/client/javascripts/application.js` | GOV.UK component init + polling bootstrap |
| `webpack.config.js` | Bundles client JS/SCSS, copies GOV.UK assets |
| `compose.yml` | Docker Compose (app + Redis) |
