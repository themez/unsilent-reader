import { DEFAULT_LOCAL_SETTINGS, DEFAULT_SYNC_SETTINGS, getSettings } from '../configs'

type TtsReadingResponse = {
  ok?: boolean
  audioBase64?: string
  mimeType?: string
  alignment?: unknown
  normalizedAlignment?: unknown
  backendUrl?: string
  cacheHit?: boolean
  cacheLayer?: 'extension' | 'network'
  error?: string
}

export default defineBackground(() => {
  const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1'
  const ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2'
  const TTS_CACHE_DB_NAME = 'unsilent-reader-tts-cache'
  const TTS_CACHE_STORE_NAME = 'tts-results'
  const TTS_CACHE_VERSION = 1
  const TTS_CACHE_MAX_ENTRIES = 180
  const TTS_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

  function openTtsCacheDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(TTS_CACHE_DB_NAME, TTS_CACHE_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(TTS_CACHE_STORE_NAME)) {
            const store = db.createObjectStore(TTS_CACHE_STORE_NAME, { keyPath: 'key' })
            store.createIndex('createdAt', 'createdAt')
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error || new Error('Unable to open TTS cache'))
      } catch (error) {
        reject(error)
      }
    })
  }

  async function hashCacheKey(input: string): Promise<string> {
    try {
      const bytes = new TextEncoder().encode(input)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    } catch {
      return btoa(unescape(encodeURIComponent(input))).slice(0, 160)
    }
  }

  function getCachedTts(key: string): Promise<TtsReadingResponse | null> {
    return new Promise((resolve) => {
      openTtsCacheDb().then((db) => {
        const tx = db.transaction(TTS_CACHE_STORE_NAME, 'readonly')
        const request = tx.objectStore(TTS_CACHE_STORE_NAME).get(key)
        request.onsuccess = () => {
          const record = request.result as (TtsReadingResponse & { createdAt?: number }) | undefined
          if (!record?.audioBase64) {
            resolve(null)
            return
          }
          if (Date.now() - Number(record.createdAt || 0) > TTS_CACHE_MAX_AGE_MS) {
            resolve(null)
            return
          }
          resolve({ ...record, ok: true, cacheHit: true, cacheLayer: 'extension' })
        }
        request.onerror = () => resolve(null)
        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          try { db.close() } catch {}
        }
      }).catch(() => resolve(null))
    })
  }

  function trimTtsCache(db: IDBDatabase): void {
    try {
      const tx = db.transaction(TTS_CACHE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(TTS_CACHE_STORE_NAME)
      const index = store.index('createdAt')
      const keysRequest = index.getAllKeys()
      keysRequest.onsuccess = () => {
        const keys = keysRequest.result
        const deleteCount = Math.max(0, keys.length - TTS_CACHE_MAX_ENTRIES)
        for (let i = 0;i < deleteCount;i++) store.delete(keys[i])
      }
    } catch {}
  }

  function setCachedTts(key: string, value: TtsReadingResponse): Promise<void> {
    return new Promise((resolve) => {
      if (!value.ok || !value.audioBase64) {
        resolve()
        return
      }
      openTtsCacheDb().then((db) => {
        const tx = db.transaction(TTS_CACHE_STORE_NAME, 'readwrite')
        tx.objectStore(TTS_CACHE_STORE_NAME).put({
          key,
          audioBase64: value.audioBase64,
          mimeType: value.mimeType || 'audio/mpeg',
          alignment: value.alignment,
          normalizedAlignment: value.normalizedAlignment,
          backendUrl: value.backendUrl || '',
          createdAt: Date.now(),
        })
        tx.oncomplete = () => {
          trimTtsCache(db)
          db.close()
          resolve()
        }
        tx.onerror = () => {
          try { db.close() } catch {}
          resolve()
        }
      }).catch(() => resolve())
    })
  }

  function registerContextMenu(): void {
    try {
      Promise.resolve(browser.contextMenus.removeAll()).catch(() => {}).finally(() => {
        try {
          browser.contextMenus.create({
            id: 'unsilent-read-page',
            title: 'Read page with Unsilent',
            contexts: ['page'],
          })
        } catch {}
      })
    } catch {}
  }

  registerContextMenu()

  function normalizeAlignment(input: unknown): unknown {
    try {
      const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
      const characters = Array.isArray(value.characters) ? value.characters.map((char) => String(char || '')) : []
      const starts = Array.isArray(value.character_start_times_seconds)
        ? value.character_start_times_seconds.map((time) => Number(time || 0))
        : []
      const ends = Array.isArray(value.character_end_times_seconds)
        ? value.character_end_times_seconds.map((time) => Number(time || 0))
        : []
      const len = Math.min(characters.length, starts.length, ends.length)
      if (len === 0) return undefined
      return {
        characters: characters.slice(0, len),
        character_start_times_seconds: starts.slice(0, len),
        character_end_times_seconds: ends.slice(0, len),
      }
    } catch {
      return undefined
    }
  }

  async function requestElevenLabsSpeech(text: string, apiKey: string, voiceId: string): Promise<TtsReadingResponse> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.78,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    })
    const data: any = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = data?.detail
      const message = typeof detail === 'string'
        ? detail
        : typeof detail?.message === 'string'
          ? detail.message
          : String(data?.message || `ElevenLabs request failed (${response.status})`)
      return { ok: false, backendUrl: 'api.elevenlabs.io', error: message }
    }
    return {
      ok: true,
      backendUrl: 'api.elevenlabs.io',
      audioBase64: String(data?.audio_base64 || ''),
      mimeType: 'audio/mpeg',
      alignment: normalizeAlignment(data?.alignment),
      normalizedAlignment: normalizeAlignment(data?.normalized_alignment),
    }
  }

  async function requestBackendSpeech(text: string, language: string, backendUrl: string): Promise<TtsReadingResponse> {
    const response = await fetch(`${backendUrl}/api/tts_reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language,
      }),
    })
    const data: any = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, backendUrl, error: String(data?.error || `TTS request failed (${response.status})`) }
    }
    return { ok: true, backendUrl, ...data }
  }

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'unsilent-read-page') return
    const tabId = tab && typeof tab.id === 'number' ? tab.id : undefined
    if (tabId != null) {
      try { await browser.tabs.sendMessage(tabId, { type: 'START_READ_ALOUD_PAGE' }) } catch {}
    }
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (!message || typeof message !== 'object') return
      if ((message as any).type === 'GET_BACKEND_URL') {
        ;(async () => {
          const settings = await getSettings().catch(() => ({ ...DEFAULT_SYNC_SETTINGS, ...DEFAULT_LOCAL_SETTINGS }))
          sendResponse({ backendUrl: settings.elevenLabsApiKey ? 'api.elevenlabs.io' : settings.backendUrl })
        })()
        return true
      }
      if ((message as any).type === 'TTS_READING') {
        const { text, language } = (message as any).payload || {}
        ;(async () => {
          const settings = await getSettings().catch(() => ({ ...DEFAULT_SYNC_SETTINGS, ...DEFAULT_LOCAL_SETTINGS }))
          const backendUrl = settings.elevenLabsApiKey ? 'api.elevenlabs.io' : settings.backendUrl
          const normalizedText = String(text || '')
          const normalizedLanguage = String(language || '')
          if (!settings.elevenLabsApiKey && !settings.backendUrl) {
            sendResponse({ ok: false, backendUrl: '', error: 'AI voice is not configured' })
            return
          }
          const cacheKey = await hashCacheKey([
            'read-aloud-tts-v1',
            settings.elevenLabsApiKey ? 'elevenlabs-direct' : 'custom-backend',
            normalizedLanguage,
            settings.elevenLabsVoiceId,
            backendUrl,
            normalizedText,
          ].join('\n'))
          const cached = await getCachedTts(cacheKey)
          if (cached) {
            sendResponse({ ...cached, backendUrl: cached.backendUrl || backendUrl })
            return
          }

          try {
            const data = settings.elevenLabsApiKey
              ? await requestElevenLabsSpeech(normalizedText, settings.elevenLabsApiKey, settings.elevenLabsVoiceId)
              : await requestBackendSpeech(normalizedText, normalizedLanguage, settings.backendUrl)
            const result = { cacheHit: false, cacheLayer: 'network' as const, ...data }
            await setCachedTts(cacheKey, result)
            sendResponse(result)
          } catch (error) {
            sendResponse({ ok: false, backendUrl, error: error instanceof Error ? error.message : 'Unable to generate speech' })
          }
        })()
        return true
      }
    } catch {}
  })
})
