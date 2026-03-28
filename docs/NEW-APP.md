# Adding a New App to Lobs Lab

This guide walks you through adding a new app to lobslab.com. Total time: ~5 minutes.

## Prerequisites

- Docker and Docker Compose on the host
- The `lobslab` Docker network exists (created by lobslab-infra)
- Traefik is running (managed by lobslab-infra)

## Step 1: Copy the template

```bash
cp -r apps/_template apps/your-app-name
cd apps/your-app-name
```

## Step 2: Build your app

The template gives you:
- `index.html` — your page
- `styles.css` — your styles
- `app.js` — your client-side JavaScript
- `server.mjs` — a zero-dependency Node.js static file server
- `Dockerfile` — builds and runs the server
- `package.json` — metadata

Edit these files to build whatever you want. The server serves static files from the app directory and listens on port 3000 by default.

### If you need an API

Add routes to `server.mjs`. Example:

```javascript
// In the request handler, before the static file fallback:
if (url.pathname === "/api/data") {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ hello: "world" }));
  return;
}
```

### If you need npm packages

Add a `package-lock.json` and update the Dockerfile:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.mjs"]
```

### If it's a static-only app (no server needed)

Use nginx instead of Node:

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html/
EXPOSE 80
```

And set the port to `80` in the docker-compose labels.

## Step 3: Add to docker-compose.yml

Add your service to the root `docker-compose.yml`:

```yaml
  your-app-name:
    build: ./apps/your-app-name
    restart: unless-stopped
    networks:
      - lobslab
    labels:
      traefik.enable: "true"
      traefik.http.routers.your-app-name.rule: "Host(`your-app-name.lobslab.com`)"
      traefik.http.routers.your-app-name.entrypoints: web
      traefik.http.services.your-app-name.loadbalancer.server.port: "3000"
```

**Important:**
- The router name (e.g. `traefik.http.routers.your-app-name`) must be unique
- The hostname becomes `your-app-name.lobslab.com`
- The port must match what your Dockerfile EXPOSEs

## Step 4: Deploy

```bash
# From the repo root
docker compose build your-app-name
docker compose up -d your-app-name
```

Your app is now live at `https://your-app-name.lobslab.com`. No DNS changes needed — the wildcard `*.lobslab.com` CNAME + Cloudflare tunnel handles it automatically.

## Step 5: Verify

```bash
# Check it's running
docker compose ps your-app-name

# Check logs
docker compose logs your-app-name

# Test the URL
curl -I https://your-app-name.lobslab.com
```

The app should also appear on [home.lobslab.com](https://home.lobslab.com) automatically (Traefik service discovery).

## How It Works

```
Internet → Cloudflare → Tunnel → Traefik → Your Container
                                    ↑
                         Routes by hostname
                         (*.lobslab.com)
```

1. Cloudflare proxies all `*.lobslab.com` traffic through a tunnel to the host
2. The tunnel sends traffic to Traefik (reverse proxy)
3. Traefik reads Docker labels to discover services and route by hostname
4. Your container receives the request

No config files to edit in Traefik or Cloudflare — just Docker labels.

## Shared Identity (lobslab_id)

All apps on `*.lobslab.com` share a `lobslab_id` cookie set by `home.lobslab.com`. This is a UUID that identifies the user across all apps.

To read it server-side:
```javascript
function getLobslabId(req) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/lobslab_id=([^;]+)/);
  return match?.[1] ?? null;
}
```

To read it client-side:
```javascript
const id = document.cookie.match(/lobslab_id=([^;]+)/)?.[1];
```

Or fetch from any app's `/api/me` endpoint (if implemented).

## Tips

- **Static assets:** Set `Cache-Control: no-cache, must-revalidate` to prevent Cloudflare from caching stale files. The template server does this by default.
- **Cache busting:** Use `?v=N` query params on CSS/JS links in your HTML if you hit caching issues.
- **Local dev:** Run `node server.mjs` directly — no Docker needed for development.
- **Logs:** `docker compose logs -f your-app-name` to debug issues.
