import type { NextConfig } from 'next'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
}

export default nextConfig
