import { useEffect, useState } from 'react'
import { DEFAULT_LOCAL_SETTINGS, DEFAULT_SYNC_SETTINGS, PRESET_ELEVENLABS_VOICES, getSettings, normalizeBackendUrl, normalizeElevenLabsVoiceId } from '../../configs'

type Settings = Awaited<ReturnType<typeof getSettings>>
type ElevenLabsVoice = {
  voice_id: string
  name: string
  category?: string
  labels?: Record<string, string>
}

export default function App() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SYNC_SETTINGS, ...DEFAULT_LOCAL_SETTINGS })
  const [message, setMessage] = useState('')
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [showCustomApiHost, setShowCustomApiHost] = useState(false)
  const displayVoices = voices.length > 0 ? voices : PRESET_ELEVENLABS_VOICES

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
  }, [])

  function getBackendOrigin(url: string): string {
    try {
      return `${new URL(url).origin}/*`
    } catch {
      return ''
    }
  }

  async function save() {
    const backendUrl = normalizeBackendUrl(settings.backendUrl)
    const elevenLabsApiKey = String(settings.elevenLabsApiKey || '').trim()
    const elevenLabsVoiceId = normalizeElevenLabsVoiceId(settings.elevenLabsVoiceId)
    if (backendUrl) {
      const origin = getBackendOrigin(backendUrl)
      const granted = origin
        ? await browser.permissions.request({ origins: [origin] }).catch(() => false)
        : false
      if (!granted) {
        setMessage('Host permission not granted')
        window.setTimeout(() => setMessage(''), 1600)
        return
      }
    }
    await browser.storage.sync.set({
      backendUrl,
      elevenLabsVoiceId,
    })
    await browser.storage.local.set({
      elevenLabsApiKey,
    })
    setSettings({ backendUrl, elevenLabsVoiceId, elevenLabsApiKey })
    setMessage('Saved')
    window.setTimeout(() => setMessage(''), 1200)
  }

  function formatVoiceLabel(voice: ElevenLabsVoice): string {
    const labels = voice.labels || {}
    const details = [labels.gender, labels.age, labels.accent, voice.category].filter(Boolean)
    return details.length ? `${voice.name} - ${details.join(', ')}` : voice.name
  }

  async function loadVoices() {
    const apiKey = String(settings.elevenLabsApiKey || '').trim()
    if (!apiKey) {
      setMessage('Enter API key first')
      window.setTimeout(() => setMessage(''), 1600)
      return
    }

    setLoadingVoices(true)
    setMessage('Loading voices...')
    try {
      const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
        headers: {
          'xi-api-key': apiKey,
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : 'Could not load voices'
        throw new Error(detail)
      }

      const nextVoices = Array.isArray(payload?.voices)
        ? payload.voices
            .filter((voice: Partial<ElevenLabsVoice>) => voice.voice_id && voice.name)
            .sort((a: ElevenLabsVoice, b: ElevenLabsVoice) => a.name.localeCompare(b.name))
        : []
      setVoices(nextVoices)
      if (nextVoices.length > 0 && !nextVoices.some((voice: ElevenLabsVoice) => voice.voice_id === settings.elevenLabsVoiceId)) {
        setSettings({ ...settings, elevenLabsVoiceId: nextVoices[0].voice_id })
      }
      setMessage(`Loaded ${nextVoices.length} voices`)
      window.setTimeout(() => setMessage(''), 1600)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load voices')
    } finally {
      setLoadingVoices(false)
    }
  }

  async function startReading() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id != null) {
      await browser.tabs.sendMessage(tab.id, { type: 'START_READ_ALOUD_PAGE' }).catch(() => {})
      window.close()
    }
  }

  return (
    <div style={{ padding: 14, display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 760 }}>Unsilent Reader</div>
        <div style={{ color: '#64748b', marginTop: 2 }}>AI read aloud with word tracking.</div>
      </div>

      <button
        type="button"
        onClick={startReading}
        style={{
          height: 36,
          border: 0,
          borderRadius: 8,
          background: '#0f766e',
          color: '#ffffff',
          fontWeight: 760,
          cursor: 'pointer',
        }}
      >
        Read this page
      </button>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: '#334155', fontWeight: 680 }}>ElevenLabs API Key</span>
        <input
          type="password"
          value={settings.elevenLabsApiKey}
          onChange={(event) => setSettings({ ...settings, elevenLabsApiKey: event.currentTarget.value })}
          placeholder="sk_..."
          style={{
            width: '100%',
            height: 34,
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '0 10px',
            background: '#ffffff',
            color: '#0f172a',
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: '#334155', fontWeight: 680 }}>ElevenLabs Voice</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <select
            value={settings.elevenLabsVoiceId}
            onChange={(event) => setSettings({ ...settings, elevenLabsVoiceId: event.currentTarget.value })}
            style={{
              width: '100%',
              height: 34,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '0 10px',
              background: '#ffffff',
              color: '#0f172a',
            }}
          >
            {!displayVoices.some((voice) => voice.voice_id === settings.elevenLabsVoiceId) ? (
              <option value={settings.elevenLabsVoiceId}>{settings.elevenLabsVoiceId}</option>
            ) : null}
            {displayVoices.map((voice) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {formatVoiceLabel(voice)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadVoices}
            disabled={loadingVoices}
            style={{
              height: 34,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              cursor: loadingVoices ? 'default' : 'pointer',
              opacity: loadingVoices ? 0.65 : 1,
              padding: '0 10px',
              whiteSpace: 'nowrap',
            }}
          >
            {loadingVoices ? 'Loading' : 'Load'}
          </button>
        </div>
        <input
          type="text"
          value={settings.elevenLabsVoiceId}
          onChange={(event) => setSettings({ ...settings, elevenLabsVoiceId: event.currentTarget.value })}
          placeholder={DEFAULT_SYNC_SETTINGS.elevenLabsVoiceId}
          style={{
            width: '100%',
            height: 34,
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '0 10px',
            background: '#ffffff',
            color: '#0f172a',
          }}
        />
      </label>

      <div style={{ display: 'grid', gap: showCustomApiHost ? 8 : 0 }}>
        <button
          type="button"
          onClick={() => setShowCustomApiHost(!showCustomApiHost)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 32,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#ffffff',
            color: '#334155',
            fontWeight: 700,
            cursor: 'pointer',
            padding: '0 10px',
          }}
        >
          <span>Custom API host</span>
          <span aria-hidden="true">{showCustomApiHost ? 'Hide' : 'Show'}</span>
        </button>
        {showCustomApiHost ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <input
              type="url"
              value={settings.backendUrl}
              onChange={(event) => setSettings({ ...settings, backendUrl: event.currentTarget.value })}
              placeholder="https://your-tts-api.example.com"
              style={{
                width: '100%',
                height: 34,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '0 10px',
                background: '#ffffff',
                color: '#0f172a',
              }}
            />
          </label>
        ) : null}
      </div>

      <button
        type="button"
        onClick={save}
        style={{
          height: 32,
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: message === 'Saved' ? '#ecfeff' : '#ffffff',
          color: message === 'Saved' ? '#0f766e' : '#334155',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {message || 'Save settings'}
      </button>
    </div>
  )
}
