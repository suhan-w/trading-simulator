# Signal Trader (ASX paper simulator)

**React + Tailwind**, **FastAPI**, **PostgreSQL**, **Lightweight Charts**, and **[Alpha Vantage](https://www.alphavantage.co/)** for **AUD** quotes and daily history on **ASX `.AX`** symbols. Each user **registers with their own Alpha Vantage API key**; all market calls use that key (subject to Alpha Vantage rate limits). Members follow **pre-generated signals from their own strategy code** and **execute trades manually**.

## Product (three screens)

1. **Trading** — Ticker, **BUY/SELL**, quantity, **live quote** (Alpha Vantage `GLOBAL_QUOTE`); **cash** and **portfolio value**; **market orders only when ASX is open** (Mon–Fri **10:00–16:00 Melbourne**, AEST/AEDT; Victorian public holidays closed); optional **position sizing** hints.
2. **Portfolio** — Holdings with **unrealised P/L per stock**, **cash**, **total value** (mark-to-market via your API key).
3. **Performance report** — Date range → equity curve, return %, per-stock returns (daily adjusted closes), stats, and **portfolio vs ASX 200 proxy** (**STW.AX** ETF on Alpha Vantage; not the raw index).

**Auth:** **Register** (email, password, API key), **Log in**, or **Guest** (no key until you save one under **Account**). Guests cannot fetch quotes or place market orders until a key is set.

There is **no** stock discovery, signal log, journal, leaderboard, social features, backtesting, or strategy submission in this codebase.

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
python3 -m venv .venv && source .venv/bin/activate
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
| `ALPHA_VANTAGE_MIN_INTERVAL_SEC` | Min seconds between AV requests **per API key** (default `12.5`; free tier ≈5 calls/min) |
| `VITE_API_URL` | Optional; omit for `/api` proxy |

## API (high level)

- `POST /api/auth/register` — body: `email`, `password`, `alpha_vantage_api_key`
- `POST /api/auth/login` — body: `email`, `password`
- `POST /api/auth/guest` — anonymous session (no key)
- `PATCH /api/auth/alpha-vantage-key` — body: `alpha_vantage_api_key` (authenticated)
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/market/session` — ASX open/closed, Melbourne clock, countdown to next open, holiday/weekend reason
- `GET /api/market/quote/{ticker}` — requires saved API key
- `POST /api/orders`, `GET /api/orders`
- `GET /api/portfolio`, `GET /api/portfolio/equity-history`
- `GET /api/performance/report?start=&end=` — full performance payload (can be slow with many tickers on free tier)

Authenticated routes need `Authorization: Bearer <token>`.

## Notes

- API keys are stored **server-side** in the database (protect production with HTTPS and access control).
- Alpha Vantage **free tier** is rate-limited; performance reports that fetch many daily series may take noticeable time.
- Limit orders remain in the API; the trading UI submits **market** orders only.

## License

Use for learning and demos. Not financial advice.
