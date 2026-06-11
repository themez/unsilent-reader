# Contributing

Thanks for helping improve Unsilent Reader.

## Local Setup

Install dependencies:

```bash
pnpm install
pnpm --dir server install
```

Create local environment files:

```bash
cp .env.example .env.local
cp server/.env.example server/.env.local
```

Set `ELEVENLABS_API_KEY` in `server/.env.local` only if you need to run the optional backend.

Run the extension:

```bash
pnpm dev
```

Run the optional backend:

```bash
pnpm backend
```

## Checks

Run these before opening a pull request:

```bash
pnpm compile
pnpm build
pnpm --dir server typecheck
pnpm --dir server build
```

## Pull Requests

- Keep changes scoped to one behavior or concern.
- Include manual test notes for browser/extension behavior.
- Do not commit `.env.local`, `.output`, `.wxt`, `.vercel`, `.next-*`, or generated build output.
- Do not include real API keys, user data, or private deployment tokens in tests, screenshots, or logs.

## Browser Testing

For extension changes, test at least:

- Popup settings save/load.
- Direct ElevenLabs mode with a user-provided key, if available.
- Custom API host mode, if the change touches backend integration.
- Browser speech fallback when AI speech is not configured.
- Page scrolling while read-aloud is active.
- Word click seeking and sentence/word navigation.
