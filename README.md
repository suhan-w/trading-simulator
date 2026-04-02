# PaperTrade

Single-user **ASX paper trading** app: **React + Tailwind**, **FastAPI**, **PostgreSQL**, **Lightweight Charts**, and **Yahoo Finance** (`yfinance`) for live **AUD** prices on **`.AX`** symbols.

## Features

- **A$100,000 virtual cash** per session (guest JWT). No social or leaderboard.
- **ASX**: tickers use Yahoo’s **`.AX`** suffix (e.g. `BHP.AX`); plain codes like `CBA` are normalized to `CBA.AX`. Search prefers ASX listings.
- **Market clock**: UI shows **Open / Closed** for ASX regular hours (Mon–Fri **10:00–16:00 Sydney**); `GET /api/market/asx-session` returns the same (public holidays not modeled).
- **Trade**: search tickers, market & limit buy/sell, live quote refresh (~30s on dashboard).
- **Dashboard**: portfolio value over time (line chart), cash, total return, unrealized P/L, holdings with per-stock P/L.
- **Journal**: optional notes on each fill (`PATCH /api/transactions/{id}/notes`).

## Project layout

```
├── docker-compose.yml
├── backend/          # FastAPI
└── frontend/         # Vite + React
```

## Docker

```bash
docker compose up --build
```

- App: [http://localhost:8080](http://localhost:8080)
- API: [http://localhost:8000/docs](http://localhost:8000/docs)

The UI uses same-origin `/api`; nginx proxies to the API container.

Stop: `Ctrl+C` then `docker compose down`.

### Database schema changes

If you upgraded from an older image and see SQL errors about missing columns, reset the DB volume once:

```bash
docker compose down -v
docker compose up --build
```

## Local development

PostgreSQL (example):

```bash
docker run --name trading-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trading_sim -p 5432:5432 -d postgres:16-alpine
```

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_sim
export SECRET_KEY=dev-secret
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL URL |
| `SECRET_KEY` | JWT signing key |
| `INITIAL_CASH` | Starting cash in **AUD** (default `100000`) in `app/config.py` |
| `VITE_API_URL` | Optional; omit for `/api` proxy |

## API (high level)

- `POST /api/auth/guest`, `GET /api/auth/me`, `POST /api/auth/logout`
- Market: `asx-session`, `search`, `quote`, `chart`
- `POST /api/orders`, `GET /api/orders`, `GET /api/transactions`, `PATCH /api/transactions/{id}/notes`
- `GET /api/portfolio`, `GET /api/portfolio/equity-history`

Authenticated routes need `Authorization: Bearer <token>`.

## Notes

- Yahoo Finance data can be rate-limited or flaky.
- Limit orders fill when portfolio/quotes refresh (e.g. dashboard 30s poll).

## License

Use for learning and demos. Not financial advice.
