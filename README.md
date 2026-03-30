# lobslab-apps

All web apps running on [lobslab.com](https://lobslab.com) subdomains.

## Apps

| App | URL | Description |
|-----|-----|-------------|
| [crapuler](apps/crapuler/) | [crapuler.lobslab.com](https://crapuler.lobslab.com) | UMich course watchlist dashboard |
| [ballz](apps/ballz/) | [ballz.lobslab.com](https://ballz.lobslab.com) | Bouncing balls physics toy |
| [stellar-siege](apps/stellar-siege/) | [stellar-siege.lobslab.com](https://stellar-siege.lobslab.com) | Cosmic RTS — conquer star systems |
| [ballz-royale](apps/ballz-royale/) | [ballz-royale.lobslab.com](https://ballz-royale.lobslab.com) | Turn-based billiards battle royale |

## Quick Start

### Add a new app

1. Copy the template:
   ```bash
   cp -r apps/_template apps/my-app
   ```

2. Edit `apps/my-app/` — build your app

3. Add to `docker-compose.yml`:
   ```yaml
   my-app:
     build: ./apps/my-app
     restart: unless-stopped
     networks:
       - lobslab
     labels:
       traefik.enable: "true"
       traefik.http.routers.my-app.rule: "Host(`my-app.lobslab.com`)"
       traefik.http.routers.my-app.entrypoints: web
       traefik.http.services.my-app.loadbalancer.server.port: "3000"
   ```

4. Deploy:
   ```bash
   docker compose build my-app && docker compose up -d my-app
   ```

That's it — Traefik auto-discovers it, Cloudflare tunnel already handles `*.lobslab.com`.

See [docs/NEW-APP.md](docs/NEW-APP.md) for the full guide.

## Infrastructure

Apps don't manage their own infrastructure. The routing stack lives in [lobslab-infra](https://github.com/lobs-ai/lobslab-infra):

- **Traefik** — reverse proxy, auto-discovers Docker containers via labels
- **Cloudflare Tunnel** — exposes `*.lobslab.com` to the internet
- **home.lobslab.com** — landing page that auto-discovers all running services

Each app just needs a `Dockerfile`, a `docker-compose.yml` entry, and Traefik labels.

## Development

```bash
# Run an app locally
cd apps/crapuler
node server.mjs
# Open http://localhost:4317

# Build & deploy a specific app
docker compose build crapuler && docker compose up -d crapuler

# Deploy all apps
docker compose up -d --build

# View logs
docker compose logs -f crapuler
```
