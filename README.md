# UHC EOB Tracker

If you're reading you likely understand how messed up healthcare billing is.  For a recent 'visit' I received 11 EOB's and many appeared to have multiple providers involved.

Then there are the crappy UHC and provider websites that are constantly trying to get you to pay 'bills' which you have NOT received a bill for!

I wanted to be able to track EOB's, bills and payments in one dashboard, thus this project.

Self-hosted web app for tracking UnitedHealthcare Explanation of Benefits (EOB) claim details. Import EOB PDFs or enter claims manually, then set **Billed** and **Paid** dates to see what is unbilled, unpaid, or paid on the dashboard.

## Features

- **Dashboard** — summary cards and tables for unbilled, unpaid, and paid claims
- **EOB management** — list, view, and delete EOB statements
- **PDF import** — parse UHC STD-EOB PDFs and review before saving
- **Manual entry** — add statements with nested claims and service lines
- **Claim tracking** — set billed date (provider bill received) and paid date per claim

## Architecture

| Layer | Stack |
|-------|-------|
| Backend | Node 20, Express, PostgreSQL (`pg`) |
| Frontend | React 18, Vite, react-router-dom |
| Deploy | Docker Compose (backend + nginx SPA) |

Default ports: backend **8140**, frontend **8150**.

## Prerequisites

- Docker and Docker Compose
- PostgreSQL (existing instance or local install)

## Database setup

Create a database and apply the schema (as a superuser such as `postgres`):

```bash
createdb eobtracker
psql -d eobtracker -f database/schema.sql
```

If the app connects as a non-owner user (e.g. `eobtracker`), grant table access after applying the schema:

```bash
psql -d eobtracker -f database/grant-app-user.sql
```

Optional demo data from the sample UHC EOB:

```bash
psql -d eobtracker -f database/demo-seed.sql
```

## Configuration

```bash
cp env.example .env
```

Edit `.env` with your PostgreSQL connection details. Use a hostname or IP the container can route to (LAN server, remote host, etc.):

```
DB_HOST=postgres.example.com
DB_PORT=5432
DB_NAME=eobtracker
DB_USER=eobtracker
DB_PASSWORD=your_password_here
```

If PostgreSQL runs on the **Docker host machine** itself (not another server), set `DB_HOST=host.docker.internal` and add `extra_hosts: ["host.docker.internal:host-gateway"]` under the backend service in `docker-compose.yml`.

On Docker Desktop (Windows/Mac), enable **Settings → Resources → Network → Allow access to local network** if the database is on your LAN.

## Run with Docker

```bash
docker compose up -d --build
```

- Frontend: http://localhost:8150
- Backend API: http://localhost:8140/api/health

## Portainer deployment

For production on a Docker host managed by Portainer, use [portainer-stack.yml](portainer-stack.yml) with pre-built images (no `build:` context on the server).

1. Create the shared reverse-proxy network once (if you use HAProxy/Traefik on `edge`):
   ```bash
   docker network create edge
   ```
2. Build and push images (example tags):
   ```bash
   docker build -f backend/Dockerfile -t youruser/eobtracker-backend:1.0.0 .
   docker build -f frontend/Dockerfile -t youruser/eobtracker-frontend:1.0.0 .
   docker push youruser/eobtracker-backend:1.0.0
   docker push youruser/eobtracker-frontend:1.0.0
   ```
3. In Portainer: **Stacks → Add stack** → paste `portainer-stack.yml` (or point at the repo).
4. Set environment variables from [portainer-stack.env.example](portainer-stack.env.example) (`DB_*`, registry username, `IMAGE_TAG`, ports).
5. Deploy. Frontend nginx proxies `/api` to `eobtracker-backend` on the stack network; both services also join `edge` for your reverse proxy.

Default published ports: **8140** (API), **8150** (UI). Rename the external network in the stack file if yours is `web` instead of `edge`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Actions setup, release tagging (`eobtracker/1.0.0` → `latest` or `beta`), and full Portainer instructions.

## Local development

**Backend:**

```bash
cd backend
npm install
npm run dev
```

Runs on port 80 by default; set `PORT=8140` in `.env` for local use.

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:3000 with `/api` proxied to `http://localhost:8140`.

## Claim status logic

Status is derived from line-item `amount_owed` totals and claim-level dates:

| Status | Condition |
|--------|-----------|
| Unbilled | Amount owed > 0, no billed date |
| Unpaid | Amount owed > 0, billed date set, no paid date |
| Paid | Amount owed > 0, paid date set |
| No balance | Amount owed = 0 |

## PDF import

Upload a UHC Explanation of Benefits PDF on **Add EOB → Upload PDF**. Select one or more files, parse, review each preview, then import. Duplicate EOBs (matched by UHC reference number, or member + statement date + service period) are flagged during parse and blocked from import. The dashboard also surfaces any duplicate statements already in the database with options to delete extras.

The parser targets the standard UHC STD-EOB layout (provider blocks, claim numbers, service lines with processing codes). Manual entry is available when parsing is incomplete.

## Project structure

```
├── backend/           # Express API + UHC PDF parser
├── frontend/          # React SPA
├── common/            # Shared database pool
├── database/          # schema.sql, demo-seed.sql
├── docker-compose.yml
└── env.example
```
