import { createElement } from 'react'
import ReactDOM from 'react-dom/client'
import ReadAloudOverlay from '../components/ReadAloudOverlay'
import { attachReadAloud } from '../features/readAloud'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const w = window as unknown as { __unsilentReaderAttached?: boolean }
    if (w.__unsilentReaderAttached) return
    w.__unsilentReaderAttached = true

    const containerId = 'unsilent-reader-react-root'
    let container = document.getElementById(containerId) as HTMLDivElement | null
    if (!container) {
      container = document.createElement('div')
      container.id = containerId
      container.style.position = 'fixed'
      container.style.inset = '0'
      container.style.zIndex = '2147483646'
      container.style.pointerEvents = 'none'
      document.documentElement.appendChild(container)
    }

    ReactDOM.createRoot(container).render(createElement(ReadAloudOverlay))
    attachReadAloud()

    browser.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return
      if ((message as any).type === 'START_READ_ALOUD_PAGE') {
        try { window.dispatchEvent(new CustomEvent('bf-start-read-aloud')) } catch {}
      }
      if ((message as any).type === 'START_READ_ALOUD_FROM_CONTEXT') {
        try {
          window.dispatchEvent(new CustomEvent('bf-read-aloud-command', {
            detail: { command: 'start-from-context' },
          }))
        } catch {}
      }
    })
  },
})
