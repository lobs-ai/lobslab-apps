# Architecture

## System Overview

```
┌─────────────────────────────────────────────┐
│                  Internet                    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│            Cloudflare (CDN/Proxy)            │
│         *.lobslab.com → tunnel              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          cloudflared (tunnel agent)          │
│         Forwards to traefik:80              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Traefik (proxy)                 │
│     Routes by Host header to containers     │
│     Auto-discovers via Docker labels        │
└───┬──────────┬──────────┬──────────┬────────┘
    │          │          │          │
  home    crapuler     ballz    your-app
  :3000    :4317       :80      :3000
```

## Repos

| Repo | Purpose |
|------|---------|
| **lobslab-infra** | Traefik, Cloudflare tunnel, home page, Docker networking |
| **lobslab-apps** (this repo) | All user-facing web apps |

## Docker Networking

All containers join the `lobslab` Docker network (created by lobslab-infra). Traefik is on this network and discovers containers by reading their labels.

The network is `external: true` in this repo's docker-compose — it must already exist (lobslab-infra creates it).

## App Patterns

### Static app (no server)
- Just HTML/CSS/JS files
- Use `nginx:alpine` Dockerfile
- Port 80
- Example: ballz

### Dynamic app (Node.js server)
- `server.mjs` handles both static files and API routes
- Zero npm dependencies (uses `node:http`, `node:fs`)
- Port 3000 (or custom)
- Example: crapuler

### Adding APIs
Add route handlers in `server.mjs` before the static file fallback.

## Shared Cookie (lobslab_id)
`home.lobslab.com` sets a `lobslab_id` cookie on `.lobslab.com` (2-year expiry). All subdomains receive this cookie automatically. It's a UUID that persists across visits — useful for personalization without auth.
