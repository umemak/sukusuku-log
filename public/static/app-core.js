/* すくすくログ - core: 状態・API・共通関数・予防接種データ */
(function () {
  'use strict';
  const BA = (window.BA = {});

  // ---------- 記録の種類 ----------
  BA.TYPES = {
    breast:    { label: '母乳',     icon: 'fa-person-breastfeeding', color: '#ee7b7b' },
    formula:   { label: 'ミルク',   icon: 'fa-bottle-water',         color: '#e8964a' },
    expressed: { label: '搾母乳',   icon: 'fa-bottle-droplet',       color: '#d9729f' },
    sleep:     { label: '睡眠',     icon: 'fa-moon',                 color: '#6f7bd0' },
    pee:       { label: 'おしっこ', icon: 'fa-droplet',              color: '#4ba9d3' },
    poop:      { label: 'うんち',   icon: 'fa-poop',                 color: '#a77a50' },
    temp:      { label: '体温',     icon: 'fa-temperature-half',     color: '#e0594f' },
    bath:      { label: 'お風呂',   icon: 'fa-bath',                 color: '#3fb3a4' },
    med:       { label: '薬',       icon: 'fa-pills',                color: '#8a74d6' },
    memo:      { label: 'メモ',     icon: 'fa-pen',                  color: '#7f8594' }
  };
  BA.FEED_TYPES = ['breast', 'formula', 'expressed'];
  BA.SIDE = { left: '左', right: '右', both: '両方' };

  // ---------- 状態 ----------
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };
  BA.ls = ls;
  BA.state = {
    token: ls.get('ba_token'),
    me: null, role: null, family: null, members: [], children: [],
    childId: ls.get('ba_child'),
    tab: 'home',
    dayOffset: 0,
    statDays: 7,
    healthTab: 'growth',
    growthMetric: 'weight',
    obRole: 'editor'
  };
  BA.data = {};
  BA.charts = [];

  // ---------- 汎用関数 ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  BA.pad2 = pad2;
  BA.esc = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  BA.DAY = 86400000;
  BA.dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  BA.clock = (ms) => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  BA.ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  BA.parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  BA.toLocalInput = (ms) => { const d = new Date(ms); return BA.ymd(ms) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  BA.fromLocalInput = (s) => { const t = new Date(s).getTime(); return isNaN(t) ? null : t; };
  BA.mdLabel = (ms) => { const d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate(); };
  BA.WD = ['日', '月', '火', '水', '木', '金', '土'];
  BA.dayLabel = (ms) => {
    const d = new Date(ms);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + BA.WD[d.getDay()] + ')';
  };

  BA.fmtDur = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 1) return '1分未満';
    if (m < 60) return m + '分';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + '時間' + r + '分' : h + '時間';
  };
  BA.fmtAgo = (ms) => {
    const diff = Date.now() - ms;
    if (diff < 60000) return 'たった今';
    const m = Math.floor(diff / 60000);
    if (m < 60) return m + '分前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + '時間' + (m % 60) + '分前';
    const d = Math.floor(h / 24);
    return d + '日' + (h % 24) + '時間前';
  };
  BA.fmtTimer = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + pad2(m) : m) + ':' + pad2(r);
  };

  BA.addMonths = (date, months) => {
    const d = new Date(date.getTime());
    const whole = Math.floor(months);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + whole);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, dim));
    const frac = months - whole;
    if (frac) d.setDate(d.getDate() + Math.round(frac * 30.4));
    return d;
  };

  BA.ageText = (birthday) => {
    const b = BA.parseYMD(birthday);
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const days = Math.round((today - b) / BA.DAY);
    if (days < 0) return '誕生まで' + -days + '日';
    if (days < 31) return '生後' + days + '日';
    let months = (today.getFullYear() - b.getFullYear()) * 12 + today.getMonth() - b.getMonth();
    if (today.getDate() < b.getDate()) months--;
    if (months < 12) {
      const md = BA.addMonths(b, months);
      return '生後' + months + 'か月' + Math.round((today - md) / BA.DAY) + '日';
    }
    return Math.floor(months / 12) + '歳' + (months % 12) + 'か月';
  };

  BA.parseLog = (l) => {
    let d = {};
    if (l.detail) { try { d = JSON.parse(l.detail) || {}; } catch (e) { d = {}; } }
    return Object.assign({}, l, { d });
  };
  BA.memberName = (id) => {
    const m = BA.state.members.find((x) => x.id === id);
    return m ? m.name : '';
  };
  BA.me = () => (BA.state.members || []).find((x) => x.id === BA.state.me) || null;
  BA.isViewer = () => {
    const m = BA.me();
    return m ? m.role === 'viewer' : BA.state.role === 'viewer';
  };
  BA.child = () => BA.state.children.find((c) => c.id === BA.state.childId) || BA.state.children[0] || null;

  // ---------- API ----------
  // 通信の失敗(接続の張り直し直後など)で最初の1回だけ落ちることがあるので、
  // 重複しても害のないもの(取得系・参加・家族作成)だけ自動で1回やり直す
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const retryable = (method, path) => method === 'GET' || path === '/join' || path === '/families' || path === '/auth/send-code';
  BA.api = async (method, path, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (BA.state.token) headers.Authorization = 'Bearer ' + BA.state.token;
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        break;
      } catch (e) {
        if (attempt < 2 && retryable(method, path)) { await wait(500 + attempt * 700); continue; }
        const err = new Error('通信できません。電波の良い場所でもう一度お試しください');
        err.network = true;
        throw err;
      }
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (res.status === 401 && BA.state.token) {
      if (BA.onUnauthorized) BA.onUnauthorized();
      const err = new Error('この端末の連携が切れました。招待コードで再度参加してください');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'エラーが発生しました');
      err.status = res.status;
      throw err;
    }
    return data;
  };

  // ---------- トースト ----------
  BA.toast = (msg, opt) => {
    opt = opt || {};
    const root = document.getElementById('toast-root');
    root.innerHTML = ''; // 常に最新の1件だけ表示(積み重なって画面を隠さないように)
    clearTimeout(BA._toastTimer);
    const el = document.createElement('div');
    el.className = 'toast';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (opt.action) {
      const b = document.createElement('button');
      b.textContent = opt.action;
      b.addEventListener('click', () => { el.remove(); if (opt.onAction) opt.onAction(); });
      el.appendChild(b);
    }
    root.appendChild(el);
    BA._toastTimer = setTimeout(() => el.remove(), opt.ms || (opt.action ? 5000 : 2600));
  };
  BA.errToast = (e) => BA.toast(e && e.message ? e.message : 'エラーが発生しました');

  // ---------- シート(ボトムシート) ----------
  BA.sheetHandler = null;
  BA.openSheet = (title, iconHtml, bodyHtml, handler) => {
    const root = document.getElementById('sheet-root');
    root.innerHTML =
      '<div class="sheet-backdrop" data-sheet="close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + BA.esc(title) + '">' +
      '<div class="sheet-head"><h2>' + (iconHtml || '') + BA.esc(title) + '</h2>' +
      '<button class="icon-btn" data-sheet="close" aria-label="閉じる"><i class="fas fa-xmark"></i></button></div>' +
      '<div class="sheet-body" id="sheet-body">' + bodyHtml + '</div></div>';
    document.body.classList.add('sheet-open');
    BA.sheetHandler = handler || null;
    if (BA.hydratePhotos) BA.hydratePhotos(root);
  };
  BA.setSheetBody = (html) => {
    const b = document.getElementById('sheet-body');
    if (b) { const top = b.scrollTop; b.innerHTML = html; b.scrollTop = top; if (BA.hydratePhotos) BA.hydratePhotos(b); }
  };
  BA.closeSheet = () => {
    document.getElementById('sheet-root').innerHTML = '';
    document.body.classList.remove('sheet-open');
    BA.sheetHandler = null;
  };
  BA.sheetOpen = () => !!BA.sheetHandler;

  // ---------- 集計 ----------
  // [ds, de) の範囲での集計。睡眠は日をまたぐ分を按分する
  BA.summarize = (logs, ds, de) => {
    const s = { feed: 0, breast: 0, formula: 0, expressed: 0, ml: 0, sleepMs: 0, pee: 0, poop: 0 };
    const now = Date.now();
    for (const l of logs) {
      if (l.type === 'sleep') {
        const a = Math.max(l.started_at, ds);
        const b = Math.min(l.ended_at == null ? now : l.ended_at, de);
        if (b > a) s.sleepMs += b - a;
        continue;
      }
      if (l.started_at < ds || l.started_at >= de) continue;
      if (l.type === 'breast') { s.breast++; s.feed++; }
      else if (l.type === 'formula') { s.formula++; s.feed++; s.ml += l.amount || 0; }
      else if (l.type === 'expressed') { s.expressed++; s.feed++; s.ml += l.amount || 0; }
      else if (l.type === 'pee') s.pee++;
      else if (l.type === 'poop') s.poop++;
    }
    return s;
  };

  // ---------- 予防接種(日本の定期接種を中心とした目安) ----------
  // start/end: 生後の月数(標準的な接種時期の目安)。opt: 任意接種
  BA.VACCINES = [
    { key: 'hepb_1', name: 'B型肝炎 1回目', start: 2, end: 3 },
    { key: 'hepb_2', name: 'B型肝炎 2回目', start: 3, end: 4, note: '1回目から27日以上あけます' },
    { key: 'hepb_3', name: 'B型肝炎 3回目', start: 7, end: 9, note: '1回目から139日以上あけます' },
    { key: 'rota_1', name: 'ロタウイルス 1回目', start: 2, end: 3.4, note: '初回は生後14週6日までに。ワクチンの種類で2回または3回' },
    { key: 'rota_2', name: 'ロタウイルス 2回目', start: 3, end: 5, note: '1回目から27日以上あけます' },
    { key: 'rota_3', name: 'ロタウイルス 3回目', start: 4, end: 7, note: '3回接種のワクチン(5価)のみ' },
    { key: 'pcv_1', name: '小児用肺炎球菌 1回目', start: 2, end: 3 },
    { key: 'pcv_2', name: '小児用肺炎球菌 2回目', start: 3, end: 4, note: '27日以上あけます' },
    { key: 'pcv_3', name: '小児用肺炎球菌 3回目', start: 4, end: 7, note: '27日以上あけます' },
    { key: 'pcv_4', name: '小児用肺炎球菌 追加', start: 12, end: 15 },
    { key: 'dpt_1', name: '五種混合 1回目', start: 2, end: 3, note: '百日せき・ジフテリア・破傷風・ポリオ・Hib' },
    { key: 'dpt_2', name: '五種混合 2回目', start: 3, end: 4, note: '20〜56日の間隔で' },
    { key: 'dpt_3', name: '五種混合 3回目', start: 4, end: 7, note: '20〜56日の間隔で' },
    { key: 'dpt_4', name: '五種混合 追加', start: 12, end: 18, note: '3回目から6か月以上あけます' },
    { key: 'bcg', name: 'BCG(結核)', start: 5, end: 8 },
    { key: 'mr_1', name: 'MR(麻しん・風しん) 1期', start: 12, end: 24 },
    { key: 'var_1', name: '水痘 1回目', start: 12, end: 15 },
    { key: 'var_2', name: '水痘 2回目', start: 18, end: 24, note: '1回目から3か月以上(標準6〜12か月)あけます' },
    { key: 'mumps_1', name: 'おたふくかぜ 1回目', start: 12, end: 24, opt: true, note: '任意接種' },
    { key: 'mumps_2', name: 'おたふくかぜ 2回目', start: 60, end: 72, opt: true, note: '任意接種(5〜6歳)' },
    { key: 'je_1', name: '日本脳炎 1期 1回目', start: 36, end: 48, note: '生後6か月から接種できます' },
    { key: 'je_2', name: '日本脳炎 1期 2回目', start: 37, end: 49, note: '6〜28日の間隔で' },
    { key: 'je_3', name: '日本脳炎 1期 追加', start: 48, end: 60, note: '2回目からおおむね1年後' },
    { key: 'mr_2', name: 'MR 2期', start: 60, end: 72, note: '年長(就学前の1年間)' }
  ];

  // 状態: done / now(接種時期) / soon(21日以内に開始) / late(標準時期を過ぎた) / future
  BA.vaccineRows = (child, vacs) => {
    const b = BA.parseYMD(child.birthday);
    const doneMap = {};
    (vacs || []).forEach((v) => { doneMap[v.vaccine_key] = v.done_on; });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return BA.VACCINES.map((v) => {
      const sd = BA.addMonths(b, v.start);
      const ed = BA.addMonths(b, v.end);
      let status = 'future';
      const done = doneMap[v.key] || null;
      if (done) status = 'done';
      else if (today >= ed) status = 'late';
      else if (today >= sd) status = 'now';
      else if ((sd - today) / BA.DAY <= 21) status = 'soon';
      return Object.assign({}, v, { startDate: sd, endDate: ed, status, doneOn: done });
    });
  };

  // ---------- 1秒ティッカー(経過時間表示の更新) ----------
  BA.tick = () => {
    const now = Date.now();
    document.querySelectorAll('[data-timer]').forEach((el) => {
      el.textContent = BA.fmtTimer(now - Number(el.dataset.timer));
    });
    document.querySelectorAll('[data-ago]').forEach((el) => {
      el.textContent = BA.fmtAgo(Number(el.dataset.ago));
    });
  };
  setInterval(BA.tick, 1000);

  // ---------- テーマ ----------
  BA.applyTheme = () => {
    const t = ls.get('ba_theme') || 'auto';
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#13111a' : '#fff7f3');
  };

  BA.destroyCharts = () => { BA.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* noop */ } }); BA.charts = []; };

  // ---------- 成長曲線(WHO Child Growth Standards の LMS 法) ----------
  // ind: wfa(体重kg) / lhfa(身長cm) / hcfa(頭囲cm)、sex: boy / girl、days: 生後日数
  BA.lms = (ind, sex, days) => {
    const W = window.WHO;
    if (!W || !W[ind] || !W[ind][sex] || days < 0) return null;
    const t = W[ind][sex];
    if (days > t[t.length - 1][0]) return null;
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid][0] <= days) lo = mid; else hi = mid; }
    const a = t[lo], b = t[hi];
    const f = b[0] === a[0] ? 0 : (days - a[0]) / (b[0] - a[0]);
    return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
  };
  BA.zscore = (x, p) => (p.L === 0 ? Math.log(x / p.M) / p.S : (Math.pow(x / p.M, p.L) - 1) / (p.L * p.S));
  BA.valueAtZ = (z, p) => (p.L === 0 ? p.M * Math.exp(p.S * z) : p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L));
  BA.normCdf = (z) => {
    // Abramowitz-Stegun 7.1.26
    const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + (z < 0 ? -y : y));
  };
  // 計測値からパーセンタイル(0-100)を返す。範囲外や性別未設定は null
  BA.percentile = (ind, sex, days, value) => {
    if (sex !== 'boy' && sex !== 'girl') return null;
    const p = BA.lms(ind, sex, days);
    if (!p || !(value > 0)) return null;
    return BA.normCdf(BA.zscore(value, p)) * 100;
  };
  BA.daysOld = (birthday, ymd) => Math.round((BA.parseYMD(ymd) - BA.parseYMD(birthday)) / BA.DAY);

  // ---------- 写真(R2) ----------
  BA.resizeImage = (file, maxEdge, quality) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('写真を変換できませんでした')); }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この形式の写真は読み込めません。別の写真をお試しください')); };
    img.src = url;
  });

  BA.uploadPhoto = async (blob) => {
    let res;
    try {
      res = await fetch('/api/photos', { method: 'POST', headers: { Authorization: 'Bearer ' + BA.state.token, 'Content-Type': 'image/jpeg' }, body: blob });
    } catch (e) { throw new Error('通信できません。電波の良い場所でもう一度お試しください'); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (!res.ok) throw new Error((data && data.error) || '写真を送信できませんでした');
    return data.photo_id;
  };

  // 認証ヘッダーが必要なので <img src> では読めない。blob にして表示する(メモリにキャッシュ)
  const photoCache = new Map();
  BA.photoUrl = (id) => {
    if (photoCache.has(id)) return photoCache.get(id);
    const p = fetch('/api/photos/' + id, { headers: { Authorization: 'Bearer ' + BA.state.token } })
      .then((r) => { if (!r.ok) throw new Error('photo'); return r.blob(); })
      .then((b) => URL.createObjectURL(b))
      .catch(() => { photoCache.delete(id); return null; });
    photoCache.set(id, p);
    return p;
  };
  BA.hydratePhotos = (root) => {
    (root || document).querySelectorAll('img[data-photo]').forEach((img) => {
      if (img.dataset.loaded) return;
      img.dataset.loaded = '1';
      BA.photoUrl(img.dataset.photo).then((u) => {
        if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'photo-missing', textContent: '写真を読み込めません' }));
      });
    });
  };
})();
