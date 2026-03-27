# Less Crapuler

Local dashboard for watching many Crapuler classes at once.

## Run it

```bash
./bin/open
```

That starts the server if needed and opens `http://localhost:4317`.

## Useful commands

```bash
./bin/run
./bin/open
./bin/stop
./bin/restart
./bin/status
```

You can also use the npm aliases:

```bash
npm run open
npm run run
npm run stop
npm run restart
npm run status
```

## How it works

- The browser talks to the local Node server.
- The local server proxies live requests to `https://www.crapuler.com`.
- This avoids the browser CORS block that would happen if the page tried to hit Crapuler directly.

## Notes

- Term search is live.
- Broad title search is backed by a local in-memory term index built from Crapuler endpoints on demand.
- The first broad search for a term can take longer while that local cache warms.
- Widget refreshes poll live course pages and meeting data.
