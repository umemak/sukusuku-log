/* すくすくログ - views: 画面の描画 */
(function () {
  'use strict';
  const BA = window.BA;
  const esc = BA.esc;
  const V = (BA.views = {});

  // ---------- 共通部品 ----------
  const icon = (type, size) => {
    const t = BA.TYPES[type];
    return '<span class="log-ic" style="background:' + t.color + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '"><i class="fas ' + t.icon + '"></i></span>';
  };

  const POOP = { hard: 'かため', normal: 'ふつう', soft: 'やわらかい', watery: '水っぽい' };

  // 記録1件のタイトルと補足
  function describe(raw) {
    const l = raw.d ? raw : BA.parseLog(raw);
    const t = BA.TYPES[l.type];
    let title = t.label, sub = [];
    if (l.type === 'breast') {
      const side = l.d.side ? BA.SIDE[l.d.side] : '';
      if (l.ended_at == null) title += '(計測中)';
      else title += ' ' + BA.fmtDur(l.ended_at - l.started_at);
      if (side) sub.push(side);
    } else if (l.type === 'formula' || l.type === 'expressed') {
      title += ' ' + (l.amount || 0) + 'ml';
    } else if (l.type === 'sleep') {
      title += l.ended_at == null ? '(ねんね中)' : ' ' + BA.fmtDur(l.ended_at - l.started_at);
    } else if (l.type === 'poop') {
      if (l.d.kind) sub.push(POOP[l.d.kind] || '');
    } else if (l.type === 'temp') {
      title += ' ' + Number(l.amount).toFixed(1) + '℃';
    } else if (l.type === 'med') {
      if (l.d.name) sub.push(l.d.name);
    } else if (l.type === 'memo') {
      title = l.note ? l.note : 'メモ';
    }
    if (l.type !== 'memo' && l.note) sub.push(l.note);
    const who = BA.memberName(l.member_id);
    if (who) sub.push(who);
    return { title, sub: sub.filter(Boolean).join(' ・ ') };
  }

  function logRow(raw) {
    const l = BA.parseLog(raw);
    const d = describe(l);
    let time = BA.clock(l.started_at);
    if (l.type === 'sleep' && l.ended_at != null) time += '–' + BA.clock(l.ended_at);
    return '<button class="log-row" data-act="editlog" data-id="' + l.id + '">' + icon(l.type) +
      '<span class="log-main"><span class="log-title">' + esc(d.title) + '</span><br><span class="log-sub">' + esc(d.sub) + '</span></span>' +
      '<span class="log-time">' + time + '</span></button>';
  }

  function header() {
    const c = BA.child();
    return '<header class="app-header">' +
      '<button class="child-chip" data-act="switchchild" aria-label="お子さんを切り替える">' +
      '<span class="avatar"><i class="fas fa-baby"></i></span>' +
      '<span class="names"><span class="nm">' + esc(c ? c.name : '') + '</span><br><span class="age">' + esc(c ? BA.ageText(c.birthday) : '') + '</span></span>' +
      '<i class="fas fa-chevron-down" style="margin-left:auto;color:var(--sub)"></i></button>' +
      '<button class="icon-btn" data-act="refresh" aria-label="更新"><i class="fas fa-rotate"></i></button></header>';
  }

  V.tabbar = function () {
    const tabs = [
      ['home', 'fa-house', 'ホーム'],
      ['timeline', 'fa-list-ul', '記録'],
      ['stats', 'fa-chart-column', 'まとめ'],
      ['health', 'fa-heart-pulse', '健康'],
      ['memory', 'fa-camera-retro', '思い出'],
      ['family', 'fa-people-roof', '家族']
    ];
    return '<nav class="tabbar" aria-label="メニュー">' + tabs.map((t) =>
      '<button data-act="tab" data-tab="' + t[0] + '"' + (BA.state.tab === t[0] ? ' aria-current="page"' : '') + '><i class="fas ' + t[1] + '"></i>' + t[2] + '</button>'
    ).join('') + '</nav>';
  };

  V.header = header;

  V.loading = function () {
    return header() + '<main id="view"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></main>' + V.tabbar();
  };

  // ---------- オンボーディング ----------
  V.onboard = function (prefill) {
    const code = prefill || '';
    const mode = BA.state.obMode || (code ? 'join' : 'choose');
    const head = '<div class="logo"><i class="fas fa-baby"></i></div><h1>すくすくログ</h1>';
    const back = '<button class="link-btn ob-back" data-act="ob-go" data-mode="choose"><i class="fas fa-arrow-left"></i> 最初の画面に戻る</button>';
    const foot = '<p class="disclaimer">ログイン不要です。この端末にだけ保存される鍵で家族のデータにアクセスします。ブラウザのデータを消すと再度招待コードでの参加が必要です。記録内容は医療的な診断ではありません。</p>';

    if (mode === 'join') {
      return '<div class="onboard">' + back + head +
        '<p class="lead">招待コードで参加します</p>' +
        '<div class="card">' +
        '<label class="field"><span>1. 招待コード(8文字)</span><input type="text" id="ob-code" maxlength="12" value="' + esc(code) + '" placeholder="例: K7M2QX9A" autocapitalize="characters" autocomplete="off" style="letter-spacing:.12em;font-weight:700"></label>' +
        '<label class="field"><span>2. あなたの呼び名(表示名)</span><input type="text" id="ob-name" maxlength="30" placeholder="例: パパ、ママ、おじいちゃん" autocomplete="nickname"></label>' +
        '<div class="notice"><i class="fas fa-clock"></i> 招待コードは<b>24時間有効・1回限り</b>使えます。<br><i class="fas fa-desktop"></i> すでに参加している人がスマホやPCなど<b>別の端末を追加する</b>ときは、前と<b>同じ呼び名</b>を入れてください。同じ人として使えます（端末ごとに追加用の新しい招待コードが必要です）。</div>' +
        '<div class="error-text" id="ob-err"></div>' +
        '<button class="btn primary block" data-act="ob-join"><i class="fas fa-right-to-bracket"></i>この家族に参加する</button></div>' +
        foot + '</div>';
    }
    if (mode === 'create') {
      const isCodeStep = BA.state.obStep === 'code';
      const email = BA.state.obEmail || '';
      return '<div class="onboard">' + back + head +
        '<p class="lead">新しい家族を作ります</p>' +
        '<div class="notice warn"><i class="fas fa-triangle-exclamation"></i> パートナーや家族がすでに使い始めている場合は、ここでは作らず、<button class="link-btn" data-act="ob-go" data-mode="join" style="display:inline;min-height:0;padding:0">「招待コードをもらっている」</button>から参加してください。</div>' +
        '<div class="card">' +
        (isCodeStep
          ? '<div class="notice" style="border-left-color:var(--primary);margin-bottom:12px"><i class="fas fa-envelope-open-text" style="color:var(--primary)"></i> <b>' + esc(email) + '</b> に6桁の認証コードを送信しました。(有効期限10分)</div>' +
            '<label class="field"><span>1. 認証コード(数字6桁)</span><input type="text" id="ob-vcode" inputmode="numeric" maxlength="6" placeholder="例: 123456" autocapitalize="off" autocomplete="one-time-code" style="letter-spacing:.25em;font-size:20px;font-weight:700;text-align:center"></label>' +
            '<label class="field"><span>2. あなたの呼び名(表示名)</span><input type="text" id="ob-name" maxlength="30" placeholder="例: ママ、パパ" autocomplete="nickname"></label>' +
            '<div class="error-text" id="ob-err"></div>' +
            '<button class="btn primary block" data-act="ob-create"><i class="fas fa-plus"></i>家族を作成する</button>' +
            '<div style="display:flex;justify-content:space-between;margin-top:12px;font-size:13px">' +
            '<button class="link-btn" data-act="ob-resendemail" style="font-size:12px"><i class="fas fa-rotate-right"></i> コードを再送信</button>' +
            '<button class="link-btn" data-act="ob-changeemail" style="font-size:12px"><i class="fas fa-pen"></i> メールアドレス変更</button></div>'
          : '<label class="field"><span>メールアドレス</span><input type="email" id="ob-email" maxlength="100" value="' + esc(email) + '" placeholder="例: name@example.com" autocomplete="email"></label>' +
            '<p class="muted" style="margin:0 0 12px;font-size:12px"><i class="fas fa-shield-halved"></i> 認証コードを受信するためのメールアドレスを入力してください。</p>' +
            '<div class="error-text" id="ob-err"></div>' +
            '<button class="btn primary block" data-act="ob-sendcode"><i class="fas fa-paper-plane"></i>認証コードを送信</button>'
        ) +
        '</div>' +
        foot + '</div>';
    }
    return '<div class="onboard">' + head +
      '<p class="lead">新生児からの育児記録を、<br>パパ・ママ・家族みんなで共有。</p>' +
      '<ul class="feature-list card">' +
      '<li><i class="fas fa-hand-pointer"></i><span>授乳・睡眠・おむつをワンタップで記録</span></li>' +
      '<li><i class="fas fa-people-roof"></i><span>専用の招待コードで安全に家族共有</span></li>' +
      '<li><i class="fas fa-chart-line"></i><span>1日・1週間のまとめと成長グラフ</span></li>' +
      '<li><i class="fas fa-syringe"></i><span>予防接種の時期を自動で計算</span></li></ul>' +
      '<h2 class="ob-q">どちらですか?</h2>' +
      '<button class="ob-choice" data-act="ob-go" data-mode="join"><span class="ob-ic"><i class="fas fa-key"></i></span>' +
      '<span class="ob-tx"><b>招待コードをもらっている</b><small>パートナーや家族から招待された / 別の端末を追加する</small></span><i class="fas fa-chevron-right ob-ar"></i></button>' +
      '<button class="ob-choice" data-act="ob-go" data-mode="create"><span class="ob-ic"><i class="fas fa-plus"></i></span>' +
      '<span class="ob-tx"><b>はじめて使う</b><small>家族の中で最初の1人。新しく家族を作る</small></span><i class="fas fa-chevron-right ob-ar"></i></button>' +
      foot + '</div>';
  };

  V.noChild = function () {
    if (BA.isViewer()) {
      return '<div class="onboard"><div class="logo"><i class="fas fa-baby"></i></div><h1>お子さんがまだ登録されていません</h1>' +
        '<p class="lead">家族がお子さんの情報を登録すると、ここに育児記録が表示されます。登録されるまでお待ちください。</p>' +
        '<button class="btn block" data-act="refresh"><i class="fas fa-rotate"></i> 最新の状態を確認する</button>' +
        '<button class="link-btn" data-act="logout" style="margin-top:14px"><i class="fas fa-right-from-bracket"></i> 連携を解除して戻る</button></div>';
    }
    return '<div class="onboard"><div class="logo"><i class="fas fa-baby"></i></div><h1>お子さんを登録しましょう</h1>' +
      '<p class="lead">生年月日から月齢と予防接種の時期を計算します。</p>' +
      '<button class="btn primary block" data-act="addchild"><i class="fas fa-plus"></i>お子さんを登録する</button>' +
      '<button class="link-btn" data-act="backstart" style="margin-top:14px"><i class="fas fa-arrow-left"></i> 最初の画面に戻る(まちがえたとき)</button></div>';
  };

  // ---------- ホーム ----------
  V.home = function () {
    const isViewer = BA.isViewer();
    const logs = (BA.data.logs || []).map(BA.parseLog);
    const last = BA.data.last || {};
    const now = Date.now();
    const ds = BA.dayStart(now);
    const running = logs.filter((l) => l.ended_at == null && (l.type === 'sleep' || l.type === 'breast'));
    const sleeping = running.find((l) => l.type === 'sleep');

    // 最後の授乳(母乳・ミルク・搾母乳のうち最新)
    let lastFeed = null;
    BA.FEED_TYPES.forEach((k) => { if (last[k] && (!lastFeed || last[k].started_at > lastFeed.started_at)) lastFeed = last[k]; });
    const feedBox = lastFeed
      ? '<div class="big" data-ago="' + lastFeed.started_at + '">' + BA.fmtAgo(lastFeed.started_at) + '</div><div class="sub">' + esc(describe(lastFeed).title.replace('(計測中)', '')) + ' ' + BA.clock(lastFeed.started_at) + '</div>'
      : '<div class="big">—</div><div class="sub">まだ記録なし</div>';

    let sleepBox;
    if (sleeping) {
      sleepBox = '<div class="big" data-timer="' + sleeping.started_at + '">' + BA.fmtTimer(now - sleeping.started_at) + '</div><div class="sub">ねんね中(' + BA.clock(sleeping.started_at) + '〜)</div>';
    } else if (last.sleep && last.sleep.ended_at) {
      sleepBox = '<div class="big" data-ago="' + last.sleep.ended_at + '">' + BA.fmtAgo(last.sleep.ended_at) + '</div><div class="sub">起きた時刻 ' + BA.clock(last.sleep.ended_at) + '</div>';
    } else {
      sleepBox = '<div class="big">—</div><div class="sub">まだ記録なし</div>';
    }
    const simple = (type) => last[type]
      ? '<div class="big" data-ago="' + last[type].started_at + '">' + BA.fmtAgo(last[type].started_at) + '</div><div class="sub">' + BA.clock(last[type].started_at) + '</div>'
      : '<div class="big">—</div><div class="sub">まだ記録なし</div>';

    const timers = running.map((l) => {
      const t = BA.TYPES[l.type];
      return '<div class="timer-card">' + icon(l.type) +
        '<div class="tc-body"><div class="tc-title">' + (l.type === 'sleep' ? 'ねんね中' : '授乳中(' + (BA.SIDE[l.d.side] || '') + ')') + '</div>' +
        '<div class="tc-time" data-timer="' + l.started_at + '">' + BA.fmtTimer(now - l.started_at) + '</div></div>' +
        (isViewer ? '' : '<button class="btn primary" data-act="stoptimer" data-id="' + l.id + '"><i class="fas fa-stop"></i>' + (l.type === 'sleep' ? '起きた' : '終了') + '</button>' +
          '<button class="icon-btn" data-act="canceltimer" data-id="' + l.id + '" aria-label="破棄" style="box-shadow:none"><i class="fas fa-xmark"></i></button>') + '</div>';
    }).join('');

    const s = BA.summarize(logs, ds, ds + BA.DAY);
    const todays = logs.filter((l) => l.started_at >= ds).slice(0, 6);

    const q = (type, label, big) => {
      const t = BA.TYPES[type];
      return '<button class="qbtn" data-act="' + (big ? 'open' : 'quick') + '" data-type="' + type + '"><span class="qi" style="background:' + t.color + '"><i class="fas ' + t.icon + '"></i></span>' + label + '</button>';
    };

    const lb = last.breast ? BA.parseLog(last.breast) : null;
    const sideHint = lb && lb.d.side && lb.d.side !== 'both'
      ? '<p class="muted" style="margin-top:10px"><i class="fas fa-lightbulb" style="color:var(--warn)"></i> 前回の母乳は' + BA.SIDE[lb.d.side] + '。次は' + (lb.d.side === 'left' ? '右' : '左') + 'からがおすすめです。</p>' : '';

    const quickCard = isViewer ? '' :
      '<section class="card" aria-label="かんたん記録"><h2><i class="fas fa-bolt" style="color:var(--warn)"></i>ワンタップ記録</h2>' +
      '<div class="quick-main">' + q('breast', '母乳', true) + q('formula', 'ミルク', true) +
      '<button class="qbtn" data-act="sleep" data-active="' + !!sleeping + '"><span class="qi" style="background:' + BA.TYPES.sleep.color + '"><i class="fas ' + (sleeping ? 'fa-sun' : 'fa-moon') + '"></i></span>' + (sleeping ? '起きた' : 'ねんね') + '</button></div>' +
      '<div class="quick-sub">' + q('pee', 'おしっこ') + q('poop', 'うんち') + q('temp', '体温', true) +
      '<button class="qbtn" data-act="more"><span class="qi" style="background:var(--sub)"><i class="fas fa-ellipsis"></i></span>その他</button></div>' +
      (BA.ai && BA.ai.enabled ? '<button class="voice-btn" data-act="voice"><i class="fas fa-microphone"></i>声・文章でまとめて記録</button>' : '') + sideHint + '</section>';

    const viewerNotice = isViewer ? '<div class="notice" style="margin-bottom:12px;color:var(--sub)"><i class="fas fa-eye"></i> 閲覧専用モードです（記録の追加・編集はできません）</div>' : '';

    return header() + '<main id="view">' +
      viewerNotice +
      '<section aria-label="前回からの経過"><div class="since-grid">' +
      '<div class="since"><div class="lbl"><i class="fas fa-bottle-water"></i>最後の授乳</div>' + feedBox + '</div>' +
      '<div class="since"><div class="lbl"><i class="fas fa-moon"></i>睡眠</div>' + sleepBox + '</div>' +
      '<div class="since"><div class="lbl"><i class="fas fa-droplet"></i>おしっこ</div>' + simple('pee') + '</div>' +
      '<div class="since"><div class="lbl"><i class="fas fa-poop"></i>うんち</div>' + simple('poop') + '</div></div></section>' +
      (timers ? '<section aria-label="計測中">' + timers + '</section>' : '') +
      (V.subsidyHint ? V.subsidyHint() : '') +
      quickCard +
      (BA.ai && BA.ai.enabled ? '<button class="asst-open" data-act="assistant"><span class="qi"><i class="fas fa-wand-magic-sparkles"></i></span><span class="asst-open-t"><b>AIアシスタントに聞く</b><small>「最後のうんちは?」・成長レター</small></span><i class="fas fa-chevron-right"></i></button>' : '') +
      '<section class="card" aria-label="今日のまとめ"><h2><i class="fas fa-calendar-day" style="color:var(--primary)"></i>今日のまとめ</h2>' +
      '<div class="today-stats">' +
      '<div><div class="n">' + s.feed + '<small>回</small></div><div class="l">授乳</div></div>' +
      '<div><div class="n">' + s.ml + '<small>ml</small></div><div class="l">ミルク等</div></div>' +
      '<div><div class="n">' + (s.sleepMs ? (s.sleepMs / 3600000).toFixed(1) : 0) + '<small>h</small></div><div class="l">睡眠</div></div>' +
      '<div><div class="n">' + s.pee + '<small>回</small></div><div class="l">おしっこ</div></div>' +
      '<div><div class="n">' + s.poop + '<small>回</small></div><div class="l">うんち</div></div></div></section>' +
      '<section class="card" aria-label="最近の記録"><h2><i class="fas fa-clock-rotate-left" style="color:var(--primary)"></i>今日の記録</h2>' +
      (todays.length ? '<div class="log-list">' + todays.map(logRow).join('') + '</div><button class="link-btn" data-act="tab" data-tab="timeline" style="margin-top:6px">すべて見る →</button>'
        : '<div class="empty">' + (isViewer ? 'まだ今日の記録はありません。' : 'まだ今日の記録はありません。<br>上のボタンから記録してみましょう。') + '</div>') + '</section>' +
      '</main>' + V.tabbar();
  };

  // ---------- 記録(タイムライン) ----------
  V.timeline = function () {
    const isViewer = BA.isViewer();
    const logs = (BA.data.logs || []).map(BA.parseLog);
    const ds = BA.dayStart(Date.now()) + BA.state.dayOffset * BA.DAY;
    const de = ds + BA.DAY;
    const shown = logs.filter((l) => l.started_at >= ds && l.started_at < de);
    const s = BA.summarize(logs, ds, de);
    const label = BA.state.dayOffset === 0 ? '今日' : BA.state.dayOffset === -1 ? '昨日' : '';
    return header() + '<main id="view">' +
      '<section class="day-nav"><button class="icon-btn" data-act="day" data-d="-1" aria-label="前の日"><i class="fas fa-chevron-left"></i></button>' +
      '<div class="day-label">' + BA.dayLabel(ds) + (label ? ' <span class="muted">' + label + '</span>' : '') + '</div>' +
      '<button class="icon-btn" data-act="day" data-d="1" aria-label="次の日"' + (BA.state.dayOffset >= 0 ? ' disabled style="opacity:.35"' : '') + '><i class="fas fa-chevron-right"></i></button></section>' +
      '<section class="card"><div class="today-stats">' +
      '<div><div class="n">' + s.feed + '<small>回</small></div><div class="l">授乳</div></div>' +
      '<div><div class="n">' + s.ml + '<small>ml</small></div><div class="l">ミルク等</div></div>' +
      '<div><div class="n">' + (s.sleepMs ? (s.sleepMs / 3600000).toFixed(1) : 0) + '<small>h</small></div><div class="l">睡眠</div></div>' +
      '<div><div class="n">' + s.pee + '<small>回</small></div><div class="l">おしっこ</div></div>' +
      '<div><div class="n">' + s.poop + '<small>回</small></div><div class="l">うんち</div></div></div></section>' +
      '<section class="card" aria-label="記録一覧">' +
      (shown.length ? '<div class="log-list">' + shown.map(logRow).join('') + '</div>' : '<div class="empty">この日の記録はありません</div>') +
      '</section></main>' +
      (isViewer ? '' : '<button class="fab" data-act="more"><i class="fas fa-plus"></i>記録を追加</button>') + V.tabbar();
  };

  // ---------- まとめ ----------
  V.stats = function () {
    const n = BA.state.statDays;
    const logs = (BA.data.logs || []).map(BA.parseLog);
    const today = BA.dayStart(Date.now());
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const ds = today - i * BA.DAY;
      days.push(Object.assign({ ds }, BA.summarize(logs, ds, ds + BA.DAY)));
    }
    BA.data.statDaysData = days;
    // 記録のある日だけで平均(今日は途中なので、記録のある過去日を優先)
    const past = days.slice(0, -1).filter((d) => d.feed || d.sleepMs || d.pee || d.poop);
    const base = past.length ? past : days.filter((d) => d.feed || d.sleepMs || d.pee || d.poop);
    const avg = (f) => (base.length ? base.reduce((a, d) => a + f(d), 0) / base.length : 0);
    return header() + '<main id="view">' +
      '<section class="seg" aria-label="期間">' +
      [7, 14, 30].map((d) => '<button data-act="statdays" data-d="' + d + '" aria-pressed="' + (n === d) + '">' + d + '日間</button>').join('') + '</section>' +
      '<section class="card"><h2><i class="fas fa-gauge" style="color:var(--primary)"></i>1日あたりの平均<small class="muted">(' + (past.length ? '今日を除く' : '今日') + '・' + base.length + '日分)</small></h2>' +
      (base.length ? '<div class="avg-grid">' +
        '<div><div class="n">' + avg((d) => d.feed).toFixed(1) + '<small>回</small></div><div class="l">授乳</div></div>' +
        '<div><div class="n">' + Math.round(avg((d) => d.ml)) + '<small>ml</small></div><div class="l">ミルク等</div></div>' +
        '<div><div class="n">' + (avg((d) => d.sleepMs) / 3600000).toFixed(1) + '<small>h</small></div><div class="l">睡眠</div></div>' +
        '<div><div class="n">' + avg((d) => d.pee).toFixed(1) + '<small>回</small></div><div class="l">おしっこ</div></div>' +
        '<div><div class="n">' + avg((d) => d.poop).toFixed(1) + '<small>回</small></div><div class="l">うんち</div></div></div>'
        : '<div class="empty">記録がたまるとここに平均が表示されます</div>') + '</section>' +
      (V.workload ? V.workload(logs, today - (n - 1) * BA.DAY) : '') +
      '<section class="card"><h2><i class="fas fa-moon" style="color:' + BA.TYPES.sleep.color + '"></i>睡眠時間(時間)</h2><div class="chart-box"><canvas id="ch-sleep" aria-label="睡眠時間のグラフ"></canvas></div></section>' +
      '<section class="card"><h2><i class="fas fa-bottle-water" style="color:' + BA.TYPES.formula.color + '"></i>授乳回数・ミルク量</h2><div class="chart-box"><canvas id="ch-feed" aria-label="授乳のグラフ"></canvas></div></section>' +
      '<section class="card"><h2><i class="fas fa-droplet" style="color:' + BA.TYPES.pee.color + '"></i>おむつ(おしっこ・うんち)</h2><div class="chart-box"><canvas id="ch-diaper" aria-label="おむつのグラフ"></canvas></div></section>' +
      '</main>' + V.tabbar();
  };

  V.drawStats = function () {
    if (typeof Chart === 'undefined') return;
    BA.destroyCharts();
    const days = BA.data.statDaysData || [];
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--sub').trim();
    const grid = css.getPropertyValue('--line').trim();
    const labels = days.map((d) => BA.mdLabel(d.ds));
    const common = (extra) => Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false, labels: { color: text } } },
      scales: {
        x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true }
      }
    }, extra || {});
    const mk = (id, cfg) => { const el = document.getElementById(id); if (el) BA.charts.push(new Chart(el, cfg)); };
    mk('ch-sleep', { type: 'bar', data: { labels, datasets: [{ label: '睡眠(h)', data: days.map((d) => +(d.sleepMs / 3600000).toFixed(1)), backgroundColor: BA.TYPES.sleep.color, borderRadius: 6 }] }, options: common() });
    mk('ch-feed', {
      data: {
        labels, datasets: [
          { type: 'bar', label: '授乳回数', data: days.map((d) => d.feed), backgroundColor: BA.TYPES.breast.color, borderRadius: 6, yAxisID: 'y' },
          { type: 'line', label: 'ミルク等(ml)', data: days.map((d) => d.ml), borderColor: BA.TYPES.formula.color, backgroundColor: BA.TYPES.formula.color, tension: 0.3, yAxisID: 'y1' }
        ]
      },
      options: common({
        plugins: { legend: { display: true, labels: { color: text } } },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true, position: 'left' },
          y1: { ticks: { color: text }, grid: { display: false }, beginAtZero: true, position: 'right' }
        }
      })
    });
    mk('ch-diaper', {
      type: 'bar',
      data: {
        labels, datasets: [
          { label: 'おしっこ', data: days.map((d) => d.pee), backgroundColor: BA.TYPES.pee.color, borderRadius: 4 },
          { label: 'うんち', data: days.map((d) => d.poop), backgroundColor: BA.TYPES.poop.color, borderRadius: 4 }
        ]
      },
      options: common({ plugins: { legend: { display: true, labels: { color: text } } } })
    });
  };

  // ---------- 健康(成長 / 予防接種) ----------
  V.health = function () {
    const tab = BA.state.healthTab;
    const seg = '<section class="seg">' +
      '<button data-act="healthtab" data-t="growth" aria-pressed="' + (tab === 'growth') + '"><i class="fas fa-ruler-vertical"></i> 成長</button>' +
      '<button data-act="healthtab" data-t="vaccine" aria-pressed="' + (tab === 'vaccine') + '"><i class="fas fa-syringe"></i> 予防接種</button>' +
      '<button data-act="healthtab" data-t="food" aria-pressed="' + (tab === 'food') + '"><i class="fas fa-bowl-rice"></i> 離乳食</button>' +
      '<button data-act="healthtab" data-t="subsidy" aria-pressed="' + (tab === 'subsidy') + '"><i class="fas fa-hand-holding-heart"></i> 補助</button></section>';
    const body = tab === 'growth' ? growthBody() : tab === 'vaccine' ? vaccineBody() : tab === 'subsidy' ? V.subsidyBody() : V.foodBody();
    if (tab === 'subsidy') return header() + '<main id="view">' + seg + body + '</main>' + V.tabbar();
    const report = '<section class="card"><button class="btn block" data-act="report"><i class="fas fa-file-medical"></i>受診用まとめを作る(印刷・PDF)</button>' +
      '<p class="muted" style="margin-top:8px">直近の授乳・睡眠・体温・薬・成長などを1枚にまとめます。</p></section>';
    return header() + '<main id="view">' + seg + body + report + '</main>' + V.tabbar();
  };

  function growthBody() {
    const isViewer = BA.isViewer();
    const g = BA.data.growth || [];
    const metric = BA.state.growthMetric;
    const lastG = g.slice(-1)[0];
    const ch = BA.child();
    const pc = (ind, r, v) => {
      if (v == null) return '';
      const p = BA.percentile(ind, ch.gender, BA.daysOld(ch.birthday, r.measured_on), v);
      return p == null ? '' : ' <span class="pct">' + (p < 1 ? '&lt;1' : p > 99 ? '&gt;99' : p.toFixed(0)) + '%ile</span>';
    };
    const noSex = ch.gender !== 'boy' && ch.gender !== 'girl';
    const list = g.slice().reverse().map((r) =>
      '<div class="log-row" style="cursor:default"><span class="log-main"><span class="log-title">' + esc(r.measured_on) + '</span><br><span class="log-sub">' +
      [r.weight_g != null ? '体重 ' + r.weight_g.toLocaleString() + 'g' + pc('wfa', r, r.weight_g / 1000) : '', r.height_cm != null ? '身長 ' + r.height_cm + 'cm' + pc('lhfa', r, r.height_cm) : '', r.head_cm != null ? '頭囲 ' + r.head_cm + 'cm' + pc('hcfa', r, r.head_cm) : '', esc(r.note || '')].filter(Boolean).join(' ・ ') +
      '</span></span>' + (isViewer ? '' : '<button class="icon-btn" data-act="delgrowth" data-id="' + r.id + '" aria-label="削除" style="box-shadow:none"><i class="fas fa-trash" style="color:var(--sub)"></i></button>') + '</div>').join('');
    return '<section class="card"><h2><i class="fas fa-seedling" style="color:var(--ok)"></i>成長の記録</h2>' +
      (lastG ? '<div class="avg-grid" style="margin-bottom:12px">' +
        '<div><div class="n">' + (lastG.weight_g != null ? (lastG.weight_g / 1000).toFixed(2) + '<small>kg</small>' : '—') + '</div><div class="l">最新の体重' + pc('wfa', lastG, lastG.weight_g != null ? lastG.weight_g / 1000 : null) + '</div></div>' +
        '<div><div class="n">' + (lastG.height_cm != null ? lastG.height_cm + '<small>cm</small>' : '—') + '</div><div class="l">最新の身長' + pc('lhfa', lastG, lastG.height_cm) + '</div></div>' +
        '<div><div class="n">' + (lastG.head_cm != null ? lastG.head_cm + '<small>cm</small>' : '—') + '</div><div class="l">最新の頭囲' + pc('hcfa', lastG, lastG.head_cm) + '</div></div></div>' : '') +
      '<div class="seg" style="margin-bottom:12px">' +
      [['weight', '体重'], ['height', '身長'], ['head', '頭囲']].map((m) => '<button data-act="gmetric" data-m="' + m[0] + '" aria-pressed="' + (metric === m[0]) + '">' + m[1] + '</button>').join('') + '</div>' +
      (g.length >= 1 ? '<div class="chart-box" style="height:280px"><canvas id="ch-growth" aria-label="成長グラフ"></canvas></div>' + (noSex ? '<p class="legend-note">お子さんの性別を設定(編集)すると、WHO基準の成長曲線とパーセンタイルが表示されます。</p>' : '<p class="legend-note">点線は WHO 成長基準の目安(下から -2SD / 中央値 / +2SD。おおよそ 3・50・97 パーセンタイル)です。</p>') : '<div class="empty">まだ記録がありません。<br>出生時や健診の測定値を記録しましょう。</div>') +
      (isViewer ? '' : '<button class="btn primary block" data-act="addgrowth" style="margin-top:12px"><i class="fas fa-plus"></i>成長を記録する</button>') + '</section>' +
      (g.length ? '<section class="card"><h2>記録の履歴</h2><div class="log-list">' + list + '</div></section>' : '') +
      '<p class="disclaimer">成長の目安は個人差が大きいものです。パーセンタイルは WHO Child Growth Standards(2006)に基づく参考値で、日本の母子健康手帳(乳幼児身体発育曲線)とは基準が異なります。早産の場合は修正月齢で見ます。母子健康手帳の成長曲線とあわせて、健診で医師・保健師に相談してください。</p>';
  }

  V.drawGrowth = function () {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById('ch-growth');
    if (!el) return;
    BA.destroyCharts();
    const c = BA.child();
    const b = BA.parseYMD(c.birthday);
    const m = BA.state.growthMetric;
    const key = { weight: 'weight_g', height: 'height_cm', head: 'head_cm' }[m];
    const pts = (BA.data.growth || []).filter((r) => r[key] != null).map((r) => ({
      x: +((BA.parseYMD(r.measured_on) - b) / BA.DAY / 30.44).toFixed(2),
      y: m === 'weight' ? +(r[key] / 1000).toFixed(2) : r[key]
    }));
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--sub').trim();
    const grid = css.getPropertyValue('--line').trim();
    const color = css.getPropertyValue('--primary').trim();
    const unit = m === 'weight' ? 'kg' : 'cm';
    const ind = { weight: 'wfa', height: 'lhfa', head: 'hcfa' }[m];
    const curves = [];
    if (c.gender === 'boy' || c.gender === 'girl') {
      const maxDays = Math.min(1856, Math.max(365, ...pts.map((p) => p.x * 30.44 + 120), 0));
      [[-2, '-2SD'], [0, '中央値'], [2, '+2SD']].forEach((zz) => {
        const data = [];
        for (let dd = 0; dd <= maxDays; dd += 14) {
          const lp = BA.lms(ind, c.gender, dd);
          if (!lp) break;
          const v = BA.valueAtZ(zz[0], lp);
          data.push({ x: +(dd / 30.44).toFixed(2), y: m === 'weight' ? +v.toFixed(3) : +v.toFixed(1) });
        }
        curves.push({ label: zz[1], data, borderColor: text, borderDash: zz[0] === 0 ? [2, 3] : [6, 4], borderWidth: zz[0] === 0 ? 1.6 : 1.1, pointRadius: 0, fill: false, tension: 0.2, order: 5 });
      });
    }
    BA.charts.push(new Chart(el, {
      type: 'line',
      data: { datasets: curves.concat([{ label: { weight: '体重', height: '身長', head: '頭囲' }[m] + '(' + unit + ')', data: pts, borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: 5, order: 1 }]) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { type: 'linear', title: { display: true, text: '月齢(か月)', color: text }, ticks: { color: text }, grid: { color: grid }, min: 0 },
          y: { title: { display: true, text: unit, color: text }, ticks: { color: text }, grid: { color: grid } }
        }
      }
    }));
  };

  function vaccineBody() {
    const c = BA.child();
    const rows = BA.vaccineRows(c, BA.data.vacs);
    const badge = (r) => {
      if (r.status === 'done') return '<span class="badge now">済 ' + esc(r.doneOn.slice(5).replace('-', '/')) + '</span>';
      if (r.status === 'late') return '<span class="badge late">時期を過ぎました</span>';
      if (r.status === 'now') return '<span class="badge now">接種時期</span>';
      if (r.status === 'soon') return '<span class="badge">もうすぐ</span>';
      return '';
    };
    const row = (r) => {
      const range = BA.ymd(r.startDate.getTime()).replace(/-/g, '/') + ' 〜 ' + BA.ymd(r.endDate.getTime()).replace(/-/g, '/');
      return '<button class="vac-row" data-act="vac" data-key="' + r.key + '" data-done="' + (r.status === 'done') + '">' +
        '<span class="vac-check"><i class="fas fa-check"></i></span>' +
        '<span class="vac-main"><span class="vac-name">' + esc(r.name) + (r.opt ? ' <span class="badge opt">任意</span>' : '') + '</span><br><span class="vac-sub">' + esc(range) + '</span></span>' + badge(r) + '</button>';
    };
    const todo = rows.filter((r) => r.status === 'late' || r.status === 'now' || r.status === 'soon');
    const future = rows.filter((r) => r.status === 'future');
    const done = rows.filter((r) => r.status === 'done');
    const order = { late: 0, now: 1, soon: 2 };
    todo.sort((a, b) => order[a.status] - order[b.status] || a.startDate - b.startDate);
    const next = future.slice(0, 4), rest = future.slice(4);
    const lateOpt = todo.filter((r) => r.status === 'late' && !r.opt).length;
    return '<section class="card"><h2><i class="fas fa-syringe" style="color:var(--primary)"></i>これから・いま受けたい接種</h2>' +
      (lateOpt ? '<div class="notice danger">標準的な時期を過ぎている接種が' + lateOpt + '件あります。かかりつけ医に相談してください。</div>' : '') +
      (todo.length ? '<div>' + todo.map(row).join('') + '</div>' : '<div class="empty">いま対応が必要な接種はありません</div>') + '</section>' +
      (next.length ? '<section class="card"><h2><i class="fas fa-calendar-check" style="color:var(--primary)"></i>次の予定</h2><div>' + next.map(row).join('') + '</div>' +
        (rest.length ? '<details class="fold" style="margin-top:8px"><summary>それ以降の予定(' + rest.length + '件)</summary><div style="margin-top:6px">' + rest.map(row).join('') + '</div></details>' : '') + '</section>' : '') +
      (done.length ? '<section class="card"><details class="fold"><summary>接種済み(' + done.length + '件)</summary><div style="margin-top:6px">' + done.map(row).join('') + '</div></details></section>' : '') +
      '<p class="disclaimer">日本の定期接種を中心とした標準的な時期の目安を、生年月日から計算しています。実際の接種時期・回数・間隔は、使用するワクチンの種類や体調、自治体の案内によって異なります。必ずかかりつけ医・自治体の案内に従ってください。</p>';
  }

  // ---------- 家族・設定 ----------
  V.family = function () {
    const st = BA.state;
    const theme = BA.ls.get('ba_theme') || 'auto';
    const isViewer = BA.isViewer();
    const members = st.members.map((m) => {
      const isMe = m.id === st.me;
      const roleBadge = m.role === 'viewer'
        ? '<span class="badge" style="background:var(--sub);color:#fff"><i class="fas fa-eye"></i> 閲覧のみ</span>'
        : '<span class="badge" style="background:var(--surface);border:1px solid var(--line)"><i class="fas fa-pen"></i> 記録</span>';
      let actions = '';
      if (!isViewer) {
        actions += '<button class="link-btn" data-act="changerole" data-id="' + m.id + '" data-role="' + (m.role || 'editor') + '" data-name="' + esc(m.name) + '" style="font-size:12px">権限変更</button>';
        if (!isMe) {
          actions += '<button class="link-btn" data-act="delmember" data-id="' + m.id + '" data-name="' + esc(m.name) + '" style="color:var(--danger);font-size:12px">削除</button>';
        }
      }
      return '<li><i class="fas fa-user" style="color:var(--primary)"></i><span style="flex:1">' + esc(m.name) + '</span>' +
        (isMe ? '<span class="badge">あなた</span>' : '') + roleBadge + actions + '</li>';
    }).join('');

    const kids = st.children.map((c) =>
      '<li><i class="fas fa-baby" style="color:var(--primary)"></i><span style="flex:1">' + esc(c.name) + ' <span class="muted">' + esc(BA.ageText(c.birthday)) + '</span></span>' +
      (isViewer ? '' : '<button class="link-btn" data-act="editchild" data-id="' + c.id + '">編集</button>') + '</li>').join('');
    const me = st.members.find((m) => m.id === st.me);

    const activeInvites = (BA.data.invitations || []).filter((inv) => inv.expires_at > Date.now());
    let inviteSection = '';
    if (isViewer) {
      inviteSection = '<p class="muted" style="margin:0;font-size:13px"><i class="fas fa-lock"></i> 招待コードの発行は記録権限を持つメンバーのみ行えます。新しい端末を追加したい場合は、記録権限を持つご家族に招待コードを発行してもらってください。</p>';
    } else {
      let activeList = '';
      if (activeInvites.length > 0) {
        activeList = '<div style="display:grid;gap:12px;margin-bottom:14px">' + activeInvites.map((inv) => {
          const remainMs = inv.expires_at - Date.now();
          const remainHours = Math.max(1, Math.round(remainMs / 3600000));
          const isV = inv.role === 'viewer';
          const roleBadge = isV
            ? '<span class="badge" style="background:var(--sub);color:#fff"><i class="fas fa-eye"></i> 閲覧専用</span>'
            : '<span class="badge" style="background:var(--primary);color:#fff"><i class="fas fa-pen"></i> 記録・閲覧</span>';
          return '<div style="background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:12px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            roleBadge +
            '<span class="muted" style="font-size:12px"><i class="fas fa-clock"></i> あと約' + remainHours + '時間有効</span></div>' +
            '<div class="code-box" style="margin:6px 0 10px;font-size:26px;padding:10px 4px" aria-label="招待コード">' + esc(inv.code) + '</div>' +
            '<p class="muted" style="margin:0 0 10px;font-size:12px;text-align:center">1回限り有効（参加すると無効になります）<br>有効期限: ' + esc(BA.mdLabel(inv.expires_at)) + ' ' + esc(BA.clock(inv.expires_at)) + 'まで</p>' +
            '<div class="btn-row" style="margin-bottom:6px">' +
            '<button class="btn" data-act="copyinvitelink" data-code="' + esc(inv.code) + '"><i class="fas fa-copy"></i>リンクをコピー</button>' +
            '<button class="btn primary" data-act="shareinvite" data-code="' + esc(inv.code) + '" data-role="' + esc(inv.role) + '"><i class="fas fa-share-nodes"></i>招待を送る</button></div>' +
            '<div style="text-align:right"><button class="link-btn" data-act="delinvite" data-code="' + esc(inv.code) + '" style="color:var(--danger);font-size:12px"><i class="fas fa-trash"></i> この招待を取り消す</button></div>' +
            '</div>';
        }).join('') + '</div>';
      }
      inviteSection = activeList +
        '<p class="muted" style="margin-bottom:10px;font-size:13px">招待コードは<b>24時間有効・1回限り</b>の使い捨てコードです。パートナーの招待や、別の端末(PCなど)を追加するたびに新しく発行します。</p>' +
        '<div class="btn-row">' +
        '<button class="btn primary" data-act="createinvite" data-role="editor"><i class="fas fa-key"></i> 招待コードを発行 (記録)</button>' +
        '<button class="btn soft" data-act="createinvite" data-role="viewer"><i class="fas fa-eye"></i> 閲覧用で発行</button></div>';
    }

    return header() + '<main id="view">' +
      '<section class="card"><h2><i class="fas fa-people-roof" style="color:var(--primary)"></i>家族を招待する</h2>' +
      inviteSection +
      '</section>' +
      '<section class="card"><h2><i class="fas fa-users" style="color:var(--primary)"></i>メンバー(' + st.members.length + '人)</h2><ul class="member-list">' + members + '</ul>' +
      '<button class="link-btn" data-act="rename" style="margin-top:6px"><i class="fas fa-pen"></i> 自分の呼び名を変更' + (me ? '(' + esc(me.name) + ')' : '') + '</button></section>' +
      '<section class="card"><h2><i class="fas fa-baby" style="color:var(--primary)"></i>お子さん</h2><ul class="member-list">' + kids + '</ul>' +
      (isViewer ? '' : '<button class="btn block" data-act="addchild" style="margin-top:10px"><i class="fas fa-plus"></i>きょうだいを追加</button>') + '</section>' +
      '<section class="card"><h2><i class="fas fa-circle-half-stroke" style="color:var(--primary)"></i>表示テーマ</h2><div class="seg">' +
      [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク(夜間)']].map((t) => '<button data-act="theme" data-t="' + t[0] + '" aria-pressed="' + (theme === t[0]) + '">' + t[1] + '</button>').join('') + '</div></section>' +
      '<section class="card"><h2><i class="fas fa-mobile-screen" style="color:var(--primary)"></i>ホーム画面に追加</h2>' +
      '<p class="muted">ブラウザのメニューから「ホーム画面に追加」をすると、アプリのようにすぐ開けます。</p></section>' +
      '<section class="card"><button class="btn danger block" data-act="logout"><i class="fas fa-right-from-bracket"></i>この端末の連携を解除</button>' +
      '<p class="disclaimer" style="margin-top:10px">解除してもデータは削除されません。再度参加する場合は、家族の端末から新しい招待コードを発行してもらってください。</p></section>' +
      '<p class="disclaimer" style="text-align:center">すくすくログの記録は医療的な診断・助言ではありません。体調が心配なときは、かかりつけ医や小児科、#8000(小児救急電話相談)にご相談ください。</p>' +
      '</main>' + V.tabbar();
  };

  BA.describe = describe;
})();
