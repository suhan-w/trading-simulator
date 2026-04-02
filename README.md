# Trading Strategy Simulator

Full-stack paper trading platform: **React + Tailwind CSS** frontend, **FastAPI** backend, **PostgreSQL** database, **TradingView Lightweight Charts**, and market data from **Yahoo Finance** via `yfinance`.

## Features

- **Authentication**: Register, login, logout with **JWT** bearer tokens. Each new user starts with **$100,000** virtual cash.
- **Market data**: Search symbols, live quotes, OHLCV for charts. The UI refreshes quotes on a **30-second** interval.
- **Trading**: Market and limit orders, buy/sell, transaction history on the dashboard.
- **Portfolio**: Holdings, cash, total equity, unrealized P/L per line and overall, total return vs starting balance.
- **Charts**: Candlestick charts (Lightweight Charts) with selectable range.
- **Backtesting**: SMA crossover strategy on historical data; metrics include total return, win rate, max drawdown, trade count.
- **Leaderboard**: Users ranked by **% gain/loss** since the $100k starting point.

## Project layout

```
trading-simulator/
├── docker-compose.yml      # Postgres + API + static frontend
├── README.md
├── backend/                  # FastAPI app
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── security.py
│       ├── deps.py
│       ├── routers/
│       └── services/
└── frontend/                 # Vite + React
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
```

## Quick start with Docker

Prerequisites: **Docker** and **Docker Compose**.

1. Clone or copy this project and open a terminal in `trading-simulator/`.

2. (Optional) Copy environment file and set a strong JWT secret:

   ```bash
   cp .env.example .env
   # Edit .env and set SECRET_KEY
   ```

3. Build and start:

   ```bash
   docker compose up --build
   ```

4. Open the app:

   - **Frontend**: [http://localhost](http://localhost) (port 80)
   - **API docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health**: [http://localhost:8000/health](http://localhost:8000/health)

The browser calls the API at `http://localhost:8000` (configured at **build time** for the frontend via `VITE_API_URL`).

5. Register an account and start trading.

To stop:

```bash
docker compose down
```

## Local development (without Docker for Node/Python)

### Database

Run PostgreSQL (for example with Docker):

```bash
docker run --name trading-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trading_sim -p 5432:5432 -d postgres:16-alpine
```

### Backend

Use **Python 3.11 or 3.12** for the smoothest installs (wheels for scientific stacks). The API uses **psycopg3** (`postgresql+psycopg://` is applied automatically in code).

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_sim
export SECRET_KEY=your-dev-secret
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Tables are created automatically on startup (`create_all`).

### Frontend

```bash
cd frontend
cp .env.example .env.development
# Ensure VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLAlchemy URL for PostgreSQL |
| `SECRET_KEY` | JWT signing key (set in production) |
| `INITIAL_CASH` | Starting balance (default `100000`) — wired in `app/config.py` |
| `VITE_API_URL` | Frontend API base URL (Vite env, build-time) |

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/market/search`, `GET /api/market/quote/{ticker}`, `GET /api/market/chart/{ticker}`
- `POST /api/orders`, `GET /api/orders`, `GET /api/transactions`
- `GET /api/portfolio`
- `POST /api/backtest`
- `GET /api/leaderboard`

All routes except register/login require `Authorization: Bearer <token>`.

## Notes

- **Yahoo Finance** data depends on public endpoints; rate limits or occasional failures can occur. Retry or wait if quotes fail.
- Limit orders are evaluated when portfolio or quotes are refreshed (including the 30s UI polling).
- Backtesting uses a **simple SMA crossover**; extend `app/services/backtest_service.py` for other strategies.

## License

Use and modify for learning and demos. Not financial advice.
