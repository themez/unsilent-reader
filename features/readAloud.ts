type ReadAloudStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

type TextToken = {
  start: number
  end: number
  node: Text
  nodeStart: number
  nodeEnd: number
}

type TextChunk = {
  start: number
  end: number
  text: string
}

type TextSentence = {
  start: number
  end: number
}

type TtsAlignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

type TtsReadingResponse = {
  ok?: boolean
  audioBase64?: string
  mimeType?: string
  alignment?: TtsAlignment
  normalizedAlignment?: TtsAlignment
  backendUrl?: string
  cacheHit?: boolean
  cacheLayer?: 'page' | 'extension' | 'network'
  error?: string
}

type PlaybackMode = 'ai' | 'browser'

type ReadingDocument = {
  text: string
  tokens: TextToken[]
  chunks: TextChunk[]
  sentences: TextSentence[]
  title: string
}

type ReadAloudState = {
  status: ReadAloudStatus
  title: string
  currentIndex: number
  totalChars: number
  rate: number
  mode: PlaybackMode
  backendUrl?: string
  fallbackReason?: string
  error?: string
}

const MAX_CHUNK_CHARS = 900
const MIN_CHUNK_CHARS = 260
const MIN_BLOCK_CHARS = 24
const HIGHLIGHT_LAYER_ID = 'bf-read-aloud-highlight-layer'
const CONTROL_ROOT_ID = 'unsilent-reader-react-root'
const TTS_CACHE_DB_NAME = 'bf-read-aloud-cache'
const TTS_CACHE_STORE_NAME = 'tts-results'
const TTS_CACHE_VERSION = 1
const TTS_CACHE_MAX_ENTRIES = 120
const TTS_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

let attached = false
let currentDoc: ReadingDocument | null = null
let currentChunkIndex = 0
let currentUtterance: SpeechSynthesisUtterance | null = null
let currentAudio: HTMLAudioElement | null = null
let currentAlignment: TtsAlignment | null = null
let currentMode: PlaybackMode = 'ai'
let currentStatus: ReadAloudStatus = 'idle'
let currentRate = 1
let currentIndex = 0
let currentBackendUrl = ''
let currentFallbackReason = ''
let browserFallbackActive = false
let pendingRestartTimer: number | null = null
let lastHighlightedToken: TextToken | null = null
let playbackGeneration = 0
let aiSpeechCache = new Map<number, Promise<TtsReadingResponse>>()
let ttsDebugSeq = 0

function normalizeSpaces(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

function getReadAloudTitle(): string {
  const title = normalizeSpaces(document.title || '')
  return title || 'Page reading'
}

function isElementHidden(el: Element | null): boolean {
  try {
    if (!el) return true
    if (el.closest(`#${CONTROL_ROOT_ID}, #${HIGHLIGHT_LAYER_ID}, [data-bf-translation], #bf-translate-modal`)) return true
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'svg' || tag === 'canvas') return true
    if (el.closest('nav, header, footer, aside, menu, button, select, textarea, input, [role="navigation"], [role="banner"], [role="contentinfo"], [role="toolbar"], [role="dialog"], [aria-hidden="true"]')) return true
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true
    const rect = (el as HTMLElement).getBoundingClientRect?.()
    if (rect && rect.width === 0 && rect.height === 0) return true
    return false
  } catch {
    return true
  }
}

function visibleTextLength(el: HTMLElement): number {
  try {
    if (isElementHidden(el)) return 0
    return normalizeSpaces(el.textContent || '').replace(/\s/g, '').length
  } catch {
    return 0
  }
}

