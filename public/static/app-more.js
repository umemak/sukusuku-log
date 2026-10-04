/* すくすくログ - more: 離乳食・アレルギー / 思い出日記 / 分担 / 受診用まとめ */
(function () {
  'use strict';
  const BA = window.BA;
  const V = BA.views;
  const esc = BA.esc;
  const { mountSheet, setErr, guard, seg } = BA.ui;

  // =====================================================================
  // 離乳食・アレルギー
  // =====================================================================
  // 特定原材料8品目(表示義務)。名前の一致で「経験済み」を判定する目安
  const ALLERGENS = [
    { name: '卵', alias: ['卵', 'たまご', '玉子'] },
    { name: '乳', alias: ['乳', '牛乳', 'ヨーグルト', 'チーズ', 'バター'] },
    { name: '小麦', alias: ['小麦', 'パン', 'うどん', 'パスタ', 'マカロニ', 'そうめん'] },
    { name: 'そば', alias: ['そば', '蕎麦'] },
    { name: '落花生', alias: ['落花生', 'ピーナッツ', 'ピーナツ'] },
    { name: 'えび', alias: ['えび', 'エビ', '海老'] },
    { name: 'かに', alias: ['かに', 'カニ', '蟹'] },
    { name: 'くるみ', alias: ['くるみ', 'クルミ', '胡桃'] }
  ];
  const COMMON_FOODS = ['10倍がゆ', '5倍がゆ', 'おかゆ', 'にんじん', 'かぼちゃ', 'じゃがいも', 'さつまいも', 'ほうれん草', 'だいこん', 'トマト', 'バナナ', 'りんご', '豆腐', 'しらす', '白身魚', '鶏ささみ'];
  const REACTION = {
    ok: { label: '問題なし', badge: '' },
    mild: { label: '軽い症状', badge: 'mild' },
    severe: { label: '強い症状', badge: 'severe' }
  };
  const EMERGENCY = 'ぐったりしている・息が苦しそう・ゼーゼーする・顔色が悪い・繰り返し吐く・全身にじんましんが出る、などのときは食べさせるのをやめて、すぐに119番または救急受診してください。';

  const matchAllergen = (a, f) => a.alias.some((k) => String(f.food).includes(k));

  V.foodBody = function () {
    const isViewer = BA.isViewer();
    const foods = BA.data.foods || [];
    const kinds = new Set(foods.map((f) => f.food)).size;
    const grid = ALLERGENS.map((a) => {
      const hits = foods.filter((f) => matchAllergen(a, f));
      const worst = hits.some((f) => f.reaction === 'severe') ? 'severe' : hits.some((f) => f.reaction === 'mild') ? 'mild' : '';
      const sub = hits.length ? hits.length + '回' + (worst ? '・' + REACTION[worst].label : '') : '未経験';
      const act = isViewer ? '' : ' data-act="addfood"';
      return '<button class="allergen" ' + act + ' data-food="' + esc(a.name) + '" data-done="' + (hits.length > 0) + '"' + (isViewer ? ' style="cursor:default"' : '') + '>' +
        '<span><b>' + esc(a.name) + '</b><br><small>' + esc(sub) + '</small></span>' +
        (hits.length ? '<i class="fas ' + (worst ? 'fa-triangle-exclamation' : 'fa-circle-check') + '" style="color:' + (worst === 'severe' ? 'var(--danger)' : worst ? 'var(--warn)' : 'var(--ok)') + '"></i>'
          : (isViewer ? '' : '<i class="fas fa-plus" style="color:var(--sub)"></i>')) + '</button>';
    }).join('');
    const rows = foods.slice(0, 40).map((f) => {
      const r = REACTION[f.reaction] || REACTION.ok;
      return '<div class="log-row" style="cursor:default"><span class="log-main"><span class="log-title">' + esc(f.food) +
        (r.badge ? ' <span class="badge ' + r.badge + '">' + r.label + '</span>' : '') + '</span><br><span class="log-sub">' +
        esc([f.tried_on.replace(/-/g, '/'), f.note || '', BA.memberName(f.member_id)].filter(Boolean).join(' ・ ')) + '</span></span>' +
        (isViewer ? '' : '<button class="icon-btn" data-act="delfood" data-id="' + f.id + '" aria-label="削除" style="box-shadow:none"><i class="fas fa-trash" style="color:var(--sub)"></i></button>') + '</div>';
    }).join('');
    return '<section class="card"><h2><i class="fas fa-bowl-rice" style="color:var(--warn)"></i>離乳食の記録</h2>' +
      '<p class="muted" style="margin-bottom:10px">これまでに食べた食材: <b>' + kinds + '</b>種類</p>' +
      (isViewer ? '' : '<button class="btn primary block" data-act="addfood"><i class="fas fa-plus"></i>食べたものを記録する</button>') + '</section>' +
      '<section class="card"><h2><i class="fas fa-shield-heart" style="color:var(--danger)"></i>アレルギーの原因になりやすい食材</h2>' +
      '<p class="muted" style="margin-bottom:10px">特定原材料8品目の経験状況です(食材名で判定する目安)。初めての食材は、少量から・平日の日中に与えると安心です。</p>' +
      '<div class="allergen-grid">' + grid + '</div>' +
      '<div class="notice danger" style="margin-top:12px">' + esc(EMERGENCY) + '</div></section>' +
      '<section class="card"><h2>最近の記録</h2>' +
      (rows ? '<div class="log-list">' + rows + '</div>' : '<div class="empty">まだ記録がありません</div>') + '</section>' +
      '<p class="disclaimer">アレルギーの診断や、与え方の判断は医師が行います。湿疹がある・家族にアレルギーがある場合などは、食べさせる前にかかりつけ医に相談してください。</p>';
  };

  BA.openFoodForm = function (preset) {
    const st = { food: preset || '', date: BA.ymd(Date.now()), reaction: 'ok', note: '' };
    const chip = (v) => '<button data-act="pickfood" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    function render() {
      return '<label class="field"><span>食べたもの</span><input type="text" maxlength="40" data-bind="food" value="' + esc(st.food) + '" placeholder="例: にんじん"></label>' +
        '<div class="chip-group-title">アレルギー表示の対象(特定原材料)</div><div class="chips" style="margin-top:6px">' + ALLERGENS.map((a) => chip(a.name)).join('') + '</div>' +
        '<div class="chip-group-title">よく使う食材</div><div class="chips" style="margin-top:6px">' + COMMON_FOODS.map(chip).join('') + '</div>' +
        '<div style="height:14px"></div>' +
        '<label class="field"><span>日付</span><input type="date" data-bind="date" value="' + esc(st.date) + '"></label>' +
        '<div class="field-label">食べたあとの様子</div>' + seg('reaction', [['ok', '問題なし'], ['mild', '軽い症状'], ['severe', '強い症状']], st.reaction) +
        (st.reaction !== 'ok' ? '<div class="notice ' + (st.reaction === 'severe' ? 'danger' : 'warn') + '" style="margin-top:12px">' +
          (st.reaction === 'severe' ? esc(EMERGENCY) : '発疹・赤み・機嫌が悪いなどの軽い症状でも、同じ食材を続けて与える前にかかりつけ医に相談しましょう。') + '</div>' : '') +
        '<div style="height:14px"></div>' +
        '<label class="field"><span>メモ(任意)</span><input type="text" maxlength="200" data-bind="note" value="' + esc(st.note) + '" placeholder="例: 小さじ1、口のまわりが赤くなった"></label>' +
        '<div class="error-text" id="sheet-err"></div>' +
        '<button class="btn primary block" data-act="save">記録する</button>';
    }
    mountSheet('食べたものを記録', '', st, render, (re) => ({
      pickfood(el) { st.food = el.dataset.v; re(); },
      seg(el) { st[el.dataset.name] = el.dataset.val; re(); },
      save(el) {
        guard(el, async () => {
          setErr('');
          if (!st.food || !st.food.trim()) throw new Error('食べたものを入力してください');
          await BA.api('POST', '/children/' + BA.child().id + '/foods', { food: st.food.trim(), tried_on: st.date, reaction: st.reaction, note: st.note });
          BA.closeSheet();
          BA.toast('記録しました');
          await BA.refresh();
        });
      }
    }));
  };

  // =====================================================================
  // 思い出日記(写真つき)
  // =====================================================================
  // 日付時点の月齢表示
  function ageAt(birthday, ymd) {
    const days = BA.daysOld(birthday, ymd);
    if (days < 0) return '';
    if (days < 31) return '生後' + days + '日';
    const b = BA.parseYMD(birthday), t = BA.parseYMD(ymd);
    let months = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth();
    if (t.getDate() < b.getDate()) months--;
    if (months < 12) return '生後' + months + 'か月';
    return Math.floor(months / 12) + '歳' + (months % 12) + 'か月';
  }

  V.memory = function () {
    const isViewer = BA.isViewer();
    const c = BA.child();
    const list = BA.data.diary || [];
    const header = V.header();
    const cards = list.map((d) => {
      const who = BA.memberName(d.member_id);
      const commentBadge = d.comment_count
        ? '<span class="badge" style="margin-left:auto"><i class="fas fa-comment"></i> ' + d.comment_count + '</span>'
        : '';
      return '<button class="diary-card" data-act="editdiary" data-id="' + d.id + '">' +
        (d.photo_id ? '<img data-photo="' + d.photo_id + '" alt="思い出の写真">' : '') +
        '<span class="diary-body"><span class="diary-meta"><span>' + esc(d.entry_date.replace(/-/g, '/')) + '</span><span class="badge">' + esc(ageAt(c.birthday, d.entry_date)) + '</span>' +
        (who ? '<span>' + esc(who) + '</span>' : '') +
        commentBadge + '</span>' +
        (d.body ? '<span class="diary-text">' + esc(d.body) + '</span>' : '') + '</span></button>';
    }).join('');
    return header + '<main id="view">' +
      '<section class="card"><h2><i class="fas fa-book-open" style="color:var(--primary)"></i>思い出日記</h2>' +
      '<p class="muted" style="margin-bottom:10px">成長の瞬間を写真とひとことで残して、家族みんなで見返せます。</p>' +
      (isViewer ? '' : '<button class="btn primary block" data-act="adddiary"><i class="fas fa-camera"></i>思い出を残す</button>') + '</section>' +
      (cards ? '<section class="diary-list" style="display:grid;gap:12px" aria-label="思い出一覧">' + cards + '</section>' : '<div class="card"><div class="empty">まだ思い出がありません。<br>最初の1枚を残してみましょう。</div></div>') +
      '</main>' + V.tabbar();
  };

  BA.openDiary = function (entry, prefill) {
    if (!entry) {
      if (BA.isViewer()) return;
      const st = { date: BA.ymd(Date.now()), body: (prefill && prefill.body) || '', blob: null, preview: null };
      const revoke = () => { if (st.preview) { URL.revokeObjectURL(st.preview); st.preview = null; } };
      function renderNew() {
        const photo = '<label class="btn block photo-pick"><i class="fas fa-camera"></i>' + (st.blob ? '写真を選びなおす' : '写真を選ぶ・撮影する') +
          '<input type="file" accept="image/*" data-act="pickphoto" aria-label="写真を選ぶ"></label>' +
          (st.preview ? '<img class="photo-preview" src="' + st.preview + '" alt="選択した写真のプレビュー">' : '') +
          '<div style="height:14px"></div>';
        return photo +
          '<label class="field"><span>日付</span><input type="date" data-bind="date" value="' + esc(st.date) + '"></label>' +
          '<label class="field"><span>ひとこと(写真だけでもOK)</span><textarea data-bind="body" maxlength="2000" rows="4" placeholder="例: はじめて寝返りができた!">' + esc(st.body) + '</textarea></label>' +
          '<div class="error-text" id="sheet-err"></div>' +
          '<button class="btn primary block" data-act="save">残す</button>';
      }
      mountSheet('思い出を残す', '', st, renderNew, (re) => ({
        async change(el) {
          if (el.dataset.act !== 'pickphoto' || !el.files || !el.files[0]) return;
          setErr('');
          try {
            const blob = await BA.resizeImage(el.files[0], 1600, 0.82);
            if (blob.size > 4 * 1024 * 1024) throw new Error('写真が大きすぎます。別の写真をお試しください');
            revoke();
            st.blob = blob; st.preview = URL.createObjectURL(blob);
            re();
          } catch (e) { setErr(e.message); }
        },
        save(el) {
          guard(el, async () => {
            setErr('');
            const text = (st.body || '').trim();
            if (!text && !st.blob) throw new Error('写真かひとことを入力してください');
            let photoId = null;
            if (st.blob) photoId = await BA.uploadPhoto(st.blob);
            try {
              await BA.api('POST', '/children/' + BA.child().id + '/diary', { entry_date: st.date, body: text, photo_id: photoId });
            } catch (e) {
              if (photoId) BA.api('DELETE', '/photos/' + photoId).catch(() => {});
              throw e;
            }
            revoke();
            BA.closeSheet();
            BA.toast('思い出を残しました');
            await BA.refresh();
          });
        }
      }));
      return;
    }

    // 既存の日記の閲覧・コメント・編集(閲覧専用ユーザーもコメント可能)
    const isViewer = BA.isViewer();
    const c = BA.child();
    const who = BA.memberName(entry.member_id);
    const st = {
      mode: 'view',
      date: entry.entry_date,
      body: entry.body || '',
      comments: null,
      loadingComments: true,
      newComment: ''
    };

    function render() {
      if (st.mode === 'edit') {
        const photo = entry.photo_id ? '<img class="photo-full" data-photo="' + entry.photo_id + '" alt="思い出の写真">' : '';
        return photo +
          '<label class="field"><span>日付</span><input type="date" data-bind="date" value="' + esc(st.date) + '"></label>' +
          '<label class="field"><span>ひとこと</span><textarea data-bind="body" maxlength="2000" rows="4" placeholder="例: はじめて寝返りができた!">' + esc(st.body) + '</textarea></label>' +
          '<div class="error-text" id="sheet-err"></div>' +
          '<div class="btn-row" style="margin-top:12px">' +
            '<button class="btn danger" data-act="del"><i class="fas fa-trash"></i>削除</button>' +
            '<button class="btn" data-act="canceledit">キャンセル</button>' +
            '<button class="btn primary" data-act="save">保存</button>' +
          '</div>';
      }

      // 詳細・コメント表示
      const photoHtml = entry.photo_id ? '<img class="photo-full" data-photo="' + entry.photo_id + '" alt="思い出の写真">' : '';
      const headerHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px">' +
          '<div style="font-size:15px;font-weight:700">' + esc(st.date.replace(/-/g, '/')) + ' <span class="badge">' + esc(ageAt(c.birthday, st.date)) + '</span></div>' +
          (!isViewer ? '<button class="btn soft" data-act="startedit" style="font-size:12px;padding:4px 10px"><i class="fas fa-pen"></i> 編集</button>' : '') +
        '</div>';
      const bodyHtml = st.body ? '<p style="margin:0 0 10px;white-space:pre-wrap;line-height:1.6">' + esc(st.body) + '</p>' : '';
      const whoHtml = who ? '<p class="muted" style="font-size:12px;margin:0 0 14px"><i class="fas fa-user"></i> 記録した人: ' + esc(who) + '</p>' : '';

      const countStr = st.comments ? ' (' + st.comments.length + ')' : '';
      let commentListHtml = '';
      if (st.loadingComments) {
        commentListHtml = '<div class="muted" style="font-size:13px;padding:12px 0;text-align:center"><i class="fas fa-spinner fa-spin"></i> コメントを読み込み中...</div>';
      } else if (!st.comments || st.comments.length === 0) {
        commentListHtml = '<div class="muted" style="font-size:13px;padding:8px 0 12px">まだコメントはありません。</div>';
      } else {
        commentListHtml = '<div class="diary-comments-list">' +
          st.comments.map((cm) => {
            const author = BA.memberName(cm.member_id) || '家族メンバー';
            const isMine = cm.member_id === BA.state.me;
            const canDel = isMine || !isViewer;
            const ago = BA.fmtAgo(cm.created_at);
            return '<div class="diary-comment-item">' +
              '<div class="diary-comment-head">' +
                '<span class="diary-comment-author">' + esc(author) + '</span>' +
                '<span class="diary-comment-meta">' +
                  '<span>' + esc(ago) + '</span>' +
                  (canDel ? '<button class="diary-comment-del" data-act="delcomment" data-cid="' + cm.id + '" title="削除" aria-label="コメントを削除"><i class="fas fa-trash"></i></button>' : '') +
                '</span>' +
              '</div>' +
              '<div class="diary-comment-body">' + esc(cm.comment) + '</div>' +
            '</div>';
          }).join('') +
          '</div>';
      }

      const commentFormHtml =
        '<div class="diary-comment-form">' +
          '<textarea data-bind="newComment" maxlength="1000" rows="1" placeholder="コメントを書く...">' + esc(st.newComment) + '</textarea>' +
          '<button class="btn primary" data-act="sendcomment" aria-label="送信" style="padding:9px 15px"><i class="fas fa-paper-plane"></i></button>' +
        '</div>';

      return photoHtml + headerHtml + bodyHtml + whoHtml +
        '<div class="diary-comments">' +
          '<div class="diary-comments-title"><i class="fas fa-comments" style="color:var(--primary)"></i> コメント' + countStr + '</div>' +
          commentListHtml +
          commentFormHtml +
          '<div class="error-text" id="sheet-err" style="margin-top:6px"></div>' +
        '</div>';
    }

    const re = mountSheet('思い出', '', st, render, (reRender) => ({
      startedit() {
        st.mode = 'edit';
        setErr('');
        reRender();
      },
      canceledit() {
        st.mode = 'view';
        st.date = entry.entry_date;
        st.body = entry.body || '';
        setErr('');
        reRender();
      },
      save(el) {
        guard(el, async () => {
          setErr('');
          const text = (st.body || '').trim();
          if (!text && !entry.photo_id) throw new Error('写真かひとことを入力してください');
          await BA.api('PUT', '/diary/' + entry.id, { entry_date: st.date, body: text });
          entry.entry_date = st.date;
          entry.body = text;
          st.mode = 'view';
          reRender();
          BA.toast('保存しました');
          await BA.refresh();
        });
      },
      del(el) {
        if (!confirm('この思い出を削除しますか?写真も削除されます。')) return;
        guard(el, async () => {
          await BA.api('DELETE', '/diary/' + entry.id);
          BA.closeSheet();
          BA.toast('削除しました');
          await BA.refresh();
        });
      },
      sendcomment(el) {
        guard(el, async () => {
          setErr('');
          const text = (st.newComment || '').trim();
          if (!text) return;
          const res = await BA.api('POST', '/diary/' + entry.id + '/comments', { comment: text });
          if (!st.comments) st.comments = [];
          st.comments.push(res.comment);
          st.newComment = '';
          entry.comment_count = (entry.comment_count || 0) + 1;
          reRender();
          BA.toast('コメントを投稿しました');
        });
      },
      delcomment(el) {
        const cid = el.dataset.cid;
        if (!cid) return;
        if (!confirm('このコメントを削除しますか?')) return;
        guard(el, async () => {
          setErr('');
          await BA.api('DELETE', '/diary/comments/' + cid);
          if (st.comments) st.comments = st.comments.filter((item) => item.id !== cid);
          if (entry.comment_count && entry.comment_count > 0) entry.comment_count--;
          reRender();
          BA.toast('コメントを削除しました');
        });
      }
    }));

    // コメント一覧を非同期取得
    BA.api('GET', '/diary/' + entry.id + '/comments')
      .then((res) => {
        st.comments = res.comments || [];
        st.loadingComments = false;
        re();
      })
      .catch(() => {
        st.comments = [];
        st.loadingComments = false;
        re();
      });
  };

  // =====================================================================
  // 家事・育児の分担の見える化
  // =====================================================================
  const WL_CATS = [
    { key: 'feed', label: '授乳・ミルク', color: BA.TYPES.breast.color, types: ['breast', 'formula', 'expressed'] },
    { key: 'diaper', label: 'おむつ', color: BA.TYPES.pee.color, types: ['pee', 'poop'] },
    { key: 'sleep', label: 'ねんね', color: BA.TYPES.sleep.color, types: ['sleep'] },
    { key: 'bath', label: 'お風呂', color: BA.TYPES.bath.color, types: ['bath'] },
    { key: 'other', label: 'その他', color: BA.TYPES.memo.color, types: ['temp', 'med', 'memo'] }
  ];

  V.workload = function (logs, since) {
    const rows = new Map();
    BA.state.members.forEach((m) => rows.set(m.id, { name: m.name, me: m.id === BA.state.me, c: {}, total: 0 }));
    const gone = { name: '退出したメンバー', me: false, c: {}, total: 0 };
    logs.forEach((l) => {
      if (l.started_at < since) return;
      const cat = WL_CATS.find((x) => x.types.includes(l.type));
      if (!cat) return;
      let r = rows.get(l.member_id);
      if (!r) r = gone;
      r.c[cat.key] = (r.c[cat.key] || 0) + 1;
      r.total++;
    });
    const list = Array.from(rows.values());
    if (gone.total) list.push(gone);
    const sum = list.reduce((a, r) => a + r.total, 0);
    const max = Math.max(1, ...list.map((r) => r.total));
    const body = sum
      ? list.map((r) => {
        const segs = WL_CATS.filter((x) => r.c[x.key]).map((x) =>
          '<span title="' + x.label + ' ' + r.c[x.key] + '件" style="width:' + (r.c[x.key] / max * 100).toFixed(1) + '%;background:' + x.color + '"></span>').join('');
        return '<div class="wl-row"><div class="wl-head"><span>' + esc(r.name) + (r.me ? ' <span class="badge">あなた</span>' : '') + '</span>' +
          '<span>' + r.total + '件 <span class="muted">(' + Math.round(r.total / sum * 100) + '%)</span></span></div>' +
          '<div class="wl-bar" role="img" aria-label="' + esc(r.name) + 'の記録 ' + r.total + '件">' + segs + '</div></div>';
      }).join('') +
      '<div class="wl-legend">' + WL_CATS.map((x) => '<span><i class="wl-dot" style="background:' + x.color + '"></i>' + x.label + '</span>').join('') + '</div>' +
      '<p class="legend-note">記録した人ごとの件数です。記録しないお世話(抱っこ・家事など)は含まれません。感謝を伝えるきっかけにどうぞ。</p>'
      : '<div class="empty">この期間の記録がありません</div>';
    return '<section class="card" aria-label="分担"><h2><i class="fas fa-people-arrows" style="color:var(--primary)"></i>お世話の分担<small class="muted">(' + BA.state.statDays + '日間)</small></h2>' + body + '</section>';
  };

  // =====================================================================
  // 受診用まとめ(画面表示 + 印刷 / PDF保存)
  // =====================================================================
  const rpState = { days: 7 };
  const $rp = () => document.getElementById('report-root');

  function pctText(ind, c, ymd, value) {
    const p = BA.percentile(ind, c.gender, BA.daysOld(c.birthday, ymd), value);
    return p == null ? '' : '(' + (p < 1 ? '1未満' : p > 99 ? '99超' : p.toFixed(0)) + 'パーセンタイル)';
  }

  function buildReport(d) {
    const c = BA.child();
    const now = Date.now();
    const days = rpState.days;
    const today = BA.dayStart(now);
    const since = today - (days - 1) * BA.DAY;
    const logs = d.logs.map(BA.parseLog).filter((l) => l.started_at >= since);
    const gender = { boy: '男の子', girl: '女の子', unknown: '' }[c.gender] || '';

    // 日別集計
    const drows = [];
    for (let i = 0; i < days; i++) {
      const ds = since + i * BA.DAY;
      const s = BA.summarize(logs, ds, ds + BA.DAY);
      drows.push('<tr><td>' + BA.mdLabel(ds) + '(' + '日月火水木金土'[new Date(ds).getDay()] + ')</td><td class="num">' + s.feed + '</td><td class="num">' + s.ml + '</td><td class="num">' +
        (s.sleepMs ? (s.sleepMs / 3600000).toFixed(1) : '0') + '</td><td class="num">' + s.pee + '</td><td class="num">' + s.poop + '</td></tr>');
    }
    // 体温
    const temps = logs.filter((l) => l.type === 'temp').sort((a, b) => a.started_at - b.started_at);
    const tempRows = temps.slice(-40).map((l) => '<tr><td>' + BA.mdLabel(l.started_at) + ' ' + BA.clock(l.started_at) + '</td><td class="num ' + (l.amount >= 37.5 ? 'rp-hot' : '') + '">' +
      Number(l.amount).toFixed(1) + '℃</td><td>' + esc(l.note || '') + '</td></tr>');
    // 薬
    const meds = logs.filter((l) => l.type === 'med').sort((a, b) => a.started_at - b.started_at);
    const medRows = meds.map((l) => '<tr><td>' + BA.mdLabel(l.started_at) + ' ' + BA.clock(l.started_at) + '</td><td>' + esc(l.d.name || '') + '</td><td>' + esc(l.note || '') + '</td></tr>');
    // うんちの性状
    const poops = logs.filter((l) => l.type === 'poop');
    const kinds = { hard: 'かため', normal: 'ふつう', soft: 'やわらかい', watery: '水っぽい' };
    const kc = {};
    poops.forEach((l) => { const k = kinds[l.d.kind] || 'ふつう'; kc[k] = (kc[k] || 0) + 1; });
    const poopText = poops.length ? Object.keys(kc).map((k) => k + ' ' + kc[k] + '回').join('、') : '記録なし';
    // メモ
    const memos = logs.filter((l) => l.type === 'memo' && l.note).sort((a, b) => a.started_at - b.started_at).slice(-15);
    // 成長
    const g = d.growth.slice(-5).reverse();
    const growRows = g.map((r) => '<tr><td>' + esc(r.measured_on.replace(/-/g, '/')) + '</td>' +
      '<td class="num">' + (r.weight_g != null ? (r.weight_g / 1000).toFixed(2) + 'kg ' + pctText('wfa', c, r.measured_on, r.weight_g / 1000) : '') + '</td>' +
      '<td class="num">' + (r.height_cm != null ? r.height_cm + 'cm ' + pctText('lhfa', c, r.measured_on, r.height_cm) : '') + '</td>' +
      '<td class="num">' + (r.head_cm != null ? r.head_cm + 'cm ' + pctText('hcfa', c, r.measured_on, r.head_cm) : '') + '</td></tr>');
    // 予防接種
    const doneVac = BA.vaccineRows(c, d.vacs).filter((r) => r.status === 'done');
    const dueVac = BA.vaccineRows(c, d.vacs).filter((r) => (r.status === 'late' || r.status === 'now') && !r.opt);
    // 離乳食・アレルギー
    const reacts = d.foods.filter((f) => f.reaction !== 'ok').slice(0, 15);
    const foodKinds = new Set(d.foods.map((f) => f.food));
    const tried = ALLERGENS.filter((a) => d.foods.some((f) => matchAllergen(a, f))).map((a) => a.name);

    const tbl = (head, rows, empty) => rows.length
      ? '<table><thead><tr>' + head.map((h) => '<th' + (h[1] ? ' class="num"' : '') + '>' + h[0] + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      : '<p class="rp-empty">' + empty + '</p>';

    const sleepAll = BA.summarize(logs, since, today + BA.DAY);
    return '<div class="report-bar">' +
      '<button class="btn" data-act="report-close"><i class="fas fa-xmark"></i>閉じる</button>' +
      '<button class="btn primary" data-act="report-print"><i class="fas fa-print"></i>印刷 / PDF保存</button></div>' +
      '<article class="report-sheet">' +
      '<h1>受診用まとめ</h1>' +
      '<p class="rp-meta">' + esc(c.name) + '(' + esc(c.birthday.replace(/-/g, '/')) + '生まれ・' + esc(BA.ageText(c.birthday)) + (gender ? '・' + gender : '') + ')<br>' +
      '期間: ' + BA.ymd(since).replace(/-/g, '/') + ' 〜 ' + BA.ymd(today).replace(/-/g, '/') + '(' + days + '日間) ／ 作成日: ' + BA.ymd(now).replace(/-/g, '/') + '</p>' +
      '<div class="seg report-days" style="margin:10px 0 0">' + [3, 7, 14].map((n) => '<button data-act="report-days" data-d="' + n + '" aria-pressed="' + (days === n) + '">' + n + '日間</button>').join('') + '</div>' +
      '<h2>1日ごとの記録</h2>' +
      tbl([['日付'], ['授乳(回)', 1], ['ミルク等(ml)', 1], ['睡眠(時間)', 1], ['おしっこ(回)', 1], ['うんち(回)', 1]], drows, '') +
      '<p class="rp-meta">期間合計: 授乳 ' + sleepAll.feed + '回 / ミルク等 ' + sleepAll.ml + 'ml / 睡眠 ' + (sleepAll.sleepMs / 3600000).toFixed(1) + '時間 ／ うんちの状態: ' + esc(poopText) + '</p>' +
      '<h2>体温</h2>' + tbl([['日時'], ['体温', 1], ['メモ']], tempRows, 'この期間の体温の記録はありません') +
      '<h2>薬</h2>' + tbl([['日時'], ['薬の名前・量'], ['メモ']], medRows, 'この期間の薬の記録はありません') +
      (memos.length ? '<h2>メモ</h2><ul>' + memos.map((l) => '<li>' + BA.mdLabel(l.started_at) + ' ' + BA.clock(l.started_at) + ' ' + esc(l.note) + '</li>').join('') + '</ul>' : '') +
      '<h2>成長(直近5回)</h2>' + tbl([['測定日'], ['体重', 1], ['身長', 1], ['頭囲', 1]], growRows, '成長の記録はありません') +
      '<h2>予防接種</h2><p>接種済み: ' + (doneVac.length ? doneVac.map((r) => esc(r.name) + '(' + esc(r.doneOn.replace(/-/g, '/')) + ')').join('、') : '記録なし') + '</p>' +
      (dueVac.length ? '<p>接種の時期(または時期を過ぎている)もの: ' + dueVac.map((r) => esc(r.name)).join('、') + '</p>' : '') +
      '<h2>離乳食・アレルギー</h2>' +
      (d.foods.length ? '<p>食べた食材: ' + foodKinds.size + '種類 ／ 特定原材料で経験済み: ' + (tried.length ? esc(tried.join('、')) : 'なし') + '</p>' : '<p class="rp-empty">離乳食の記録はありません</p>') +
      (reacts.length ? tbl([['日付'], ['食材'], ['様子'], ['メモ']], reacts.map((f) => '<tr><td>' + esc(f.tried_on.replace(/-/g, '/')) + '</td><td>' + esc(f.food) + '</td><td class="' + (f.reaction === 'severe' ? 'rp-hot' : '') + '">' + REACTION[f.reaction].label + '</td><td>' + esc(f.note || '') + '</td></tr>'), '') : '') +
      '<p class="rp-note">※ このまとめは家族の記録を集計したものです。医療的な診断ではありません。パーセンタイルはWHO Child Growth Standards(2006)に基づく目安で、日本の母子健康手帳の成長曲線とは基準が異なります。早産の場合は修正月齢でご判断ください。</p>' +
      '</article>';
  }

  async function loadReport() {
    const c = BA.child();
    const since = BA.dayStart(Date.now()) - 14 * BA.DAY;
    const [lg, gr, vc, fd] = await Promise.all([
      BA.api('GET', '/children/' + c.id + '/logs?from=' + since + '&limit=5000'),
      BA.api('GET', '/children/' + c.id + '/growth'),
      BA.api('GET', '/children/' + c.id + '/vaccinations'),
      BA.api('GET', '/children/' + c.id + '/foods')
    ]);
    return { logs: lg.logs, growth: gr.growth, vacs: vc.vaccinations, foods: fd.foods };
  }

  BA.openReport = async function () {
    try {
      BA.toast('まとめを作成中…', { ms: 1500 });
      BA.reportData = await loadReport();
      const root = $rp();
      root.innerHTML = buildReport(BA.reportData);
      root.classList.add('open');
      root.scrollTop = 0;
      document.body.classList.add('report-open');
      document.body.style.overflow = 'hidden';
    } catch (e) { BA.errToast(e); }
  };
  BA.reportDays = (n) => {
    rpState.days = n;
    const root = $rp();
    const top = root.scrollTop;
    root.innerHTML = buildReport(BA.reportData);
    root.scrollTop = top;
  };
  BA.closeReport = () => {
    const root = $rp();
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.classList.remove('report-open');
    document.body.style.overflow = '';
  };
  BA.printReport = () => window.print();
})();
