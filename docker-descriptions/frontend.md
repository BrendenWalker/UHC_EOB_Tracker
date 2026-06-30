# UHC EOB Tracker Frontend

React SPA for tracking UHC Explanation of Benefits and provider billing status.

## Features

- Dashboard for unbilled and unpaid claims
- Multi-file PDF import wizard
- Claim detail with billed/paid date tracking
- nginx serves static assets and proxies `/api` to the backend container

## Usage

Typically deployed with `eobtracker-backend` via Docker Compose or Portainer. Standalone example:

```bash
docker run -d \
  -p 8150:80 \
  youruser/eobtracker-frontend:latest
```

The frontend expects the backend at `eobtracker-backend:80` on the same Docker network (configured in `nginx.conf`).

## Source

https://github.com/your-org/UHC_EOB_Tracker
