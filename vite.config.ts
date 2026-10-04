import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// ビルドごとに変わる版ID(PWAが古いままかどうかの判定と、静的ファイルのキャッシュ更新に使う)
const BUILD_ID = (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) + '-' : '') + Date.now().toString(36)

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    rollupOptions: {
      external: [/^cloudflare:/]
    }
  },
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
