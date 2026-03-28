# Less Crapuler

A real-time course watchlist dashboard for UMich. Track enrollment, waitlist, and seat availability across multiple courses with auto-refreshing widgets.

**Live:** [crapuler.lobslab.com](https://crapuler.lobslab.com)

## Features
- Search and add any UMich course as a dashboard widget
- Real-time enrollment/waitlist/seat data with auto-refresh
- Drag-and-drop widget reordering with smooth animations
- Collapsible widgets with section-level detail
- Dark/light theme toggle
- Data persisted in localStorage

## Development

```bash
node server.mjs
# Open http://localhost:4317
```

## Data

Course data is scraped and stored in `data/`. The scraper tooling is in `bin/` and `scripts/`.
