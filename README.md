# Unsilent Reader

Unsilent Reader is a Chrome extension that turns readable web pages into a focused read-aloud experience with AI voice, word highlighting, paragraph-level generation, local TTS caching, and precise word/sentence seeking.

The extension can use a user-provided ElevenLabs API key directly from the browser, or an optional custom API host for private deployments.

## Features

- Read aloud readable page content from the active tab.
- Generate AI speech with ElevenLabs or a compatible custom API host.
- Highlight words as they are spoken.
- Seek by clicking a word on the page.
- Navigate by sentence or word from the floating player.
- Cache generated speech locally to reduce repeated requests.
- Fall back to the browser speech engine when AI voice is unavailable.
- Inspect recent TTS requests and cache hits from the floating player.

## Repository Layout

```text
.
├── components/              Shared React UI for the extension
├── configs/                 Extension settings and voice presets
├── entrypoints/             WXT extension entrypoints
├── features/                Page extraction and read-aloud runtime
├── public/                  Extension icons
├── server/                  Optional Next.js custom API host
└── store-assets/            Chrome Web Store listing notes and screenshots
```

## Requirements

- Node.js 20 or newer
- pnpm 10
- Chrome or another Chromium-based browser for local extension testing
- Optional: an ElevenLabs API key for AI speech

## Extension Development

Install dependencies:

```bash
pnpm install
```

Run the extension dev build:

```bash
pnpm dev
```

Load the generated unpacked extension from:

```text
.output/chrome-mv3-dev
```

Build and package:

```bash
pnpm compile
pnpm build
pnpm zip
```

The packaged Chrome extension zip is written under `.output/`.

## AI Voice Setup

The easiest setup is direct ElevenLabs access:

1. Open the extension popup.
2. Enter your ElevenLabs API key.
3. Load voices or choose a preset voice.
4. Save settings.
5. Start reading a readable page.

The API key is stored in browser-local extension storage. It is not committed to this repository and should not be shared.

## Optional Custom API Host

Unsilent Reader can use a custom API host instead of direct ElevenLabs access. This is useful for private deployments, shared quotas, or provider abstraction.

The host must implement:

```text
POST /api/tts_reading
```

Request body:

```json
{
  "text": "Text to read aloud",
  "language": "en"
}
```

Expected response:

```json
{
  "ok": true,
  "audioBase64": "base64-encoded audio",
  "mimeType": "audio/mpeg",
  "alignment": {
    "characters": ["H", "i"],
    "character_start_times_seconds": [0, 0.1],
    "character_end_times_seconds": [0.1, 0.2]
  }
}
```

## Backend Development

The optional backend lives in `server/`.

Install backend dependencies:

```bash
pnpm --dir server install
```

Create local environment files from the examples:

```bash
cp .env.example .env.local
cp server/.env.example server/.env.local
```

Set `ELEVENLABS_API_KEY` in `server/.env.local`, then run:

```bash
pnpm backend
```

The local backend runs on `http://localhost:3000`. Localhost API hosts are normalized away in the extension settings so accidental localhost defaults are not shipped to users.

Backend checks:

```bash
pnpm --dir server typecheck
pnpm --dir server build
```

## Data And Privacy

Unsilent Reader handles page text only after the user starts read-aloud on a page.

- With direct ElevenLabs access, page text is sent to ElevenLabs to generate audio.
- With a custom API host, page text is sent to the configured host.
- The extension stores settings, the user-provided ElevenLabs API key, selected voice ID, and speech cache data in browser extension storage.
- The optional backend does not intentionally persist submitted page text or generated audio beyond transient request processing.
- The project does not include analytics or advertising code.

The hosted privacy policy page for the current backend deployment is:

```text
https://unsilent-reader-server.vercel.app/privacy
```

## Controls

- Click any highlighted/readable word in the page to seek to that word.
- `Left` / `Right`: previous or next sentence.
- `Shift + Left` / `Shift + Right`: previous or next word.
- Use the bug button in the floating player to inspect TTS requests and cache hits.

## Chrome Web Store Assets

Store listing notes and screenshots are kept in `store-assets/`. They are included to make the review package reproducible, but they are not required for local development.

## Security

Do not commit real API keys or deployment tokens. Use `.env.local` files for local secrets and Vercel environment variables for hosted deployments.

If you find a vulnerability, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, checks, and pull request expectations.

## License

MIT. See [LICENSE](LICENSE).
