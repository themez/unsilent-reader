import { NextResponse } from 'next/server'

type ElevenLabsAlignment = {
  characters?: string[]
  character_start_times_seconds?: number[]
  character_end_times_seconds?: number[]
}

const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2'
const MAX_TEXT_CHARS = 2800
const MAX_PROVIDER_ATTEMPTS = 3
const RETRYABLE_PROVIDER_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function sanitizeText(input: unknown): string {
  return String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

function toAlignment(input: unknown): ElevenLabsAlignment {
  const value = input && typeof input === 'object' ? input as ElevenLabsAlignment : {}
  return {
    characters: Array.isArray(value.characters) ? value.characters.map((char) => String(char || '')) : [],
    character_start_times_seconds: Array.isArray(value.character_start_times_seconds)
      ? value.character_start_times_seconds.map((time) => Number(time || 0))
      : [],
    character_end_times_seconds: Array.isArray(value.character_end_times_seconds)
      ? value.character_end_times_seconds.map((time) => Number(time || 0))
      : [],
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readProviderError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  const detail = data && typeof data === 'object' ? (data as any).detail : null
  const message = typeof detail === 'string'
    ? detail
    : typeof detail?.message === 'string'
      ? detail.message
      : typeof (data as any)?.message === 'string'
        ? (data as any).message
        : ''
  return message || `ElevenLabs request failed (${response.status})`
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const text = sanitizeText((body as any).text)
    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim()
    if (!apiKey) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured' }, { status: 503 })
    }

    const voiceId = String(process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID).trim()
    const modelId = String(process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID).trim()
    const stability = Number(process.env.ELEVENLABS_STABILITY || 0.45)
    const similarityBoost = Number(process.env.ELEVENLABS_SIMILARITY_BOOST || 0.78)
    const style = Number(process.env.ELEVENLABS_STYLE || 0)
    const useSpeakerBoost = String(process.env.ELEVENLABS_USE_SPEAKER_BOOST || 'true') !== 'false'

    let data: any = null
    let lastProviderStatus = 0
    let lastProviderError = ''
    for (let attempt = 1;attempt <= MAX_PROVIDER_ATTEMPTS;attempt++) {
      let upstream: Response
      try {
        upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
              use_speaker_boost: useSpeakerBoost,
            },
          }),
        })
      } catch (error) {
        lastProviderError = error instanceof Error ? error.message : 'Unable to reach TTS provider'
        if (attempt === MAX_PROVIDER_ATTEMPTS) break
        await sleep(350 * attempt)
        continue
      }

      if (upstream.ok) {
        data = await upstream.json().catch(() => ({}))
        break
      }

      lastProviderStatus = upstream.status
      lastProviderError = await readProviderError(upstream)
      if (!RETRYABLE_PROVIDER_STATUSES.has(upstream.status) || attempt === MAX_PROVIDER_ATTEMPTS) break
      await sleep(350 * attempt)
    }

    if (!data) {
      return NextResponse.json({
        error: 'TTS provider request failed',
        providerError: lastProviderError,
        status: lastProviderStatus,
        provider: 'elevenlabs',
      }, { status: 502 })
    }

    const audioBase64 = String((data as any).audio_base64 || '')
    if (!audioBase64) {
      return NextResponse.json({ error: 'TTS provider returned no audio' }, { status: 502 })
    }

    return NextResponse.json({
      provider: 'elevenlabs',
      audioBase64,
      mimeType: 'audio/mpeg',
      alignment: toAlignment((data as any).alignment),
      normalizedAlignment: toAlignment((data as any).normalized_alignment),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to generate speech',
    }, { status: 500 })
  }
}
