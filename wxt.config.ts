import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Unsilent Reader',
    short_name: 'Unsilent',
    description: 'Read web pages aloud with AI voice, word highlighting, and precise seeking.',
    permissions: ['storage', 'contextMenus', 'activeTab'],
    host_permissions: [
      'https://api.elevenlabs.io/*',
    ],
    optional_host_permissions: [
      'http://*/*',
      'https://*/*',
    ],
    action: {
      default_title: 'Unsilent Reader',
    },
    icons: {
      16: '/icon-16.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
  },
})
