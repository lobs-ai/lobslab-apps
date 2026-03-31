# games — Daily Puzzle Dashboard

Personal tracker for daily puzzle games. Mark games as done, hide the ones you don't play, add custom games.

Live at [games.lobslab.com](https://games.lobslab.com)

## Stack

- Pure HTML/CSS/JS — no build step, no frameworks
- Persistence via localStorage (completion status resets daily)
- Static file server via `server.mjs`

## Dev

```bash
node server.mjs
# Open http://localhost:3000
```
