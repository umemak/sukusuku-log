/* すくすくログ - voice: 声・文章でまとめて記録(Gemini) */
(function () {
  'use strict';
  const BA = window.BA;
  const esc = BA.esc;
  const { mountSheet, guard } = BA.ui;

  const MAX_SEC = 30;
  BA.ai = { enabled: false, remaining: 0, limit: 0, loaded: false };

  // 画面を開いたときに一度だけ利用可否を確認(未設定ならマイクボタンを出さない)
  BA.loadAiStatus = async function () {
    if (BA.ai.loaded || !BA.state.token) return;
    BA.ai.loaded = true;
    try {
      const r = await BA.api('GET', '/ai/status');
      const changed = r.enabled !== BA.ai.enabled;
      BA.ai.enabled = !!r.enabled; BA.ai.remaining = r.remaining; BA.ai.limit = r.limit;
      if (changed && !BA.sheetOpen() && BA.state.tab === 'home') BA.render();
    } catch (e) { BA.ai.loaded = false; }
  };

  const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  function pickMime() {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of c) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* noop */ } }
    return '';
  }

  // 候補1件 → 保存用の本文(時刻の解決もここで行う)
  function resolveTime(e) {
    const now = Date.now();
    if (e.minutes_ago != null) return { t: now - e.minutes_ago * 60000, explicit: true };
    if (e.clock && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.clock)) {
      const d = new Date(); d.setHours(Number(e.clock.slice(0, 2)), Number(e.clock.slice(3)), 0, 0);
      let t = d.getTime();
      if (t > now + 5 * 60000) t -= 86400000;
      return { t, explicit: true };
    }
    return { t: now, explicit: false };
  }
  function toCand(e) {
    const r = resolveTime(e);
    const c = { type: e.type, started: r.t, ended: null, amount: e.amount, side: e.side, kind: e.poop_kind, medName: e.med_name || '', note: e.note || '' };
    const dur = e.duration_min;
    if (dur && (e.type === 'breast' || e.type === 'sleep')) {
      if (r.explicit) c.ended = r.t + dur * 60000;
      else { c.started = r.t - dur * 60000; c.ended = r.t; }
    } else if (e.type === 'breast') {
      c.ended = c.started + 10 * 60000; // 時間が分からない母乳は10分としておく(確認画面で直せる)
      c.guess = '授乳時間は10分としています';
    }
    if (e.type === 'memo' && !c.note) c.note = '';
    return c;
  }
  function candBody(c) {
    const b = { type: c.type, started_at: c.started, ended_at: c.ended, amount: null, detail: null, note: c.note ? c.note.trim().slice(0, 500) : null };
    if (!b.note) b.note = null;
    if (c.type === 'breast') b.detail = c.side ? { side: c.side } : null;
    else if (c.type === 'formula' || c.type === 'expressed') {
      if (!(c.amount > 0)) throw new Error(BA.TYPES[c.type].label + 'の量を入力してください');
      b.amount = c.amount;
    } else if (c.type === 'temp') {
      if (!(c.amount >= 30 && c.amount <= 45)) throw new Error('体温を入力してください');
      b.amount = Math.round(c.amount * 10) / 10;
    } else if (c.type === 'poop') b.detail = c.kind ? { kind: c.kind } : { kind: 'normal' };
    else if (c.type === 'med') {
      if (!c.medName.trim()) throw new Error('薬の名前を入力してください');
      b.detail = { name: c.medName.trim().slice(0, 60) };
    } else if (c.type === 'memo' && !b.note) throw new Error('メモの内容を入力してください');
    return b;
  }
  function candTitle(c) {
    try {
      const b = candBody(c);
      return BA.describe({ type: b.type, started_at: b.started_at, ended_at: b.ended_at, amount: b.amount, d: b.detail || {}, note: b.note, member_id: null });
    } catch (e) {
      return { title: BA.TYPES[c.type].label, sub: '' };
    }
  }

  async function postParse(body, contentType) {
    const headers = { 'Content-Type': contentType };
    if (BA.state.token) headers.Authorization = 'Bearer ' + BA.state.token;
    let res;
    try {
      res = await fetch('/api/ai/parse?tz=' + new Date().getTimezoneOffset(), { method: 'POST', headers, body });
    } catch (e) { throw new Error('通信できません。電波の良い場所でもう一度お試しください'); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (res.status === 401 && BA.onUnauthorized) BA.onUnauthorized();
    if (!res.ok) throw new Error((data && data.error) || 'うまく聞き取れませんでした');
    return data;
  }

  BA.openVoice = function (startMode) {
    const sess = {};
    BA._voiceSession = sess;
    const st = {
      phase: canRecord() && startMode !== 'text' ? 'idle' : 'text',
      text: '', err: '', sec: 0, cands: [], transcript: '', unclear: ''
    };
    if (!canRecord() && startMode !== 'text') st.err = 'この端末では録音が使えないため、文字で入力できます';
    let rec = null, stream = null, chunks = [], timer = null, mime = '', cancelled = false;

    const alive = () => BA._voiceSession === sess && !!document.getElementById('voice-root');
    function cleanup() {
      clearInterval(timer); timer = null;
      try { if (rec && rec.state !== 'inactive') { cancelled = true; rec.stop(); } } catch (e) { /* noop */ }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null; rec = null;
    }

    const remainText = () => BA.ai.limit ? '<p class="muted voice-note">今日あと ' + BA.ai.remaining + ' 回まで使えます</p>' : '';
    const disclaimer = '<p class="muted voice-note"><i class="fas fa-shield-halved"></i> 音声・文章はGoogleのAIに送って記録の抽出だけに使います(保存はしません)。医療的な判断はしません。</p>';

    function render() {
      let h = '<div id="voice-root">';
      if (st.err) h += '<div class="notice warn" role="alert">' + esc(st.err) + '</div>';
      if (st.phase === 'idle') {
        h += '<p class="voice-lead">まとめて話しかけるだけで記録できます。</p>' +
          '<p class="muted voice-eg">例:「さっきミルク120と、おしっこ。うんちはやわらかめ」</p>' +
          '<button class="voice-mic" data-act="rec" aria-label="録音を始める"><i class="fas fa-microphone"></i></button>' +
          '<p class="voice-hint">タップして話す</p>' +
          '<div class="btn-row"><button class="btn soft" data-act="totext"><i class="fas fa-keyboard"></i>文字で入力</button></div>' +
          remainText() + disclaimer;
      } else if (st.phase === 'recording') {
        h += '<p class="voice-lead">聞いています… 話し終わったら止めてください</p>' +
          '<button class="voice-mic rec" data-act="stop" aria-label="録音を止める"><i class="fas fa-stop"></i></button>' +
          '<p class="voice-hint"><span id="voice-sec">' + st.sec + '</span> / ' + MAX_SEC + ' 秒</p>' +
          '<div class="btn-row"><button class="btn soft" data-act="cancelrec">やめる</button></div>';
      } else if (st.phase === 'working') {
        h += '<div class="voice-wait" role="status"><i class="fas fa-spinner fa-spin"></i><p>AIが記録に変換しています…</p></div>';
      } else if (st.phase === 'text') {
        h += '<label class="field"><span>話す代わりに文章で</span><textarea id="voice-text" data-bind="text" maxlength="500" rows="4" placeholder="例: 10時にミルク120ml、そのあとおしっこ。体温は36.8度">' + esc(st.text) + '</textarea></label>' +
          '<div class="btn-row">' + (canRecord() ? '<button class="btn soft" data-act="toidle"><i class="fas fa-microphone"></i>声で入力</button>' : '') +
          '<button class="btn primary" data-act="sendtext">記録に変換</button></div>' + remainText() + disclaimer;
      } else if (st.phase === 'confirm') {
        h += '<p class="voice-lead" style="text-align:left">この内容で記録します。まちがいがないか確認してください。</p>';
        if (st.transcript) h += '<div class="voice-tr"><i class="fas fa-quote-left"></i> ' + esc(st.transcript) + '</div>';
        if (st.unclear) h += '<div class="notice warn">' + esc(st.unclear) + '</div>';
        if (!st.cands.length) {
          h += '<div class="empty-note">記録にできる内容が見つかりませんでした。</div>' +
            '<div class="btn-row"><button class="btn soft" data-act="totext">文字で入力</button><button class="btn primary" data-act="toidle2">もう一度話す</button></div>';
        } else {
          h += '<div class="cand-list">' + st.cands.map((c, i) => {
            const d = candTitle(c);
            let ed = '<label class="cand-f"><span>時刻</span><input type="datetime-local" data-i="' + i + '" data-f="started" value="' + BA.toLocalInput(c.started) + '"></label>';
            if (c.type === 'formula' || c.type === 'expressed') ed += '<label class="cand-f"><span>量(ml)</span><input type="number" inputmode="decimal" min="0" max="1000" data-i="' + i + '" data-f="amount" value="' + (c.amount == null ? '' : c.amount) + '" placeholder="必須"></label>';
            if (c.type === 'temp') ed += '<label class="cand-f"><span>体温(℃)</span><input type="number" inputmode="decimal" step="0.1" min="30" max="45" data-i="' + i + '" data-f="amount" value="' + (c.amount == null ? '' : c.amount) + '" placeholder="必須"></label>';
            if (c.type === 'med') ed += '<label class="cand-f"><span>薬の名前・量</span><input type="text" maxlength="60" data-i="' + i + '" data-f="medName" value="' + esc(c.medName) + '" placeholder="必須"></label>';
            if (c.type === 'memo') ed += '<label class="cand-f"><span>メモ</span><input type="text" maxlength="500" data-i="' + i + '" data-f="note" value="' + esc(c.note) + '" placeholder="必須"></label>';
            return '<div class="cand">' + '<div class="cand-head">' + BA.ui.iconHtml(c.type) +
              '<div class="cand-t"><b>' + esc(d.title) + '</b>' + (d.sub ? '<small>' + esc(d.sub) + '</small>' : '') + (c.guess ? '<small>' + esc(c.guess) + '</small>' : '') + '</div>' +
              '<button class="icon-btn" data-act="rm" data-i="' + i + '" aria-label="この候補を外す" style="box-shadow:none"><i class="fas fa-xmark"></i></button></div>' +
              '<div class="cand-edit">' + ed + '</div></div>';
          }).join('') + '</div>' +
            '<div class="voice-actions"><div class="error-text" id="sheet-err"></div>' +
            '<div class="btn-row"><button class="btn soft" data-act="toidle2">やり直す</button>' +
            '<button class="btn primary" data-act="saveall">' + st.cands.length + '件を記録する</button></div></div>';
        }
      }
      return h + '</div>';
    }

    function syncFromDom() {
      document.querySelectorAll('#voice-root [data-i][data-f]').forEach((el) => {
        const c = st.cands[Number(el.dataset.i)]; if (!c) return;
        const f = el.dataset.f;
        if (f === 'started') { const v = BA.fromLocalInput(el.value); if (v != null) { const d = (c.ended != null ? c.ended - c.started : null); c.started = v; if (d != null) c.ended = v + d; } }
        else if (f === 'amount') c.amount = el.value === '' ? null : Number(el.value);
        else c[f] = el.value;
      });
    }

    const re = mountSheet('声・文章で記録', '<span class="log-ic" style="background:var(--primary)"><i class="fas fa-microphone"></i></span>', st, render, (re) => {
      async function send(body, ct) {
        st.phase = 'working'; st.err = ''; re();
        try {
          const r = await postParse(body, ct);
          if (!alive()) return;
          BA.ai.remaining = r.remaining;
          st.transcript = r.transcript || ''; st.unclear = r.unclear || '';
          st.cands = (r.entries || []).map(toCand);
          st.phase = 'confirm';
        } catch (e) {
          if (!alive()) return;
          st.err = e.message; st.phase = body instanceof Blob ? 'idle' : 'text';
        }
        re();
      }
      async function start() {
        st.err = '';
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          st.err = (e && e.name === 'NotAllowedError')
            ? 'マイクが許可されていません。端末の設定でマイクを許可するか、文字で入力してください'
            : 'マイクを使えませんでした。文字で入力できます';
          st.phase = 'text'; if (alive()) re(); return;
        }
        if (!alive()) { stream.getTracks().forEach((t) => t.stop()); return; }
        mime = pickMime(); chunks = []; cancelled = false;
        try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch (e) { cleanup(); st.err = '録音を始められませんでした。文字で入力できます'; st.phase = 'text'; re(); return; }
        const my = rec;
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = () => {
          const type = ((my.mimeType || mime || 'audio/webm').split(';')[0]) || 'audio/webm';
          const blob = new Blob(chunks, { type });
          if (stream) stream.getTracks().forEach((t) => t.stop());
          stream = null; rec = null;
          if (cancelled || !alive()) return;
          if (blob.size < 1000) { st.err = '録音が短すぎました。もう一度お試しください'; st.phase = 'idle'; re(); return; }
          if (blob.size > 3 * 1024 * 1024) { st.err = '録音が長すぎます。30秒以内でお試しください'; st.phase = 'idle'; re(); return; }
          send(blob, type);
        };
        rec.start();
        st.phase = 'recording'; st.sec = 0; re();
        const t0 = Date.now();
        timer = setInterval(() => {
          if (!alive()) { cleanup(); return; }
          st.sec = Math.floor((Date.now() - t0) / 1000);
          const el = document.getElementById('voice-sec'); if (el) el.textContent = st.sec;
          if (st.sec >= MAX_SEC) { clearInterval(timer); timer = null; if (rec && rec.state !== 'inactive') rec.stop(); }
        }, 250);
      }
      return {
        rec: start,
        stop() { clearInterval(timer); timer = null; if (rec && rec.state !== 'inactive') rec.stop(); },
        cancelrec() { cleanup(); st.phase = 'idle'; re(); },
        totext() { st.phase = 'text'; st.err = ''; re(); const t = document.getElementById('voice-text'); if (t) t.focus(); },
        toidle() { st.phase = 'idle'; st.err = ''; re(); },
        toidle2() { st.phase = canRecord() ? 'idle' : 'text'; st.err = ''; st.cands = []; re(); },
        sendtext(el) {
          const t = (st.text || '').trim();
          if (!t) { st.err = '文章を入力してください'; re(); return; }
          send(JSON.stringify({ text: t }), 'application/json');
        },
        rm(el) { syncFromDom(); st.cands.splice(Number(el.dataset.i), 1); re(); },
        change() {
          // 再描画すると保存ボタンのクリックが失われることがあるので、見出しだけ更新する
          syncFromDom();
          document.querySelectorAll('#voice-root .cand').forEach((box, i) => {
            const c = st.cands[i]; if (!c) return;
            const d = candTitle(c);
            const t = box.querySelector('.cand-t');
            if (t) t.innerHTML = '<b>' + esc(d.title) + '</b>' + (d.sub ? '<small>' + esc(d.sub) + '</small>' : '') + (c.guess ? '<small>' + esc(c.guess) + '</small>' : '');
          });
        },
        saveall(el) {
          guard(el, async () => {
            syncFromDom();
            const bodies = st.cands.map(candBody); // 入力不足はここで例外にして画面に出す
            let ok = 0;
            const c = BA.child();
            for (const b of bodies) {
              try { await BA.api('POST', '/children/' + c.id + '/logs', b); ok++; }
              catch (e) { if (!ok) throw e; st.cands = st.cands.slice(ok); st.err = (bodies.length - ok) + '件が保存できませんでした: ' + e.message; re(); await BA.refresh({ silent: true }); return; }
            }
            cleanup(); BA._voiceSession = null;
            BA.closeSheet();
            BA.toast(ok + '件を記録しました');
            await BA.refresh();
          });
        }
      };
    });
  };
})();
