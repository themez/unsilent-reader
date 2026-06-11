export const PRESET_ELEVENLABS_VOICES = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { voice_id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew' },
  { voice_id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde' },
  { voice_id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul' },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { voice_id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave' },
  { voice_id: 'D38z5RcWu1voky8WS1ja', name: 'Fin' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { voice_id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas' },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { voice_id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily' },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { voice_id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  { voice_id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick' },
  { voice_id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry' },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' },
  { voice_id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy' },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
  { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' },
  { voice_id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James' },
  { voice_id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph' },
  { voice_id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy' },
  { voice_id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael' },
  { voice_id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan' },
  { voice_id: 'iP95p4xoKVk53GoZ742B', name: 'Chris' },
  { voice_id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi' },
  { voice_id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya' },
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { voice_id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace' },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
  { voice_id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { voice_id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole' },
  { voice_id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill' },
  { voice_id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie' },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
  { voice_id: 'z9fAnlkpzviPz146aGWa', name: 'Glinda' },
  { voice_id: 'zcAOhNBS3c14rBihAFp1', name: 'Giovanni' },
  { voice_id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi' },
]

export const DEFAULT_SYNC_SETTINGS = {
  backendUrl: '',
  elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
}

export const DEFAULT_LOCAL_SETTINGS = {
  elevenLabsApiKey: '',
}

export const DEFAULT_SETTINGS = {
  ...DEFAULT_SYNC_SETTINGS,
  ...DEFAULT_LOCAL_SETTINGS,
}

export function normalizeBackendUrl(value: unknown): string {
  const url = String(value || '').trim().replace(/\/$/, '')
  if (!url || url === 'http://localhost:3000' || url === 'http://127.0.0.1:3000') return ''
  return /^https?:\/\//i.test(url) ? url : ''
}

export function normalizeElevenLabsVoiceId(value: unknown): string {
  return String(value || DEFAULT_SYNC_SETTINGS.elevenLabsVoiceId).trim() || DEFAULT_SYNC_SETTINGS.elevenLabsVoiceId
}

export async function getSettings(): Promise<typeof DEFAULT_SETTINGS> {
  const syncValues = await browser.storage.sync.get(DEFAULT_SYNC_SETTINGS as any)
  const localValues = await browser.storage.local.get(DEFAULT_LOCAL_SETTINGS as any)
  return {
    backendUrl: normalizeBackendUrl((syncValues as any).backendUrl),
    elevenLabsVoiceId: normalizeElevenLabsVoiceId((syncValues as any).elevenLabsVoiceId),
    elevenLabsApiKey: String((localValues as any).elevenLabsApiKey || '').trim(),
  }
}
