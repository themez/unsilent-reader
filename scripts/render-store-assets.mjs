import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlUrl = pathToFileURL(path.join(root, 'store-assets', 'showcase.html')).href
const channel = process.env.UNSILENT_PLAYWRIGHT_CHANNEL || 'chrome'

const shots = [
  {
    url: htmlUrl,
    output: path.join(root, 'store-assets', 'screenshot-1280x800.png'),
  },
  {
    url: `${htmlUrl}?shot=popup`,
    output: path.join(root, 'store-assets', 'screenshot-popup-1280x800.png'),
  },
]

for (const shot of shots) {
  execFileSync('npx', [
    '--yes',
    'playwright',
    'screenshot',
    '--channel',
    channel,
    '--viewport-size',
    '1280,800',
    shot.url,
    shot.output,
  ], { cwd: root, stdio: 'inherit' })
}