function chooseRoot(): HTMLElement | null {
  try {
    const candidates = Array.from(document.querySelectorAll('article, main, [role="main"], [role="article"], .article, .post, .content')) as HTMLElement[]
    let best: HTMLElement | null = null
    let bestScore = 0
    for (const candidate of candidates) {
      const score = visibleTextLength(candidate)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    if (best && bestScore >= 300) return best
  } catch {}
  return document.body || null
}

function isCjk(char: string): boolean {
  return /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_'-]/.test(char)
}

function addTokensForTextNode(tokens: TextToken[], node: Text, globalStart: number): void {
  const text = node.nodeValue || ''
  let i = 0
  while (i < text.length) {
    const char = text[i] || ''
    if (/\s/.test(char)) {
      i++
      continue
    }
    const tokenStart = i
    if (isCjk(char)) {
      i++
    } else if (isWordChar(char)) {
      i++
      while (i < text.length && isWordChar(text[i] || '')) i++
    } else {
      i++
      continue
    }
    tokens.push({
      start: globalStart + tokenStart,
      end: globalStart + i,
      node,
      nodeStart: tokenStart,
      nodeEnd: i,
    })
  }
}

function collectTextNodes(block: HTMLElement): Text[] {
  const nodes: Text[] = []
  try {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement
        if (!parent || isElementHidden(parent)) return NodeFilter.FILTER_REJECT
        const text = node.nodeValue || ''
        if (!text || !text.replace(/\s+/g, '')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    for (let node = walker.nextNode();node;node = walker.nextNode()) {
      nodes.push(node as Text)
    }
  } catch {}
  return nodes
}

function findContentBlocks(root: HTMLElement): HTMLElement[] {
  const selector = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre'
  const blocks = Array.from(root.querySelectorAll(selector)) as HTMLElement[]
  const filtered = blocks.filter((block) => {
    try {
      if (isElementHidden(block)) return false
      const tag = block.tagName.toLowerCase()
      const len = normalizeSpaces(block.textContent || '').replace(/\s/g, '').length
      if (/^h[1-6]$/.test(tag)) return len >= 4
      return len >= MIN_BLOCK_CHARS
    } catch {
      return false
    }
  })
  if (filtered.length > 0) return filtered

  try {
    const fallback: HTMLElement[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    for (let node = walker.nextNode();node;node = walker.nextNode()) {
      const el = node as HTMLElement
      if (fallback.length >= 80) break
      if (isElementHidden(el)) continue
      const textLen = normalizeSpaces(el.textContent || '').replace(/\s/g, '').length
      if (textLen < MIN_BLOCK_CHARS) continue
      const childBlocks = Array.from(el.children).filter((child) => visibleTextLength(child as HTMLElement) >= MIN_BLOCK_CHARS)
      if (childBlocks.length > 0) continue
      fallback.push(el)
    }
    return fallback
  } catch {
    return []
  }
}

function findSplitPoint(text: string, start: number, hardEnd: number): number {
  const minEnd = Math.min(hardEnd, start + MIN_CHUNK_CHARS)
  const preferredEnd = Math.min(hardEnd, start + MAX_CHUNK_CHARS)
  const windowText = text.slice(minEnd, preferredEnd)
  const sentenceMatch = [...windowText.matchAll(/[。！？.!?]\s+|[。！？.!?](?=[^\w]|$)|\n\n/g)].pop()
  if (sentenceMatch && typeof sentenceMatch.index === 'number') {
    return minEnd + sentenceMatch.index + sentenceMatch[0].length
  }
  const softText = text.slice(minEnd, preferredEnd)
  const commaMatch = [...softText.matchAll(/[，,;；:：]\s*|\s+/g)].pop()
  if (commaMatch && typeof commaMatch.index === 'number') {
    return minEnd + commaMatch.index + commaMatch[0].length
  }
  return preferredEnd
}

function pushChunkRange(chunks: TextChunk[], text: string, start: number, end: number): void {
  let cursor = start
  while (cursor < end) {
    while (cursor < end && /\s/.test(text[cursor] || '')) cursor++
    if (cursor >= end) break
    const remaining = end - cursor
    const nextEnd = remaining > MAX_CHUNK_CHARS ? findSplitPoint(text, cursor, end) : end
    const chunkText = text.slice(cursor, nextEnd).trim()
    if (chunkText) chunks.push({ start: cursor, end: nextEnd, text: text.slice(cursor, nextEnd) })
    cursor = Math.max(nextEnd, cursor + 1)
  }
}

function buildChunks(text: string, blockStarts: number[]): TextChunk[] {
  const chunks: TextChunk[] = []
  const starts = Array.from(new Set([0, ...blockStarts.filter((start) => start > 0 && start < text.length), text.length])).sort((a, b) => a - b)

  for (let i = 0;i < starts.length - 1;i++) {
    const start = starts[i]
    const end = starts[i + 1]
    if (end <= start) continue
    pushChunkRange(chunks, text, start, end)
  }

  return chunks.length > 0 ? chunks : [{ start: 0, end: text.length, text }]
}

function buildSentences(text: string, chunks: TextChunk[]): TextSentence[] {
  const sentences: TextSentence[] = []
  for (const chunk of chunks) {
    let cursor = chunk.start
    while (cursor < chunk.end) {
      while (cursor < chunk.end && /\s/.test(text[cursor] || '')) cursor++
      if (cursor >= chunk.end) break
      const slice = text.slice(cursor, chunk.end)
      const match = slice.match(/[。！？.!?]+(?:["'”’)\]]+)?(?:\s+|$)/)
      const end = match && typeof match.index === 'number'
        ? Math.min(chunk.end, cursor + match.index + match[0].length)
        : chunk.end
      sentences.push({ start: cursor, end })
      cursor = Math.max(end, cursor + 1)
    }
  }
  return sentences.length > 0 ? sentences : [{ start: 0, end: text.length }]
}

function extractReadingDocument(): ReadingDocument | null {
  const root = chooseRoot()
  if (!root) return null

  const blocks = findContentBlocks(root)
  if (blocks.length === 0) return null

  let text = ''
  const tokens: TextToken[] = []
  const blockStarts: number[] = []

  for (const block of blocks) {
    const nodes = collectTextNodes(block)
    if (nodes.length === 0) continue
    const blockText = nodes.map((node) => node.nodeValue || '').join('')
    if (normalizeSpaces(blockText).replace(/\s/g, '').length < 4) continue

    if (text && !text.endsWith('\n\n')) text += '\n\n'
    blockStarts.push(text.length)

    for (const node of nodes) {
      const value = node.nodeValue || ''
      if (!value) continue
      const start = text.length
      addTokensForTextNode(tokens, node, start)
      text += value
    }
  }

  const readableText = text.replace(/\s+$/, '')
  if (!readableText || tokens.length < 3) return null

  const chunks = buildChunks(readableText, blockStarts)
  return {
    text: readableText,
    tokens: tokens.filter((token) => token.start < readableText.length),
    chunks,
    sentences: buildSentences(readableText, chunks),
    title: getReadAloudTitle(),
  }
}

function getHighlightLayer(): HTMLDivElement {
  let layer = document.getElementById(HIGHLIGHT_LAYER_ID) as HTMLDivElement | null
  if (layer) return layer
  layer = document.createElement('div')
  layer.id = HIGHLIGHT_LAYER_ID
  layer.style.position = 'fixed'
  layer.style.inset = '0'
  layer.style.zIndex = '2147483645'
  layer.style.pointerEvents = 'none'
  layer.style.contain = 'layout style paint'
  document.documentElement.appendChild(layer)
  return layer
}

function clearHighlight(): void {
  try {
    const layer = document.getElementById(HIGHLIGHT_LAYER_ID)
    if (layer) layer.replaceChildren()
    lastHighlightedToken = null
  } catch {}
}

function findToken(index: number): TextToken | null {
  const doc = currentDoc
  if (!doc || doc.tokens.length === 0) return null
  const safeIndex = Math.max(0, Math.min(index, doc.text.length - 1))
  let lo = 0
  let hi = doc.tokens.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const token = doc.tokens[mid]
    if (safeIndex < token.start) hi = mid - 1
    else if (safeIndex >= token.end) lo = mid + 1
    else return token
  }
  return doc.tokens[Math.max(0, Math.min(lo, doc.tokens.length - 1))] || null
}

function findChunkIndexAt(index: number): number {
  const doc = currentDoc
  if (!doc || doc.chunks.length === 0) return 0
  const safeIndex = Math.max(0, Math.min(index, doc.text.length - 1))
  let lo = 0
  let hi = doc.chunks.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const chunk = doc.chunks[mid]
    if (safeIndex < chunk.start) hi = mid - 1
    else if (safeIndex >= chunk.end) lo = mid + 1
    else return mid
  }
  return Math.max(0, Math.min(lo, doc.chunks.length - 1))
}

function findSentenceIndexAt(index: number): number {
  const doc = currentDoc
  if (!doc || doc.sentences.length === 0) return 0
  const safeIndex = Math.max(0, Math.min(index, doc.text.length - 1))
  let lo = 0
  let hi = doc.sentences.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const sentence = doc.sentences[mid]
    if (safeIndex < sentence.start) hi = mid - 1
    else if (safeIndex >= sentence.end) lo = mid + 1
    else return mid
  }
  return Math.max(0, Math.min(lo, doc.sentences.length - 1))
}

function findTokenForNodeOffset(node: Text, offset: number): TextToken | null {
  const doc = currentDoc
  if (!doc) return null
  let best: TextToken | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const token of doc.tokens) {
    if (token.node !== node) continue
    if (offset >= token.nodeStart && offset <= token.nodeEnd) return token
    const distance = offset < token.nodeStart ? token.nodeStart - offset : offset - token.nodeEnd
    if (distance < bestDistance) {
      best = token
      bestDistance = distance
    }
  }
  return best
}

function getTextPointFromMouseEvent(event: MouseEvent): { node: Text; offset: number } | null {
  try {
    const docWithCaretPosition = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const position = docWithCaretPosition.caretPositionFromPoint?.(event.clientX, event.clientY)
    if (position?.offsetNode?.nodeType === Node.TEXT_NODE) {
      return { node: position.offsetNode as Text, offset: position.offset }
    }
    const range = docWithCaretPosition.caretRangeFromPoint?.(event.clientX, event.clientY)
    if (range?.startContainer?.nodeType === Node.TEXT_NODE) {
      return { node: range.startContainer as Text, offset: range.startOffset }
    }
  } catch {}
  return null
}

function highlightAt(index: number, force = false): void {
  const token = findToken(index)
  if (!token || (!force && token === lastHighlightedToken)) return
  lastHighlightedToken = token
  currentIndex = token.start

  try {
    const range = document.createRange()
    range.setStart(token.node, token.nodeStart)
    range.setEnd(token.node, token.nodeEnd)
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
    range.detach()

    const layer = getHighlightLayer()
    layer.replaceChildren()

    for (const rect of rects.slice(0, 4)) {
      const mark = document.createElement('div')
      mark.style.position = 'fixed'
      mark.style.left = `${rect.left - 2}px`
      mark.style.top = `${rect.top - 1}px`
      mark.style.width = `${rect.width + 4}px`
      mark.style.height = `${rect.height + 2}px`
      mark.style.borderRadius = '4px'
      mark.style.background = 'rgba(20, 184, 166, 0.28)'
      mark.style.boxShadow = '0 0 0 1px rgba(15, 118, 110, 0.14), 0 6px 18px rgba(20, 184, 166, 0.12)'
      mark.style.mixBlendMode = 'multiply'
      layer.appendChild(mark)
    }

  } catch {}
  emitState()
}

function emitState(error?: string): void {
  const detail: ReadAloudState = {
    status: currentStatus,
    title: currentDoc?.title || '',
    currentIndex,
    totalChars: currentDoc?.text.length || 0,
    rate: currentRate,
    mode: currentMode,
    backendUrl: currentBackendUrl,
    fallbackReason: currentFallbackReason,
    error,
  }
  try { window.dispatchEvent(new CustomEvent('bf-read-aloud-state', { detail })) } catch {}
}

function emitTtsDebug(detail: Record<string, unknown>): void {
  try {
    window.dispatchEvent(new CustomEvent('bf-read-aloud-debug', {
      detail: {
        id: typeof detail.id === 'number' ? detail.id : ++ttsDebugSeq,
        at: Date.now(),
        ...detail,
      },
    }))
  } catch {}
}

function getPageLanguage(): string {
  try {
    return String(document.documentElement.lang || navigator.language || '').trim()
  } catch {
    return ''
  }
}

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

async function getBackendUrl(): Promise<string> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_BACKEND_URL' })
    return String(response?.backendUrl || '').replace(/\/$/, '')
  } catch {
    return ''
  }
}

