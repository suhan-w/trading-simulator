# Signal Trader (ASX paper simulator)

**React + Tailwind**, **FastAPI**, **PostgreSQL**, **Lightweight Charts**, and **Yahoo Finance** (`yfinance`) for **AUD** live prices on **`.AX`** symbols. Members follow **pre-generated signals from their own strategy code** and **execute trades manually** in the app.

## Product (three screens)

1. **Trading** — Ticker, **BUY/SELL**, quantity, **live Yahoo quote**; **cash** and **portfolio value**; market orders only in the UI.
2. **Portfolio** — Holdings with **unrealised P/L per stock**, **cash**, **total value**.
3. **Performance report** — Date range → portfolio value over time, return % over time, **per-stock return** chart, **win rate** (realised sells), **best/worst trade**, **max drawdown**, **Sharpe**, **trade counts**, and **portfolio vs S&P/ASX 200** (`^AXJO` on Yahoo).

There is **no** stock discovery, search, signal log, journal, leaderboard, social features, backtesting, or strategy submission in this codebase.

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
| `VITE_API_URL` | Optional; omit for `/api` proxy |

## API (high level)

- `POST /api/auth/guest`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/market/quote/{ticker}` — Yahoo ASX (`.AX`) quote
- `POST /api/orders`, `GET /api/orders`
- `GET /api/portfolio`, `GET /api/portfolio/equity-history`
- `GET /api/performance/report?start=YYYY-MM-DD&end=YYYY-MM-DD` — full performance payload (charts + stats)

Authenticated routes need `Authorization: Bearer <token>`.

## Notes

- Yahoo Finance data can be rate-limited or flaky.
- Limit orders remain in the API; the trading UI submits **market** orders only.

## License

Use for learning and demos. Not financial advice.
