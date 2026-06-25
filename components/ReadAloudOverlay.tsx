import { ChevronLeft, ChevronRight, Logs, Pause, Play, SkipBack, SkipForward, Trash2, Volume2, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

type ReadAloudStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

type ReadAloudState = {
  status: ReadAloudStatus
  title: string
  currentIndex: number
  totalChars: number
  rate: number
  mode: 'ai' | 'browser'
  backendUrl?: string
  fallbackReason?: string
  error?: string
}

type DebugRequest = {
  id: number
  at: number
  phase: 'start' | 'complete' | 'error' | string
  chunkIndex?: number
  textLength?: number
  backendUrl?: string
  cacheHit?: boolean
  cacheLayer?: string
  durationMs?: number
  audioBytesApprox?: number
  preview?: string
  error?: string
}

const DEFAULT_STATE: ReadAloudState = {
  status: 'idle',
  title: '',
  currentIndex: 0,
  totalChars: 0,
  rate: 1,
  mode: 'ai',
}

function sendCommand(command: string, payload: Record<string, unknown> = {}) {
  try {
    window.dispatchEvent(new CustomEvent('bf-read-aloud-command', {
      detail: { command, ...payload },
    }))
  } catch {}
}

function iconButtonStyle(active = false): CSSProperties {
  return {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(15, 23, 42, 0.10)',
    borderRadius: 8,
    background: active ? '#0f766e' : '#ffffff',
    color: active ? '#ffffff' : '#334155',
    boxShadow: active ? '0 8px 18px rgba(15, 118, 110, 0.22)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
    cursor: 'pointer',
    padding: 0,
    flex: '0 0 auto',
  }
}

function formatFallbackReason(reason?: string): string {
  const value = String(reason || '').trim()
  if (!value) return ''
  if (/failed to fetch/i.test(value)) return 'AI voice backend unavailable'
  return value
}

export default function ReadAloudOverlay() {
  const [state, setState] = useState<ReadAloudState>(DEFAULT_STATE)
  const [showDebug, setShowDebug] = useState(false)
  const [debugRequests, setDebugRequests] = useState<DebugRequest[]>([])

  useEffect(() => {
    const onState = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail as Partial<ReadAloudState>
        setState({
          status: detail.status || 'idle',
          title: String(detail.title || ''),
          currentIndex: Number(detail.currentIndex || 0),
          totalChars: Number(detail.totalChars || 0),
          rate: Number(detail.rate || 1),
          mode: detail.mode === 'browser' ? 'browser' : 'ai',
          backendUrl: detail.backendUrl ? String(detail.backendUrl) : '',
          fallbackReason: detail.fallbackReason ? String(detail.fallbackReason) : '',
          error: detail.error ? String(detail.error) : undefined,
        })
      } catch {}
    }
    try { window.addEventListener('bf-read-aloud-state', onState as any) } catch {}
    return () => { try { window.removeEventListener('bf-read-aloud-state', onState as any) } catch {} }
  }, [])

  useEffect(() => {
    const onDebug = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail as Partial<DebugRequest>
        const id = Number(detail.id || 0)
        if (!id) return
        setDebugRequests((items) => {
          const nextItem: DebugRequest = {
            id,
            at: Number(detail.at || Date.now()),
            phase: String(detail.phase || 'complete'),
            chunkIndex: typeof detail.chunkIndex === 'number' ? detail.chunkIndex : undefined,
            textLength: typeof detail.textLength === 'number' ? detail.textLength : undefined,
            backendUrl: detail.backendUrl ? String(detail.backendUrl) : '',
            cacheHit: Boolean(detail.cacheHit),
            cacheLayer: detail.cacheLayer ? String(detail.cacheLayer) : '',
            durationMs: typeof detail.durationMs === 'number' ? detail.durationMs : undefined,
            audioBytesApprox: typeof detail.audioBytesApprox === 'number' ? detail.audioBytesApprox : undefined,
            preview: detail.preview ? String(detail.preview) : '',
            error: detail.error ? String(detail.error) : '',
          }
          const existingIndex = items.findIndex((item) => item.id === id)
          const merged = existingIndex >= 0
            ? items.map((item, index) => index === existingIndex ? { ...item, ...nextItem, preview: nextItem.preview || item.preview } : item)
            : [nextItem, ...items]
          return merged
            .sort((a, b) => b.at - a.at)
            .slice(0, 12)
        })
      } catch {}
    }
    try { window.addEventListener('bf-read-aloud-debug', onDebug as any) } catch {}
    return () => { try { window.removeEventListener('bf-read-aloud-debug', onDebug as any) } catch {} }
  }, [])

  if (state.status === 'idle') return null

  const progress = state.totalChars > 0 ? Math.max(0, Math.min(1, state.currentIndex / state.totalChars)) : 0
  const isPlaying = state.status === 'playing'
  const isLoading = state.status === 'loading'
  const isError = state.status === 'error'
  const title = state.title || 'Reading page'
  const sourceLabel = state.mode === 'ai' ? 'AI voice' : 'Browser voice'
  const sourceDetail = state.mode === 'ai' && state.backendUrl ? ` · ${state.backendUrl.replace(/^https?:\/\//, '')}` : ''
  const fallbackReason = formatFallbackReason(state.fallbackReason)
  const fallbackDetail = state.mode === 'browser' && fallbackReason ? ` · ${fallbackReason}` : ''
  const statusLabel = isError
    ? (state.error || 'Unable to read this page')
    : isLoading
      ? 'Preparing reader...'
      : state.status === 'paused' && state.error
        ? state.error
        : isPlaying
          ? 'Reading aloud'
          : 'Paused'

  return (
    <div
      id="bf-read-aloud-control"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 2147483646,
        width: 'min(360px, calc(100vw - 28px))',
        pointerEvents: 'auto',
        color: '#0f172a',
        font: '500 13px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          border: '1px solid rgba(15, 23, 42, 0.10)',
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18), 0 3px 10px rgba(15, 23, 42, 0.08)',
          overflow: 'hidden',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div style={{ height: 3, background: '#dbe4e2' }}>
          <div
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              background: '#14b8a6',
              transition: 'width 140ms linear',
            }}
          />
        </div>

        <div style={{ padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ecfeff',
                color: '#0f766e',
                flex: '0 0 auto',
              }}
            >
              <Volume2 size={17} strokeWidth={2.2} />
            </div>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 650,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: 0,
                }}
                title={title}
              >
                {title}
              </div>
              <div style={{ color: isError ? '#b91c1c' : '#64748b', fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                {statusLabel}
              </div>
              <div
                style={{
                  color: state.mode === 'ai' ? '#0f766e' : '#8a5b12',
                  fontSize: 11,
                  fontWeight: 650,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={`${sourceLabel}${sourceDetail}${fallbackDetail}`}
              >
                {sourceLabel}{sourceDetail}{fallbackDetail}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close reader"
              title="Close reader"
              onClick={() => sendCommand('stop')}
              style={iconButtonStyle(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              aria-label="Previous section"
              title="Previous section"
              onClick={() => sendCommand('previous')}
              disabled={isLoading || isError}
              style={{ ...iconButtonStyle(false), width: 28, opacity: isLoading || isError ? 0.45 : 1 }}
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              aria-label="Previous sentence"
              title="Previous sentence"
              onClick={() => sendCommand('previous-sentence')}
              disabled={isLoading || isError}
              style={{ ...iconButtonStyle(false), width: 28, opacity: isLoading || isError ? 0.45 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
              onClick={() => sendCommand(isPlaying ? 'pause' : 'resume')}
              disabled={isLoading || isError}
              style={{ ...iconButtonStyle(true), width: 36, opacity: isLoading || isError ? 0.45 : 1 }}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              aria-label="Next sentence"
              title="Next sentence"
              onClick={() => sendCommand('next-sentence')}
              disabled={isLoading || isError}
              style={{ ...iconButtonStyle(false), width: 28, opacity: isLoading || isError ? 0.45 : 1 }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Next section"
              title="Next section"
              onClick={() => sendCommand('next')}
              disabled={isLoading || isError}
              style={{ ...iconButtonStyle(false), width: 28, opacity: isLoading || isError ? 0.45 : 1 }}
            >
              <SkipForward size={16} />
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 12, minWidth: 0 }}>
              <span>{state.rate.toFixed(1)}x</span>
              <input
                aria-label="Reading speed"
                type="range"
                min="0.6"
                max="2"
                step="0.1"
                value={state.rate}
                onChange={(event) => sendCommand('rate', { rate: Number(event.currentTarget.value) })}
                style={{
                  width: 70,
                  minWidth: 0,
                  accentColor: '#0f766e',
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Toggle request debug"
              title="TTS request log"
              onClick={() => setShowDebug((value) => !value)}
              style={{ ...iconButtonStyle(showDebug), width: 28, height: 28 }}
            >
              <Logs size={14} />
            </button>
          </div>

          {showDebug && (
            <div
              style={{
                borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                paddingTop: 9,
                display: 'grid',
                gap: 7,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>TTS requests</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>{debugRequests.length}</div>
                <button
                  type="button"
                  aria-label="Clear request debug"
                  title="Clear request debug"
                  onClick={() => setDebugRequests([])}
                  style={{ ...iconButtonStyle(false), marginLeft: 'auto', width: 26, height: 26 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ maxHeight: 168, overflow: 'auto', display: 'grid', gap: 6 }}>
                {debugRequests.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: 12 }}>No TTS requests yet.</div>
                ) : debugRequests.map((request) => {
                  const isErrorRequest = request.phase === 'error' || Boolean(request.error)
                  const source = request.phase === 'start'
                    ? 'pending'
                    : request.cacheLayer || (request.cacheHit ? 'cache' : 'network')
                  return (
                    <div
                      key={request.id}
                      style={{
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        borderRadius: 7,
                        padding: '7px 8px',
                        background: isErrorRequest ? '#fef2f2' : '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: isErrorRequest ? '#b91c1c' : '#0f766e' }}>
                          {source}
                        </span>
                        <span style={{ color: '#64748b', fontSize: 11 }}>
                          chunk {typeof request.chunkIndex === 'number' ? request.chunkIndex + 1 : '-'}
                        </span>
                        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>
                          {typeof request.durationMs === 'number' ? `${request.durationMs}ms` : '...'}
                        </span>
                      </div>
                      <div style={{ color: '#475569', fontSize: 11, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {request.preview || `${request.textLength || 0} chars`}
                      </div>
                      {(request.audioBytesApprox || request.error) && (
                        <div style={{ color: isErrorRequest ? '#b91c1c' : '#64748b', fontSize: 11, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {request.error || `${Math.round((request.audioBytesApprox || 0) / 1024)} KB audio`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
