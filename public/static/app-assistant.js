/* すくすくログ - assistant: AIアシスタント(記録の逆引き・成長レター) */
(function () {
  'use strict';
  const BA = window.BA;
  const esc = BA.esc;
  const { mountSheet, guard } = BA.ui;

  // 片手でもすぐ聞けるよう、よくある質問をチップにしておく
  const QUICK = [
    { label: '今週の成長レター', icon: 'fa-envelope-open-text', text: '直近1週間の成長レターを書いて' },
    { label: '今日のまとめ', icon: 'fa-sun', text: '今日のお世話の様子をまとめて' },
    { label: '前回のミルク・うんち', icon: 'fa-clock-rotate-left', text: '最後のミルク(授乳)とうんちはいつ?' },
    { label: '最近の睡眠リズム', icon: 'fa-moon', text: 'ここ数日の睡眠リズムを教えて' }
  ];

  async function postChat(childId, text) {
    const headers = { 'Content-Type': 'application/json' };
    if (BA.state.token) headers.Authorization = 'Bearer ' + BA.state.token;
    let res;
    try {
      res = await fetch('/api/ai/chat?tz=' + new Date().getTimezoneOffset(), { method: 'POST', headers, body: JSON.stringify({ childId, text }) });
    } catch (e) { throw new Error('通信できません。電波の良い場所でもう一度お試しください'); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (res.status === 401 && BA.onUnauthorized) BA.onUnauthorized();
    if (!res.ok) throw new Error((data && data.error) || 'うまく答えられませんでした');
    return data;
  }

  BA.openAssistant = function () {
    const child = BA.child();
    if (!child) return;
    const sess = {};
    BA._assistantSession = sess;
    const alive = () => BA._assistantSession === sess && !!document.getElementById('asst-root');
    const st = { messages: null, pending: null, busy: false, text: '', err: '', confirmClear: false };
    const isViewer = BA.isViewer();

    const bubble = (m) => {
      const mine = m.role === 'user';
      let h = '<div class="asst-msg ' + (mine ? 'me' : 'ai') + (m.is_letter ? ' letter' : '') + '">';
      if (m.is_letter) h += '<div class="asst-letter-tag"><i class="fas fa-envelope-open-text"></i> 成長レター</div>';
      h += '<div class="asst-text">' + esc(m.content) + '</div>';
      if (m.is_letter && !isViewer) {
        h += '<div class="asst-actions"><button class="btn soft" data-act="todiary" data-id="' + esc(m.id) + '"><i class="fas fa-book-open"></i>思い出日記に保存</button></div>';
      }
      return h + '</div>';
    };

    function render() {
      let h = '<div id="asst-root">';
      h += '<div class="asst-top"><span class="muted">' + esc(child.name) + 'の記録について聞けます</span>' +
        (st.messages && st.messages.length ? '<button class="asst-clear" data-act="clear">' + (st.confirmClear ? '本当に消す?' : '<i class="fas fa-trash"></i>履歴をクリア') + '</button>' : '') + '</div>';
      h += '<div class="asst-list" id="asst-list" aria-live="polite">';
      if (st.messages === null) {
        h += '<div class="voice-wait" role="status"><i class="fas fa-spinner fa-spin"></i></div>';
      } else if (!st.messages.length && !st.pending) {
        h += '<div class="asst-empty"><i class="fas fa-wand-magic-sparkles"></i><p>「最後のうんちはいつ?」「今日ミルク何ml?」など、記録について気軽に聞いてください。<br>成長レターも書けます。</p></div>';
      } else {
        h += st.messages.map(bubble).join('');
        if (st.pending) {
          h += bubble({ role: 'user', content: st.pending });
          h += '<div class="asst-msg ai typing" role="status"><i class="fas fa-ellipsis fa-beat-fade"></i> 記録を見ています…</div>';
        }
      }
      h += '</div>';
      if (st.err) h += '<div class="notice warn" role="alert">' + esc(st.err) + '</div>';
      h += '<div class="asst-chips">' + QUICK.map((q, i) =>
        '<button class="asst-chip" data-act="quick" data-i="' + i + '"' + (st.busy ? ' disabled' : '') + '><i class="fas ' + q.icon + '"></i>' + esc(q.label) + '</button>'
      ).join('') + '</div>';
      h += '<div class="asst-input"><textarea id="asst-text" data-bind="text" rows="2" maxlength="500" placeholder="記録について質問する"' + (st.busy ? ' disabled' : '') + '>' + esc(st.text) + '</textarea>' +
        '<button class="asst-send" data-act="send" aria-label="送信"' + (st.busy ? ' disabled' : '') + '><i class="fas fa-paper-plane"></i></button></div>';
      h += '<p class="muted voice-note"><i class="fas fa-shield-halved"></i> 質問と記録の要約をGoogleのAIに送って答えます。履歴はあなただけが見られます(直近50件)。医療的な判断はしません。心配なときは医療機関や#8000へ。</p>';
      return h + '</div>';
    }

    const scrollBottom = () => {
      const b = document.getElementById('sheet-body');
      const list = document.getElementById('asst-list');
      if (list) list.scrollTop = list.scrollHeight;
      if (b && list) b.scrollTop = Math.max(0, list.offsetTop - 8);
    };

    const re = mountSheet('AIアシスタント', '<span class="log-ic" style="background:var(--primary)"><i class="fas fa-wand-magic-sparkles"></i></span>', st, render, (re) => {
      const rerender = () => { re(); scrollBottom(); };
      async function ask(text) {
        text = (text || '').trim();
        if (!text || st.busy) return;
        st.busy = true; st.err = ''; st.pending = text; st.text = ''; st.confirmClear = false;
        rerender();
        try {
          const r = await postChat(child.id, text);
          if (!alive()) return;
          st.messages = (st.messages || []).concat(r.messages || []).slice(-50);
        } catch (e) {
          if (!alive()) return;
          st.err = e.message; st.text = text; // 失敗したら入力を戻す
        }
        st.pending = null; st.busy = false;
        rerender();
      }
      return {
        send() { ask(st.text); },
        quick(el) { const q = QUICK[Number(el.dataset.i)]; if (q) ask(q.text); },
        clear(el) {
          if (!st.confirmClear) { st.confirmClear = true; re(); return; }
          guard(el, async () => {
            await BA.api('DELETE', '/ai/chat');
            st.messages = []; st.confirmClear = false; st.err = '';
            re();
            BA.toast('履歴を消しました');
          });
        },
        todiary(el) {
          const m = (st.messages || []).find((x) => x.id === el.dataset.id);
          if (!m) return;
          BA._assistantSession = null;
          BA.openDiary(null, { body: m.content.slice(0, 2000) });
        }
      };
    });

    BA.api('GET', '/ai/chat?child=' + encodeURIComponent(child.id))
      .then((r) => { if (!alive()) return; st.messages = r.messages || []; re(); scrollBottom(); })
      .catch((e) => { if (!alive()) return; st.messages = []; st.err = e.message; re(); });
  };
})();
