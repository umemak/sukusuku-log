import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import api, { type Bindings } from './api'
import { TOUCH_ICON_DATA_URI } from './touch-icon'

declare const __BUILD_ID__: string
const V: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

const app = new Hono<{ Bindings: Bindings }>()

// セキュリティヘッダーの適用
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:']
    }
  })
)

// API は常にキャッシュさせない(家族間の共有データを最新に保つ)
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

// 現在の版(PWAが古いかどうかの確認用。認証不要・キャッシュ禁止)
app.get('/api/version', (c) => c.json({ v: V }))
app.route('/api', api)

const shell = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="app-version" content="${V}" />
  <title>すくすくログ - 新生児からの育児記録</title>
  <meta name="description" content="授乳・睡眠・おむつ・体温・成長・予防接種を、家族みんなで共有しながら記録できる育児ログ" />
  <meta name="theme-color" content="#fff6f2" />
  <link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />
  <link rel="icon" type="image/png" href="/static/icon-v2-192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="${TOUCH_ICON_DATA_URI}" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="すくすくログ" />
  <script>
    (function () {
      try {
        var t = localStorage.getItem('ba_theme') || 'auto';
        var dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      } catch (e) {}
    })();
  </script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" integrity="sha384-iw3OoTErCYJJB9mCa8LNS2hbsQ7M3C0EpIsO/H5+EGAkPGc6rk+V8i04oW/K5xq0" crossorigin="anonymous" />
  <link href="/static/style.css?v=${V}" rel="stylesheet" />
</head>
<body>
  <div id="app" aria-live="polite"></div>
  <div id="sheet-root"></div>
  <div id="report-root"></div>
  <div id="toast-root" role="status" aria-live="polite"></div>
  <noscript>このアプリを使うには JavaScript を有効にしてください。</noscript>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" integrity="sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4" crossorigin="anonymous" defer></script>
  <script src="/static/who-lms.js?v=${V}" defer></script>
  <script src="/static/app-core.js?v=${V}" defer></script>
  <script src="/static/app-sheets.js?v=${V}" defer></script>
  <script src="/static/app-views.js?v=${V}" defer></script>
  <script src="/static/app-more.js?v=${V}" defer></script>
  <script src="/static/app-voice.js?v=${V}" defer></script>
  <script src="/static/app-assistant.js?v=${V}" defer></script>
  <script src="/static/app-subsidy.js?v=${V}" defer></script>
  <script src="/static/app-main.js?v=${V}" defer></script>
</body>
</html>`

app.get('/', (c) => {
  // 常に最新のHTMLを取りに行かせる(古い画面が残らないように)
  c.header('Cache-Control', 'no-cache, must-revalidate')
  return c.html(shell)
})

export default app
