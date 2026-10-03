import { Hono } from 'hono'
import api, { type Bindings } from './api'

const app = new Hono<{ Bindings: Bindings }>()

// API は常にキャッシュさせない(家族間の共有データを最新に保つ)
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})
app.route('/api', api)

const V = '7'

const shell = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>すくすくログ - 新生児からの育児記録</title>
  <meta name="description" content="授乳・睡眠・おむつ・体温・成長・予防接種を、家族みんなで共有しながら記録できる育児ログ" />
  <meta name="theme-color" content="#fff6f2" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" type="image/png" href="/static/icon-192.png" />
  <link rel="apple-touch-icon" href="/static/icon-192.png" />
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
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="/static/style.css?v=${V}" rel="stylesheet" />
</head>
<body>
  <div id="app" aria-live="polite"></div>
  <div id="sheet-root"></div>
  <div id="report-root"></div>
  <div id="toast-root" role="status" aria-live="polite"></div>
  <noscript>このアプリを使うには JavaScript を有効にしてください。</noscript>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" defer></script>
  <script src="/static/who-lms.js?v=${V}" defer></script>
  <script src="/static/app-core.js?v=${V}" defer></script>
  <script src="/static/app-sheets.js?v=${V}" defer></script>
  <script src="/static/app-views.js?v=${V}" defer></script>
  <script src="/static/app-more.js?v=${V}" defer></script>
  <script src="/static/app-voice.js?v=${V}" defer></script>
  <script src="/static/app-main.js?v=${V}" defer></script>
</body>
</html>`

app.get('/', (c) => c.html(shell))

export default app
