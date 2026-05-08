"""Send transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email)."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

RESEND_API = "https://api.resend.com/emails"


def send_verification_code_email(to_email: str, code: str) -> None:
    if not settings.resend_api_key:
        raise RuntimeError("Resend is not configured (RESEND_API_KEY missing)")

    base = settings.public_app_url.rstrip("/")
    open_app = f"{base}/"

    html = f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
  <p>Your Cowrie Shell verification code is:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:0.2em;font-family:ui-monospace,monospace;color:#111;">{code}</p>
  <p>Enter this 6-digit code on the sign-in page to finish creating your session. The code expires in 48 hours.</p>
  <p><a href="{open_app}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">Open Cowrie Shell</a></p>
  <p style="font-size:12px;color:#666;">If you did not create an account, you can ignore this message.</p>
</body></html>"""

    text_body = (
        f"Your Cowrie Shell verification code is: {code}\n\n"
        "Enter this 6-digit code on the sign-in page. It expires in 48 hours.\n\n"
        f"Open the app: {open_app}\n"
    )

    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": "Your Cowrie Shell verification code",
        "html": html,
        "text": text_body,
    }

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=20.0) as client:
        r = client.post(RESEND_API, json=payload, headers=headers)
        if r.status_code >= 400:
            raw = (r.text or "")[:2000]
            logger.warning("Resend API error %s: %s", r.status_code, raw)
            api_msg = raw
            try:
                data = r.json()
                if isinstance(data, dict):
                    api_msg = str(data.get("message") or data.get("error") or data.get("name") or raw)
            except Exception:
                pass
            raise RuntimeError(f"Resend HTTP {r.status_code}: {api_msg}") from None
