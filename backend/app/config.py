from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/trading_sim"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    initial_cash: float = Field(
        default=100_000.0, description="Starting virtual cash per user (AUD)"
    )
    # Free Alpha Vantage tier: 5 API calls/minute — space calls per user key to avoid 429/throttle messages.
    alpha_vantage_min_interval_sec: float = Field(
        default=12.5,
        description="Minimum seconds between Alpha Vantage requests per API key",
    )
    alpha_vantage_daily_request_limit: int = Field(
        default=25,
        description="Alpha Vantage free tier: max API calls per calendar day per user key (cached tickers reuse DB)",
    )


settings = Settings()