function getCachedTts(key: string): Promise<TtsReadingResponse | null> {
  return new Promise((resolve) => {
    openTtsCacheDb().then((db) => {
      const tx = db.transaction(TTS_CACHE_STORE_NAME, 'readonly')
      const request = tx.objectStore(TTS_CACHE_STORE_NAME).get(key)
      request.onsuccess = () => {
        const record = request.result as (TtsReadingResponse & { createdAt?: number }) | undefined
        if (!record || !record.audioBase64) {
          resolve(null)
          return
        }
        if (Date.now() - Number(record.createdAt || 0) > TTS_CACHE_MAX_AGE_MS) {
          resolve(null)
          return
        }
        resolve({ ...record, ok: true, cacheHit: true })
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
      for (let i = 0;i < deleteCount;i++) {
        store.delete(keys[i])
      }
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
        provider: 'elevenlabs',
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

function normalizeAlignment(input: unknown): TtsAlignment | null {
  try {
    const value = input && typeof input === 'object' ? input as Partial<TtsAlignment> : {}
    const characters = Array.isArray(value.characters) ? value.characters.map((char) => String(char || '')) : []
    const starts = Array.isArray(value.character_start_times_seconds)
      ? value.character_start_times_seconds.map((time) => Number(time || 0))
      : []
    const ends = Array.isArray(value.character_end_times_seconds)
      ? value.character_end_times_seconds.map((time) => Number(time || 0))
      : []
    const len = Math.min(characters.length, starts.length, ends.length)
    if (len === 0) return null
    return {
      characters: characters.slice(0, len),
      character_start_times_seconds: starts.slice(0, len),
      character_end_times_seconds: ends.slice(0, len),
    }
  } catch {
    return null
  }
}

async function requestAiSpeech(text: string, chunkIndex: number): Promise<TtsReadingResponse> {
  const debugId = ++ttsDebugSeq
  const startedAt = performance.now()
  const language = getPageLanguage()
  const backendUrl = await getBackendUrl()
  emitTtsDebug({
    id: debugId,
    phase: 'start',
    chunkIndex,
    backendUrl,
    textLength: text.length,
    preview: normalizeSpaces(text).slice(0, 72),
  })
  const cacheKey = await hashCacheKey([
    'read-aloud-tts-v1',
    backendUrl,
    language,
    text,
  ].join('\n'))
  const cached = await getCachedTts(cacheKey)
  if (cached) {
    emitTtsDebug({
      id: debugId,
      phase: 'complete',
      chunkIndex,
      backendUrl: cached.backendUrl || backendUrl,
      textLength: text.length,
      cacheHit: true,
      cacheLayer: 'page',
      durationMs: Math.round(performance.now() - startedAt),
      audioBytesApprox: cached.audioBase64 ? Math.floor(cached.audioBase64.length * 3 / 4) : 0,
    })
    return { ...cached, backendUrl: cached.backendUrl || backendUrl, cacheHit: true, cacheLayer: 'page' }
  }

  try {
    const response = await browser.runtime.sendMessage({
      type: 'TTS_READING',
      payload: {
        text,
        language,
      },
    })
    const result = response && typeof response === 'object' ? response as TtsReadingResponse : { ok: false, error: 'Empty TTS response' }
    if (result.ok && result.audioBase64) {
      await setCachedTts(cacheKey, result)
    }
    emitTtsDebug({
      id: debugId,
      phase: result.ok ? 'complete' : 'error',
      chunkIndex,
      backendUrl: result.backendUrl || backendUrl,
      textLength: text.length,
      cacheHit: Boolean(result.cacheHit),
      cacheLayer: result.cacheLayer || (result.cacheHit ? 'extension' : 'network'),
      durationMs: Math.round(performance.now() - startedAt),
      audioBytesApprox: result.audioBase64 ? Math.floor(result.audioBase64.length * 3 / 4) : 0,
      error: result.error || '',
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate speech'
    emitTtsDebug({
      id: debugId,
      phase: 'error',
      chunkIndex,
      backendUrl,
      textLength: text.length,
      cacheHit: false,
      cacheLayer: 'network',
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
    })
    return { ok: false, backendUrl, error: message }
  }
}

function getAiSpeechForChunk(index: number): Promise<TtsReadingResponse> {
  const doc = currentDoc
  const chunk = doc?.chunks[index]
  if (!chunk) return Promise.resolve({ ok: false, error: 'Missing text chunk' })
  const cached = aiSpeechCache.get(index)
  if (cached) return cached
  const request = requestAiSpeech(chunk.text, index)
  aiSpeechCache.set(index, request)
  return request
}

function prefetchAiSpeech(index: number): void {
  try {
    if (!currentDoc || index < 0 || index >= currentDoc.chunks.length) return
    if (aiSpeechCache.has(index)) return
    void getAiSpeechForChunk(index).catch(() => {})
  } catch {}
}

function findAlignmentIndexAtTime(alignment: TtsAlignment, timeSeconds: number): number {
  const starts = alignment.character_start_times_seconds
  const ends = alignment.character_end_times_seconds
  if (starts.length === 0) return 0
  let lo = 0
  let hi = starts.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const start = starts[mid] ?? 0
    const end = ends[mid] ?? start
    if (timeSeconds < start) hi = mid - 1
    else if (timeSeconds > end) lo = mid + 1
    else return mid
  }
  return Math.max(0, Math.min(lo, starts.length - 1))
}

function findAlignmentTimeAtLocalIndex(alignment: TtsAlignment, localIndex: number): number {
  const starts = alignment.character_start_times_seconds
  if (starts.length === 0) return 0
  const safeIndex = Math.max(0, Math.min(localIndex, starts.length - 1))
  return Math.max(0, starts[safeIndex] ?? 0)
}

function stopCurrentPlayback(): void {
  try {
    currentUtterance = null
    speechSynthesis.cancel()
  } catch {}
  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio.load()
    }
  } catch {}
  currentAudio = null
  currentAlignment = null
  playbackGeneration++
}

function stopSpeech(resetState = true): void {
  try {
    if (pendingRestartTimer != null) {
      clearTimeout(pendingRestartTimer)
      pendingRestartTimer = null
    }
  } catch {}
  stopCurrentPlayback()
  clearHighlight()
  if (resetState) {
    currentDoc = null
    currentChunkIndex = 0
    currentIndex = 0
    aiSpeechCache = new Map()
    currentStatus = 'idle'
    emitState()
  }
}

function speakChunkBrowser(index: number, reason = '', startGlobalIndex?: number): void {
  const doc = currentDoc
  if (!doc || index < 0 || index >= doc.chunks.length) {
    stopSpeech(true)
    return
  }

  currentChunkIndex = index
  const chunk = doc.chunks[index]
  const localStart = Math.max(0, Math.min((startGlobalIndex ?? chunk.start) - chunk.start, chunk.text.length - 1))
  const speechBaseIndex = chunk.start + localStart
  const speechText = chunk.text.slice(localStart).trimStart()
  const leadingTrim = chunk.text.slice(localStart).length - speechText.length
  const boundaryBaseIndex = speechBaseIndex + leadingTrim
  currentMode = 'browser'
  currentFallbackReason = reason || currentFallbackReason
  browserFallbackActive = shouldKeepBrowserFallback(currentFallbackReason)
  currentStatus = 'playing'
  currentIndex = boundaryBaseIndex
  emitState()

  const utterance = new SpeechSynthesisUtterance(speechText || chunk.text)
  utterance.rate = currentRate
  utterance.onstart = () => {
    currentStatus = 'playing'
    highlightAt(boundaryBaseIndex)
    emitState()
  }
  utterance.onboundary = (event) => {
    const localIndex = typeof event.charIndex === 'number' ? event.charIndex : 0
    highlightAt(boundaryBaseIndex + localIndex)
  }
  utterance.onerror = () => {
    currentStatus = 'error'
    emitState('Unable to read this page with the browser voice.')
  }
  utterance.onend = () => {
    if (currentUtterance !== utterance) return
    const nextIndex = currentChunkIndex + 1
    if (currentDoc && nextIndex < currentDoc.chunks.length) {
      speakChunkBrowser(nextIndex, currentFallbackReason)
      return
    }
    stopSpeech(true)
  }

  currentUtterance = utterance
  try {
    stopCurrentPlayback()
    currentUtterance = utterance
    speechSynthesis.speak(utterance)
  } catch {
    currentStatus = 'error'
    emitState('Text-to-speech is not available in this browser.')
  }
}

function shouldKeepBrowserFallback(reason: string): boolean {
  return /failed to fetch|backend unavailable|ELEVENLABS_API_KEY is not configured|AI voice is not configured/i.test(reason)
}

async function speakChunk(index: number, startGlobalIndex?: number): Promise<void> {
  const doc = currentDoc
  if (!doc || index < 0 || index >= doc.chunks.length) {
    stopSpeech(true)
    return
  }
  if (browserFallbackActive) {
    speakChunkBrowser(index, currentFallbackReason, startGlobalIndex)
    return
  }

  stopCurrentPlayback()
  const generation = playbackGeneration
  currentChunkIndex = index
  const chunk = doc.chunks[index]
  currentMode = 'ai'
  currentStatus = 'loading'
  currentIndex = startGlobalIndex ?? chunk.start
  highlightAt(currentIndex, true)
  emitState()

  const response = await getAiSpeechForChunk(index)
  if (generation !== playbackGeneration) return
  currentBackendUrl = String(response.backendUrl || currentBackendUrl || '')

  const alignment = normalizeAlignment(response.alignment) || normalizeAlignment(response.normalizedAlignment)
  const audioBase64 = String(response.audioBase64 || '')
  if (!response.ok || !audioBase64 || !alignment) {
    const reason = response.error
      ? response.error
      : !audioBase64
        ? 'AI voice returned no audio.'
        : 'AI voice returned no timestamps.'
    speakChunkBrowser(index, reason, startGlobalIndex)
    return
  }

  const localStart = Math.max(0, Math.min((startGlobalIndex ?? chunk.start) - chunk.start, chunk.text.length - 1))
  try {
    const audio = new Audio(`data:${response.mimeType || 'audio/mpeg'};base64,${audioBase64}`)
    audio.preload = 'auto'
    audio.playbackRate = currentRate
    audio.currentTime = findAlignmentTimeAtLocalIndex(alignment, localStart)
    currentAudio = audio
    currentAlignment = alignment
    currentStatus = 'playing'
    highlightAt(chunk.start + localStart)
    emitState()
    prefetchAiSpeech(index + 1)

    audio.addEventListener('timeupdate', () => {
      if (currentAudio !== audio || currentAlignment !== alignment) return
      const localIndex = findAlignmentIndexAtTime(alignment, audio.currentTime)
      highlightAt(chunk.start + localIndex)
    })
    audio.addEventListener('ended', () => {
      if (currentAudio !== audio) return
      const nextIndex = currentChunkIndex + 1
      if (currentDoc && nextIndex < currentDoc.chunks.length) {
        void speakChunk(nextIndex)
        return
      }
      stopSpeech(true)
    })
    audio.addEventListener('error', () => {
      if (currentAudio !== audio) return
      speakChunkBrowser(index, 'AI audio could not be played.', startGlobalIndex)
    })

    await audio.play()
  } catch (error) {
    if (generation !== playbackGeneration) return
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError' && currentAudio) {
      currentStatus = 'paused'
      highlightAt(chunk.start + localStart)
      emitState('AI voice is ready. Press play to start audio.')
      return
    }
    speakChunkBrowser(index, error instanceof Error ? error.message : 'AI audio playback failed.', startGlobalIndex)
  }
}

function startReading(): void {
  stopSpeech(false)
  currentStatus = 'loading'
  currentDoc = null
  currentIndex = 0
  currentMode = 'ai'
  currentBackendUrl = ''
  currentFallbackReason = ''
  browserFallbackActive = false
  emitState()

  const doc = extractReadingDocument()
  if (!doc) {
    currentStatus = 'error'
    emitState('No readable article text found on this page.')
    return
  }

  currentDoc = doc
  aiSpeechCache = new Map()
  currentChunkIndex = 0
  currentIndex = 0
  void speakChunk(0)
}

function pauseReading(): void {
  try {
    if (currentMode === 'ai' && currentAudio) {
      currentAudio.pause()
    } else {
      speechSynthesis.pause()
    }
    currentStatus = 'paused'
    emitState()
  } catch {}
}

function resumeReading(): void {
  try {
    if (currentMode === 'ai' && currentAudio) {
      void currentAudio.play()
    } else {
      speechSynthesis.resume()
    }
    currentStatus = 'playing'
    emitState()
  } catch {}
}

function skip(delta: number): void {
  if (!currentDoc) return
  const nextIndex = Math.max(0, Math.min(currentChunkIndex + delta, currentDoc.chunks.length - 1))
  void speakChunk(nextIndex)
}

function seekToIndex(index: number, autoplay = true): void {
  const doc = currentDoc
  if (!doc) return
  const token = findToken(index)
  const targetIndex = token?.start ?? Math.max(0, Math.min(index, doc.text.length - 1))
  const chunkIndex = findChunkIndexAt(targetIndex)
  const chunk = doc.chunks[chunkIndex]
  if (!chunk) return

  if (currentMode === 'ai' && currentAudio && currentAlignment && currentChunkIndex === chunkIndex) {
    currentAudio.currentTime = findAlignmentTimeAtLocalIndex(currentAlignment, targetIndex - chunk.start)
    highlightAt(targetIndex, true)
    if (autoplay) void currentAudio.play()
    currentStatus = autoplay ? 'playing' : currentStatus
    emitState()
    return
  }

  void speakChunk(chunkIndex, targetIndex)
}

function skipSentence(delta: number): void {
  const doc = currentDoc
  if (!doc || doc.sentences.length === 0) return
  const currentSentenceIndex = findSentenceIndexAt(currentIndex)
  const nextSentenceIndex = Math.max(0, Math.min(currentSentenceIndex + delta, doc.sentences.length - 1))
  seekToIndex(doc.sentences[nextSentenceIndex].start)
}

function handleReaderClick(event: MouseEvent): void {
  if (!currentDoc || currentStatus === 'idle' || currentStatus === 'error') return
  try {
    const target = event.target as Element | null
    if (!target || target.closest(`#${CONTROL_ROOT_ID}, #${HIGHLIGHT_LAYER_ID}, [data-bf-translation], #bf-translate-modal`)) return
    if (isElementHidden(target)) return
    const point = getTextPointFromMouseEvent(event)
    if (!point) return
    const token = findTokenForNodeOffset(point.node, point.offset)
    if (!token) return
    event.preventDefault()
    event.stopPropagation()
    seekToIndex(token.start)
  } catch {}
}

function handleReaderKeydown(event: KeyboardEvent): void {
  if (!currentDoc || currentStatus === 'idle' || currentStatus === 'error') return
  const target = event.target as HTMLElement | null
  const tag = target?.tagName?.toLowerCase() || ''
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return
  if (event.key === 'ArrowLeft' && event.shiftKey) {
    event.preventDefault()
    const token = findToken(currentIndex)
    const tokenIndex = token ? currentDoc.tokens.indexOf(token) : -1
    const previous = currentDoc.tokens[Math.max(0, tokenIndex - 1)]
    if (previous) seekToIndex(previous.start)
  } else if (event.key === 'ArrowRight' && event.shiftKey) {
    event.preventDefault()
    const token = findToken(currentIndex)
    const tokenIndex = token ? currentDoc.tokens.indexOf(token) : -1
    const next = currentDoc.tokens[Math.min(currentDoc.tokens.length - 1, tokenIndex + 1)]
    if (next) seekToIndex(next.start)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    skipSentence(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    skipSentence(1)
  }
}

function setRate(rate: number): void {
  currentRate = Math.max(0.6, Math.min(2, Math.round(rate * 10) / 10))
  emitState()
  if (!currentDoc || currentStatus === 'idle' || currentStatus === 'error') return
  if (currentMode === 'ai' && currentAudio) {
    currentAudio.playbackRate = currentRate
    return
  }
  if (pendingRestartTimer != null) clearTimeout(pendingRestartTimer)
  pendingRestartTimer = window.setTimeout(() => {
    pendingRestartTimer = null
    void speakChunk(currentChunkIndex)
  }, 120)
}

function handleCommand(command: string, payload?: any): void {
  if (command === 'start') startReading()
  else if (command === 'pause') pauseReading()
  else if (command === 'resume') resumeReading()
  else if (command === 'stop') stopSpeech(true)
  else if (command === 'next') skip(1)
  else if (command === 'previous') skip(-1)
  else if (command === 'next-sentence') skipSentence(1)
  else if (command === 'previous-sentence') skipSentence(-1)
  else if (command === 'rate') setRate(Number(payload?.rate || currentRate))
}

export function attachReadAloud(): void {
  if (attached) return
  attached = true

  try {
    window.addEventListener('bf-start-read-aloud', () => startReading())
    window.addEventListener('bf-read-aloud-command', (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      handleCommand(String(detail.command || ''), detail)
    })
    window.addEventListener('beforeunload', () => stopSpeech(false))
    window.addEventListener('click', handleReaderClick, true)
    window.addEventListener('keydown', handleReaderKeydown, true)
    window.addEventListener('resize', () => {
      if (lastHighlightedToken) highlightAt(lastHighlightedToken.start, true)
    })
    window.addEventListener('scroll', () => {
      if (lastHighlightedToken) {
        window.requestAnimationFrame(() => highlightAt(lastHighlightedToken?.start || currentIndex, true))
      }
    }, true)
  } catch {}
}
