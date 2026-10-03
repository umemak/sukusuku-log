/* すくすくログ - main: 起動・描画制御・イベント */
(function () {
  'use strict';
  const BA = window.BA;
  const V = BA.views;
  const st = BA.state;
  const $app = () => document.getElementById('app');

  let rendering = false;
  let pollTimer = null;

  // ---------- データ取得 ----------
  BA.reloadMe = async function () {
    const r = await BA.api('GET', '/me');
    st.me = r.me; st.family = r.family; st.members = r.members; st.children = r.children;
    const ids = st.children.map((c) => c.id);
    if (!ids.includes(st.childId)) {
      st.childId = ids[0] || null;
      if (st.childId) BA.ls.set('ba_child', st.childId); else BA.ls.del('ba_child');
    }
  };

  async function loadData() {
    const c = BA.child();
    if (!c) return;
    const today = BA.dayStart(Date.now());
    const from = Math.min(
      today - 7 * BA.DAY,
      today + st.dayOffset * BA.DAY,
      today - (st.statDays - 1) * BA.DAY
    ) - BA.DAY;
    const jobs = [
      BA.api('GET', '/children/' + c.id + '/logs?from=' + from + '&limit=5000'),
      BA.api('GET', '/children/' + c.id + '/last')
    ];
    if (st.tab === 'health') {
      jobs.push(BA.api('GET', '/children/' + c.id + '/growth'));
      jobs.push(BA.api('GET', '/children/' + c.id + '/vaccinations'));
      jobs.push(BA.api('GET', '/children/' + c.id + '/foods'));
    }
    if (st.tab === 'memory') jobs.push(BA.api('GET', '/children/' + c.id + '/diary'));
    // 補助の「申請済み」チェック(ホームの児童手当のお知らせと、健康タブで使う)
    const subsP = (st.tab === 'health' || st.tab === 'home') ? BA.api('GET', '/children/' + c.id + '/subsidies').catch(() => null) : null;
    const res = await Promise.all(jobs);
    if (subsP) { const sr = await subsP; if (sr) BA.data.subs = sr.subsidies; }
    BA.data.logs = res[0].logs;
    BA.data.last = res[1].last;
    const lb = res[1].last.breast ? BA.parseLog(res[1].last.breast) : null;
    BA.data.nextSide = lb && lb.d.side ? (lb.d.side === 'left' ? 'right' : lb.d.side === 'right' ? 'left' : 'left') : 'left';
    if (st.tab === 'health') {
      BA.data.growth = res[2].growth;
      BA.data.vacs = res[3].vaccinations;
      BA.data.foods = res[4].foods;
    }
    if (st.tab === 'memory') BA.data.diary = res[2].diary;
  }

  // ---------- 描画 ----------
  BA.render = function () {
    const root = $app();
    if (st.token && st.family) st.obMode = null;
    if (!st.token || !st.family) { root.innerHTML = V.onboard(new URLSearchParams(location.search).get('code') || ''); return; }
    if (!BA.child()) { root.innerHTML = V.noChild(); return; }
    BA.destroyCharts();
    const scroll = window.scrollY;
    const open = {};
    root.querySelectorAll('details.fold').forEach((d, i) => { open[d.id || i] = d.open; }); // id があれば id で(並び替えでずれないように)
    root.innerHTML = V[st.tab] ? V[st.tab]() : V.home();
    root.querySelectorAll('details.fold').forEach((d, i) => { if (open[d.id || i]) d.open = true; });
    window.scrollTo(0, scroll);
    if (st.tab === 'stats') V.drawStats();
    if (st.tab === 'health' && st.healthTab === 'growth') V.drawGrowth();
    BA.hydratePhotos(root);
  };

  BA.refresh = async function (opts) {
    if (!st.token || rendering) return;
    rendering = true;
    try {
      if (!st.family) await BA.reloadMe();
      if (BA.child()) await loadData();
      BA.render();
      if (BA.loadAiStatus) BA.loadAiStatus();
    } catch (e) {
      if (!(opts && opts.silent)) BA.errToast(e);
    } finally { rendering = false; }
  };

  BA.onUnauthorized = function () {
    st.token = null; st.family = null;
    if (BA.ai) { BA.ai.loaded = false; BA.ai.enabled = false; }
    BA.ls.del('ba_token');
    BA.closeSheet();
    BA.render();
  };

  // ---------- 家族間の同期(定期ポーリング) ----------
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.hidden || BA.sheetOpen() || !st.token) return;
      if (st.tab === 'health' || document.body.classList.contains('report-open')) return; // 折りたたみ・入力を邪魔しない
      BA.refresh({ silent: true });
    }, 20000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && st.token && !BA.sheetOpen()) BA.refresh({ silent: true });
    });
  }

  // ---------- オンボーディング ----------
  async function onboardSubmit(kind, btn) {
    const name = document.getElementById('ob-name').value.trim();
    const codeEl = document.getElementById('ob-code');
    const code = codeEl ? codeEl.value.trim() : '';
    const err = document.getElementById('ob-err');
    err.textContent = '';
    if (kind === 'join' && !code) { err.textContent = '家族コードを入力してください'; codeEl.focus(); return; }
    if (!name) { err.textContent = 'あなたの呼び名を入力してください'; document.getElementById('ob-name').focus(); return; }
    btn.disabled = true;
    try {
      const r = kind === 'create'
        ? await BA.api('POST', '/families', { memberName: name })
        : await BA.api('POST', '/join', { memberName: name, code });
      st.token = r.token;
      BA.ls.set('ba_token', r.token);
      if (location.search) history.replaceState(null, '', location.pathname);
      await BA.reloadMe();
      st.tab = kind === 'create' && !st.children.length ? 'home' : 'home';
      if (kind === 'create') {
        BA.render();
        BA.toast('家族コードは「家族」タブで確認できます', { ms: 4000 });
        BA.openChildForm(null);
        return;
      }
      await BA.refresh();
      BA.toast(r.linked ? '「' + r.memberName + '」さんの端末として追加しました' : '家族に参加しました', { ms: r.linked ? 4000 : undefined });
    } catch (e) {
      err.textContent = e.message;
    } finally { btn.disabled = false; }
  }

  // ---------- クリック処理 ----------
  const actions = {
    'ob-go': (el) => {
      st.obMode = el.dataset.mode === 'choose' ? null : el.dataset.mode;
      if (el.dataset.mode === 'choose' && location.search) history.replaceState(null, '', location.pathname);
      BA.render();
      window.scrollTo(0, 0);
      if (!st.obMode) return;
      const codeEl = document.getElementById('ob-code');
      const first = codeEl && !codeEl.value ? codeEl : document.getElementById('ob-name');
      if (first) first.focus();
    },
    'ob-create': (el) => onboardSubmit('create', el),
    backstart: async () => {
      const alone = st.members.length <= 1;
      if (!confirm(alone
        ? '最初の画面に戻ります。いま作った(空の)家族は取り消されます。\nよろしいですか?'
        : 'この端末の連携を解除して、最初の画面に戻ります。家族のデータは消えません。\nよろしいですか?')) return;
      try {
        if (alone) await BA.api('POST', '/families/discard');
      } catch (e) {
        if (e.status !== 409) { BA.errToast(e); return; } // 取り消せない場合は、通常の連携解除にする
      }
      st.token = null; st.family = null; st.members = []; st.children = []; st.childId = null; st.obMode = null;
      BA.ls.del('ba_token'); BA.ls.del('ba_child');
      BA.closeSheet();
      BA.render();
      BA.toast('最初の画面に戻りました');
    },
    'ob-join': (el) => onboardSubmit('join', el),
    addchild: () => BA.openChildForm(null),
    editchild: (el) => BA.openChildForm(st.children.find((c) => c.id === el.dataset.id)),
    switchchild: () => BA.openChildSwitcher(),
    refresh: () => BA.refresh(),
    tab: (el) => { st.tab = el.dataset.tab; if (st.tab === 'timeline') st.dayOffset = 0; window.scrollTo(0, 0); BA.refresh(); },
    open: (el) => BA.openEntry(el.dataset.type),
    quick: (el) => {
      const t = el.dataset.type;
      BA.quickRecord(t, t === 'poop' ? { kind: 'normal' } : null);
    },
    sleep: () => BA.toggleSleep(),
    more: () => BA.openTypePicker(),
    voice: () => BA.openVoice(),
    stoptimer: (el) => BA.stopTimer(el.dataset.id),
    canceltimer: (el) => BA.cancelTimer(el.dataset.id),
    editlog: (el) => {
      const l = (BA.data.logs || []).find((x) => x.id === el.dataset.id);
      if (l) BA.openEntry(l.type, l);
    },
    day: (el) => {
      const d = st.dayOffset + Number(el.dataset.d);
      if (d > 0) return;
      st.dayOffset = d; BA.refresh();
    },
    statdays: (el) => { st.statDays = Number(el.dataset.d); BA.refresh(); },
    healthtab: (el) => { st.healthTab = el.dataset.t; BA.refresh(); },
    opensubsidy: (el) => {
      st.tab = 'health'; st.healthTab = 'subsidy'; window.scrollTo(0, 0);
      BA.refresh().then(() => {
        const d = document.getElementById('sub-' + (el.dataset.id || ''));
        if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
      });
    },
    gmetric: (el) => { st.growthMetric = el.dataset.m; BA.render(); },
    addgrowth: () => BA.openGrowthForm(),
    delgrowth: async (el) => {
      if (!confirm('この成長記録を削除しますか?')) return;
      try { await BA.api('DELETE', '/growth/' + el.dataset.id); BA.toast('削除しました'); await BA.refresh(); } catch (e) { BA.errToast(e); }
    },
    vac: (el) => {
      const row = BA.vaccineRows(BA.child(), BA.data.vacs).find((r) => r.key === el.dataset.key);
      if (row) BA.openVaccine(row);
    },
    theme: (el) => { BA.ls.set('ba_theme', el.dataset.t); BA.applyTheme(); BA.render(); },
    copycode: async () => {
      try { await navigator.clipboard.writeText(st.family.code); BA.toast('家族コードをコピーしました'); }
      catch (e) { BA.toast('コピーできませんでした。コードを手入力してください'); }
    },
    sharecode: async () => {
      const url = location.origin + '/?code=' + st.family.code;
      const text = '「すくすくログ」で育児記録を一緒に共有しましょう。リンクを開いて参加してください。\n家族コード: ' + st.family.code;
      if (navigator.share) {
        try { await navigator.share({ title: 'すくすくログ', text, url }); } catch (e) { /* cancelled */ }
      } else {
        try { await navigator.clipboard.writeText(text + '\n' + url); BA.toast('招待文をコピーしました'); }
        catch (e) { BA.toast('共有できませんでした'); }
      }
    },
    rename: async () => {
      const me = st.members.find((m) => m.id === st.me);
      const name = prompt('あなたの呼び名', me ? me.name : '');
      if (!name || !name.trim()) return;
      try { await BA.api('PUT', '/members/me', { name: name.trim() }); await BA.reloadMe(); BA.render(); BA.toast('変更しました'); } catch (e) { BA.errToast(e); }
    },
    addfood: (el) => BA.openFoodForm(el.dataset.food || ''),
    delfood: async (el) => {
      if (!confirm('この記録を削除しますか?')) return;
      try { await BA.api('DELETE', '/foods/' + el.dataset.id); BA.toast('削除しました'); await BA.refresh(); } catch (e) { BA.errToast(e); }
    },
    adddiary: () => BA.openDiary(null),
    editdiary: (el) => { const d = (BA.data.diary || []).find((x) => x.id === el.dataset.id); if (d) BA.openDiary(d); },
    report: () => BA.openReport(),
    'report-close': () => BA.closeReport(),
    'report-print': () => BA.printReport(),
    'report-days': (el) => BA.reportDays(Number(el.dataset.d)),
    regencode: async () => {
      if (!confirm('家族コードを再発行します。古いコードでは参加できなくなります(参加済みの端末はそのまま使えます)。よろしいですか?')) return;
      try { const r = await BA.api('POST', '/families/regenerate-code'); st.family.code = r.code; BA.render(); BA.toast('新しいコードを発行しました'); } catch (e) { BA.errToast(e); }
    },
    delmember: async (el) => {
      if (!confirm('「' + el.dataset.name + '」を家族から削除しますか?\nその端末は記録を見られなくなります(過去の記録は残ります)。')) return;
      try { await BA.api('DELETE', '/members/' + el.dataset.id); await BA.reloadMe(); BA.render(); BA.toast('削除しました'); } catch (e) { BA.errToast(e); }
    },
    logout: () => {
      if (!confirm('この端末の連携を解除します。家族コードで再度参加できます。よろしいですか?')) return;
      st.token = null; st.family = null; st.members = []; st.children = []; st.childId = null;
      BA.ls.del('ba_token'); BA.ls.del('ba_child');
      BA.render();
    }
  };

  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const sheetRoot = document.getElementById('sheet-root');
    if (sheetRoot.contains(target)) {
      if (target.closest('[data-sheet="close"]')) { BA.closeSheet(); return; }
      const el = target.closest('[data-act]');
      if (el && BA.sheetHandler) BA.sheetHandler.click(el.dataset.act, el);
      return;
    }
    const el = target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el instanceof Element && BA.sheetHandler && document.getElementById('sheet-root').contains(el)) BA.sheetHandler.input(el);
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el instanceof Element && BA.sheetHandler && BA.sheetHandler.change && document.getElementById('sheet-root').contains(el)) BA.sheetHandler.change(el);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.body.classList.contains('report-open')) { BA.closeReport(); return; }
    if (ev.key === 'Escape' && BA.sheetOpen()) BA.closeSheet();
  });

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => { if ((BA.ls.get('ba_theme') || 'auto') === 'auto') BA.applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', fn);
  }

  // ---------- 起動 ----------
  async function boot() {
    BA.applyTheme();
    if (!st.token) { BA.render(); return; }
    $app().innerHTML = V.loading();
    try {
      await BA.reloadMe();
      await BA.refresh();
    } catch (e) {
      if (e.status === 401) return;
      $app().innerHTML = '<div class="onboard"><div class="logo"><i class="fas fa-wifi"></i></div><h1>読み込めませんでした</h1><p class="lead">' + BA.esc(e.message) + '</p>' +
        '<button class="btn primary block" onclick="location.reload()">再読み込み</button></div>';
    }
  }

  startPolling();
  boot();

  // ---------- アプリの自動更新 ----------
  // PWAは起動したままだと古い画面が残る。サーバーの版とちがえば、自動で最新版に入れ替える
  const myVer = (document.querySelector('meta[name="app-version"]') || {}).content || '';
  let updating = false;
  async function applyUpdate() {
    if (updating) return;
    updating = true;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    } catch (e) { /* 続行 */ }
    location.reload();
  }
  async function checkVersion(fromBoot) {
    if (!myVer || myVer === 'dev' || updating || !navigator.onLine) return;
    let sv = '';
    try {
      const r = await fetch('/api/version?t=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return; // Access のログイン画面などは無視
      sv = (await r.json()).v || '';
    } catch (e) { return; }
    if (!sv || sv === myVer) { try { sessionStorage.removeItem('ba_upd'); } catch (e) {} return; }
    // 更新の繰り返し(ループ)を防ぐ: 同じ版への自動更新は1セッションに1回だけ
    let tried = '';
    try { tried = sessionStorage.getItem('ba_upd') || ''; } catch (e) {}
    const idle = !BA.sheetOpen() && !document.body.classList.contains('report-open');
    if (idle && tried !== sv) {
      try { sessionStorage.setItem('ba_upd', sv); } catch (e) {}
      BA.toast('新しいバージョンに更新しています…', { ms: 1500 });
      setTimeout(applyUpdate, fromBoot ? 0 : 800);
    } else if (!idle || tried === sv) {
      BA.toast('新しいバージョンがあります', { action: '更新', onAction: applyUpdate, ms: 15000 });
    }
  }
  BA.checkVersion = checkVersion;
  setTimeout(() => checkVersion(true), 1200);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(false); });
  setInterval(() => { if (!document.hidden) checkVersion(false); }, 5 * 60 * 1000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => { document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); }); })
        .catch(() => {});
    });
  }
})();
