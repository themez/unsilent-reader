# Security Policy

## Supported Versions

Security fixes are handled on the default branch. This project is pre-1.0, so only the latest commit on the default branch is considered supported.

## Reporting A Vulnerability

Please do not open a public issue for suspected vulnerabilities that expose secrets, user data, or private infrastructure details.

Report security issues by using GitHub Security Advisories when available, or by contacting the repository owner through the published project contact channel.

Include:

- A short description of the issue.
- Steps to reproduce.
- Impact and affected components.
- Any relevant logs or screenshots with secrets removed.

## Secrets

Never commit real API keys, Vercel tokens, browser profile data, or user page content. Use `.env.local` files locally and provider-managed environment variables in deployment.
