# Security

## Reporting vulnerabilities

Please report security issues to the maintainers privately.

## Exposed API keys

If an API key was accidentally committed to this repository:

1. **Rotate the key immediately** — Revoke the exposed key and create a new one at [Google AI Studio](https://aistudio.google.com/apikey) or [Anthropic Console](https://console.anthropic.com).
2. **Never commit `.env` files** — They are listed in `.gitignore`. Use environment variables or a secrets manager instead.
