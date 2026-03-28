# Deployment

## Deploy a single app

```bash
docker compose build app-name
docker compose up -d app-name
```

## Deploy all apps

```bash
docker compose up -d --build
```

## Update an app

1. Make your changes in `apps/your-app/`
2. Rebuild and restart:
   ```bash
   docker compose build your-app && docker compose up -d your-app
   ```
3. If you hit Cloudflare caching issues, bump the `?v=N` query param on CSS/JS links in your HTML

## View logs

```bash
# All apps
docker compose logs -f

# Specific app
docker compose logs -f crapuler
```

## Restart an app

```bash
docker compose restart crapuler
```

## Stop an app

```bash
docker compose stop crapuler
```

This removes it from Traefik's routing. It won't appear on home.lobslab.com until restarted.

## Remove an app entirely

1. Stop and remove the container:
   ```bash
   docker compose down crapuler
   ```
2. Remove its entry from `docker-compose.yml`
3. Delete `apps/your-app/`

## Troubleshooting

### App not accessible
- Check it's running: `docker compose ps`
- Check logs: `docker compose logs your-app`
- Verify Traefik labels are correct in docker-compose.yml
- Make sure the port in labels matches the Dockerfile EXPOSE

### Stale content after deploy
Cloudflare caches static assets aggressively. Solutions:
- Add `Cache-Control: no-cache` headers (template server does this)
- Bump `?v=N` on asset URLs in HTML
- Wait for CF cache to expire (~4 hours default)

### Container won't start
- Check the Dockerfile builds: `docker compose build your-app`
- Run it interactively: `docker compose run --rm your-app sh`
