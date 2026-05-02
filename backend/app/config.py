from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/trading_sim"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    # production | deployment | prod → RESEND_API_KEY required for signup; development allows log-only codes without mail
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("ENVIRONMENT", "environment"),
        description="Use production/deployment in live environments (requires RESEND_API_KEY for registration).",
    )
    # Email verification (Resend). Required in deployment so verification codes can be emailed.
    resend_api_key: str | None = Field(default=None, description="Resend API key — never commit")
    public_app_url: str = Field(
        default="http://localhost:5173",
        description="Public frontend URL (no trailing slash) — used in verification links",
    )
    resend_from_email: str = Field(
        default="onboarding@resend.dev",
        description="Must be from a domain verified in Resend (free tier often restricts who can receive mail)",
    )
    # Comma-separated extra CORS origins (e.g. https://yourdomain.com). Env: CORS_EXTRA_ORIGINS
    cors_extra_origins: str = ""
    # Admin UI / API: optional extra allowed Origin for /api/admin (in addition to public_app_url). Env: ADMIN_ORIGIN
    admin_origin: str | None = Field(default=None, validation_alias=AliasChoices("ADMIN_ORIGIN", "admin_origin"))
    # Comma-separated extra origins allowed for /api/admin only. Env: ADMIN_ALLOWED_ORIGINS
    admin_allowed_origins: str = Field(
        default="",
        validation_alias=AliasChoices("ADMIN_ALLOWED_ORIGINS", "admin_allowed_origins"),
    )
    # Shorter session for moderator/super_admin JWTs (also enforced via iat in get_current_admin).
    admin_access_token_expire_minutes: int = Field(
        default=30,
        validation_alias=AliasChoices("ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", "admin_access_token_expire_minutes"),
    )
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
