# Security Policy

## Authentication & Data Isolation Architecture

ClueState enforces authentication by default across all data endpoints:

- **Authorization Header Only:** API keys (`cs_live_...`) and JWT session tokens are accepted strictly via the `Authorization: Bearer <token>` HTTP header. URL query-string authentication is not supported.
- **Hashed API Keys:** Workspace API keys are hashed with SHA-256 before storage; plaintext keys are never persisted in the database.
- **Password Storage:** User passwords are hashed with `PBKDF2-HMAC-SHA256` (260,000 iterations) and a 16-byte cryptographic salt.
- **Workspace Multi-Tenancy:** Entities, topics, episodes, and memories are scoped to an isolated `workspace_id`.

## Production Deployment Checklist

When self-hosting ClueState in production:

1. **Set a Strong `SECRET_KEY`:** Generate a 32-byte random secret (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) and set `SECRET_KEY` in your environment.
2. **Configure `CORS_ORIGINS`:** Restrict `CORS_ORIGINS` to your application domains (e.g., `https://app.cluestate.com,https://cluestate.com`).
3. **Database Credentials:** Use a strong `POSTGRES_PASSWORD` and keep your database on an internal Docker or private VPC network without exposing port `5432` to the public internet.
4. **TLS / HTTPS:** Always serve the API and Platform UI behind TLS (e.g., via Coolify / Traefik, Caddy, or Nginx).

## Reporting a Vulnerability

If you discover a security vulnerability in ClueState, please report it privately by opening a security advisory on GitHub rather than filing a public issue.

