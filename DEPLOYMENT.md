# Deployment Guide

CI/CD with GitHub Actions and deployment with Portainer.

## GitHub Actions Setup

### Required Secrets

Configure in **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Description |
|--------|-------------|
| `DOCKER_HUB_TOKEN` | Docker Hub access token ([create one](https://hub.docker.com/settings/security)) |

### Required Variables

Configure in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description |
|----------|-------------|
| `DOCKER_HUB_USERNAME` | Docker Hub username |

### Optional Variables

Also under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_IMAGE_NAME` | `eobtracker-backend` | Backend repository name on Docker Hub |
| `FRONTEND_IMAGE_NAME` | `eobtracker-frontend` | Frontend repository name on Docker Hub |

Images are published as `{DOCKER_HUB_USERNAME}/{BACKEND_IMAGE_NAME}` and `{DOCKER_HUB_USERNAME}/{FRONTEND_IMAGE_NAME}`.

## Image Tagging Strategy

Releases use semver tags in the form **`eobtracker/<version>`** (X.X.X only, no `v` prefix).

| Scenario | Docker tags applied |
|----------|---------------------|
| Stable tag on `main` (e.g. `eobtracker/1.0.0`) | `1.0.0`, `latest` |
| Pre-release on `main` (e.g. `eobtracker/1.0.0-beta.1`) | `1.0.0-beta.1` only (not `latest`) |
| Tag on any other branch | `{version}`, `beta` |

The `beta` tag is a **floating** pre-release pointer (updated on each non-main release). Use a pinned version tag in production when you need a specific build.

### Creating a Release

```bash
# After merging to main
git tag eobtracker/1.0.0
git push origin eobtracker/1.0.0
```

Pre-release from a feature branch:

```bash
git tag eobtracker/1.1.0-beta.1
git push origin eobtracker/1.1.0-beta.1
```

Example images (`youruser` = Docker Hub username):

- `youruser/eobtracker-backend:1.0.0`
- `youruser/eobtracker-backend:latest` (stable on main only)
- `youruser/eobtracker-backend:beta` (tag not on main)
- `youruser/eobtracker-frontend:1.0.0`

### Pull Requests

On PRs to `main`, the workflow:

1. Runs CI (frontend build, backend syntax check)
2. Builds Docker images without pushing
3. Warns if the PR lacks version/release notes (non-blocking)

## Portainer Stack Deployment

### Prerequisites

1. Portainer installed
2. Images built and pushed via GitHub Actions (or built locally)
3. PostgreSQL database with schema applied
4. External `edge` network if using a shared reverse proxy:
   ```bash
   docker network create edge
   ```

### Deploy

1. **Stacks → Add stack** → paste [portainer-stack.yml](portainer-stack.yml)
2. Set environment variables from [portainer-stack.env.example](portainer-stack.env.example)
3. Deploy

### Required Stack Variables

```env
DOCKER_HUB_REGISTRY_USERNAME=your-dockerhub-username
DOCKER_HUB_BACKEND_IMAGE_NAME=eobtracker-backend
DOCKER_HUB_FRONTEND_IMAGE_NAME=eobtracker-frontend
IMAGE_TAG=latest

DB_HOST=postgres.example.com
DB_PORT=5432
DB_NAME=eobtracker
DB_USER=eobtracker
DB_PASSWORD=your-database-password

BACKEND_PORT=8140
FRONTEND_PORT=8150
```

Use `IMAGE_TAG=latest` for production stable releases, `beta` for pre-releases, or a pinned semver (e.g. `1.0.0`).

### Updating the Stack

1. Push a new release tag (or wait for CI to finish)
2. In Portainer, update `IMAGE_TAG` if needed
3. **Editor → Update the stack** to pull new images

## Troubleshooting

### Workflow does not run on tag push

- Tag must match `eobtracker/X.Y.Z` (e.g. `eobtracker/1.0.0`, not `v1.0.0` or `1.0.0`)

### Images not found in Portainer

- Verify `DOCKER_HUB_REGISTRY_USERNAME` matches the account that published the images
- Confirm the tag exists on Docker Hub (`latest`, `beta`, or your semver)

### Database connection from stack

- Use a hostname reachable from the container network (not `localhost`)
- Apply [database/schema.sql](database/schema.sql) and [database/grant-app-user.sql](database/grant-app-user.sql) if needed
