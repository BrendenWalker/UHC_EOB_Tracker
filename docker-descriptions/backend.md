# UHC EOB Tracker Backend

Node.js/Express REST API for tracking UnitedHealthcare Explanation of Benefits claims.

## Features

- Dashboard for unbilled, unpaid, and paid claims
- UHC EOB PDF import and manual entry
- Duplicate EOB detection
- PostgreSQL persistence

## Usage

```bash
docker run -d \
  -e DB_HOST=your-postgres-host \
  -e DB_PORT=5432 \
  -e DB_NAME=eobtracker \
  -e DB_USER=eobtracker \
  -e DB_PASSWORD=your-password \
  -p 8140:80 \
  derpmhichurp/eobtracker-backend:latest
```

## Environment Variables

- `DB_HOST` - PostgreSQL host (LAN hostname/IP or remote server)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `PORT` - Server port (default: 80)

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/dashboard` - Claim status summary
- `GET /api/eobs` - List EOB statements
- `POST /api/eobs/parse-pdf` - Parse UHC EOB PDF(s)

See the GitHub repository for full documentation.
