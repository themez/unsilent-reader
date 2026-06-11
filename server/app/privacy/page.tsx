export const metadata = {
  title: 'Unsilent Reader Privacy Policy',
}

const updatedAt = 'June 10, 2026'

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: 820,
      margin: '0 auto',
      padding: '48px 24px',
      color: '#172033',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: 1.65,
    }}>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: '0 0 8px' }}>Unsilent Reader Privacy Policy</h1>
      <p style={{ marginTop: 0, color: '#5f6b7a' }}>Last updated: {updatedAt}</p>

      <h2>Overview</h2>
      <p>
        Unsilent Reader is a Chrome extension that reads web pages aloud. It extracts readable text from
        the active page after a user action, sends that text to the configured speech provider, and uses
        the returned audio and timing data to play speech with word highlighting.
      </p>

      <h2>Information We Handle</h2>
      <p>
        The extension may handle the text content of the current web page, the user&apos;s ElevenLabs API
        key, selected voice settings, optional custom API host settings, playback preferences, and local
        cache metadata. The extension does not collect browsing history, personal communications,
        location, or user activity for analytics or advertising.
      </p>

      <h2>How Information Is Used</h2>
      <p>
        Page text is used only to generate speech for the page the user chooses to read. API keys and
        voice settings are used only to make speech requests requested by the user. Configuration values
        are stored locally by the browser extension so the user does not need to re-enter them.
      </p>

      <h2>Sharing With Third Parties</h2>
      <p>
        When ElevenLabs is selected, page text is sent to ElevenLabs to generate audio. When a custom API
        host is configured, page text is sent to that host. Unsilent Reader does not sell user data and
        does not transfer user data for advertising, profiling, creditworthiness, or unrelated purposes.
      </p>

      <h2>Data Retention</h2>
      <p>
        Extension settings are retained in the user&apos;s browser until the user changes them, clears browser
        storage, or uninstalls the extension. The backend does not intentionally store submitted page text
        or generated audio beyond transient processing needed to respond to the request.
      </p>

      <h2>Security</h2>
      <p>
        API keys are stored in browser extension storage and are transmitted only to the selected speech
        provider or custom API host when the user requests speech generation. Users should only configure
        custom API hosts they trust.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions about Unsilent Reader, contact the publisher through the Chrome Web Store
        listing.
      </p>
    </main>
  )
}
