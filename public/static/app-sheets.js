/* すくすくログ - sheets: 入力用ボトムシート */
(function () {
  'use strict';
  const BA = window.BA;
  const esc = BA.esc;

  // handlers: { click(act, el), input(el) }
  function mountSheet(title, icon, st, render, actionsFactory) {
    const re = () => BA.setSheetBody(render());
    const actions = actionsFactory(re);
    BA.openSheet(title, icon, render(), {
      click(act, el) { if (actions[act]) actions[act](el); },
      change(el) { if (actions.change) actions.change(el); },
      input(el) {
        const k = el.dataset.bind;
        if (!k) return;
        let v = el.value;
        if (el.dataset.kind === 'dt') v = BA.fromLocalInput(v);
        else if (el.dataset.kind === 'num') v = v === '' ? null : Number(v);
        st[k] = v;
      }
    });
    return re;
  }
  const setErr = (m) => { const e = document.getElementById('sheet-err'); if (e) e.textContent = m || ''; };
  const iconHtml = (type) => {
    const t = BA.TYPES[type];
    return '<span class="log-ic" style="background:' + t.color + '"><i class="fas ' + t.icon + '"></i></span>';
  };
  const stepper = (valueHtml) =>
    '<div class="stepper"><button data-act="dec" aria-label="減らす">−</button>' +
    '<div class="val">' + valueHtml + '</div><button data-act="inc" aria-label="増やす">＋</button></div>';
  const seg = (name, options, current) =>
    '<div class="seg">' + options.map((o) =>
      '<button data-act="seg" data-name="' + name + '" data-val="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + esc(o[1]) + '</button>'
    ).join('') + '</div>';

  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { setErr(e.message); } finally { if (btn) btn.disabled = false; }
  }

  // ---------- 記録の入力・編集 ----------
  BA.openEntry = function (type, log) {
    const edit = !!log;
    const l = log ? BA.parseLog(log) : null;
    const lastOf = (BA.data.last && BA.data.last[type]) || null;
    const st = {
      started: l ? l.started_at : Date.now(),
      ended: l ? l.ended_at : null,
      amount: l && l.amount != null ? l.amount : (type === 'temp' ? 36.8 : (lastOf && lastOf.amount) || 80),
      side: l && l.d.side ? l.d.side : (BA.data.nextSide || 'left'),
      dur: 10,
      kind: l && l.d.kind ? l.d.kind : 'normal',
      medName: l && l.d.name ? l.d.name : '',
      note: l && l.note ? l.note : ''
    };
    if (type === 'breast' && l) st.dur = Math.max(0, Math.round(((l.ended_at == null ? Date.now() : l.ended_at) - l.started_at) / 60000));
    const t = BA.TYPES[type];

    const timeBlock = (label, bind, val) =>
      '<label class="field"><span>' + label + '</span><input type="datetime-local" data-bind="' + bind + '" data-kind="dt" value="' + (val ? BA.toLocalInput(val) : '') + '"></label>';
    const agoChips =
      '<div class="chips" style="margin:-6px 0 14px">' +
      [['いま', 0], ['5分前', 5], ['15分前', 15], ['30分前', 30], ['1時間前', 60]].map((a) =>
        '<button data-act="ago" data-min="' + a[1] + '">' + a[0] + '</button>').join('') + '</div>';

    function render() {
      let h = '';
      if (type === 'breast') {
        h += '<div class="field-label">どちら側</div>' + seg('side', [['left', '左'], ['right', '右'], ['both', '両方']], st.side);
        h += '<div style="height:14px"></div><div class="field-label">授乳時間</div>' +
          stepper(st.dur + '<small>分</small>') +
          '<div class="chips">' + [5, 10, 15, 20, 30].map((m) => '<button data-act="setdur" data-v="' + m + '">' + m + '分</button>').join('') + '</div>' +
          '<div style="height:14px"></div>';
      }
      if (type === 'formula' || type === 'expressed') {
        h += '<div class="field-label">量</div>' + stepper(st.amount + '<small>ml</small>') +
          '<div class="chips">' + [20, 40, 60, 80, 100, 120, 160, 200].map((m) => '<button data-act="setamt" data-v="' + m + '">' + m + '</button>').join('') + '</div>' +
          '<div style="height:14px"></div>';
      }
      if (type === 'temp') {
        h += '<div class="field-label">体温</div>' + stepper(Number(st.amount).toFixed(1) + '<small>℃</small>') +
          (st.amount >= 37.5 ? '<div class="notice warn" style="margin-top:12px">37.5℃以上です。生後3か月未満の発熱は早めに医療機関へ相談してください。</div>' : '') +
          '<div style="height:14px"></div>';
      }
      if (type === 'poop') {
        h += '<div class="field-label">うんちの状態</div>' +
          seg('kind', [['hard', 'かため'], ['normal', 'ふつう'], ['soft', 'やわらかい'], ['watery', '水っぽい']], st.kind) +
          '<div style="height:14px"></div>';
      }
      if (type === 'med') {
        h += '<label class="field"><span>薬の名前・量</span><input type="text" maxlength="60" data-bind="medName" value="' + esc(st.medName) + '" placeholder="例: アセトアミノフェン 3ml"></label>';
      }
      if (type === 'sleep') {
        h += timeBlock('ねた時刻', 'started', st.started) + agoChips;
        h += timeBlock('おきた時刻(空欄なら計測中)', 'ended', st.ended);
        h += '<div class="chips" style="margin:-6px 0 14px"><button data-act="endnow">いま起きた</button><button data-act="endclear">計測中にする</button></div>';
      } else if (type === 'breast' && !edit) {
        h += timeBlock('開始時刻', 'started', st.started) + agoChips;
      } else {
        h += timeBlock('時刻', 'started', st.started) + agoChips;
      }
      h += '<label class="field"><span>メモ' + (type === 'memo' ? '' : '(任意)') + '</span><textarea data-bind="note" maxlength="500" placeholder="気づいたことなど">' + esc(st.note) + '</textarea></label>';
      h += '<div class="error-text" id="sheet-err"></div>';
      if (edit) {
        h += '<div class="btn-row"><button class="btn danger" data-act="del"><i class="fas fa-trash"></i>削除</button><button class="btn primary" data-act="save">保存</button></div>';
      } else if (type === 'breast') {
        h += '<div class="btn-row"><button class="btn soft" data-act="timer"><i class="fas fa-stopwatch"></i>タイマー開始</button><button class="btn primary" data-act="save">記録する</button></div>';
      } else if (type === 'sleep') {
        h += '<div class="btn-row"><button class="btn primary" data-act="save">' + (st.ended ? '記録する' : 'ねんね開始') + '</button></div>';
      } else {
        h += '<button class="btn primary block" data-act="save">記録する</button>';
      }
      return h;
    }

    function body(timer) {
      const b = { type, started_at: st.started, ended_at: null, amount: null, detail: null, note: st.note ? st.note.trim() : null };
      if (!b.note) b.note = null;
      if (st.started == null) throw new Error('時刻を入力してください');
      if (type === 'breast') {
        b.detail = { side: st.side };
        if (timer) b.ended_at = null;
        else b.ended_at = st.started + st.dur * 60000;
      } else if (type === 'sleep') {
        b.ended_at = st.ended;
        if (b.ended_at != null && b.ended_at < b.started_at) throw new Error('おきた時刻は、ねた時刻より後にしてください');
      } else if (type === 'formula' || type === 'expressed') {
        if (!(st.amount > 0)) throw new Error('量を入力してください');
        b.amount = st.amount;
      } else if (type === 'temp') {
        b.amount = Math.round(st.amount * 10) / 10;
      } else if (type === 'poop') {
        b.detail = { kind: st.kind };
      } else if (type === 'med') {
        if (!st.medName || !st.medName.trim()) throw new Error('薬の名前を入力してください');
        b.detail = { name: st.medName.trim() };
      } else if (type === 'memo') {
        if (!b.note) throw new Error('メモを入力してください');
      }
      if (edit && type === 'breast' && l.ended_at == null && !timer) b.ended_at = st.started + st.dur * 60000;
      return b;
    }

    async function submit(btn, timer) {
      await guard(btn, async () => {
        setErr('');
        const b = body(timer);
        if (edit) await BA.api('PUT', '/logs/' + l.id, b);
        else await BA.api('POST', '/children/' + BA.child().id + '/logs', b);
        BA.closeSheet();
        BA.toast(edit ? '更新しました' : (timer ? '授乳タイマーを開始しました' : '記録しました'));
        await BA.refresh();
      });
    }

    const icon = iconHtml(type);
    mountSheet((edit ? t.label + 'を編集' : t.label + 'を記録'), icon, st, render, (re) => ({
      dec() {
        if (type === 'breast') st.dur = Math.max(0, st.dur - 1);
        else if (type === 'temp') st.amount = Math.max(34, Math.round((st.amount - 0.1) * 10) / 10);
        else st.amount = Math.max(0, st.amount - 10);
        re();
      },
      inc() {
        if (type === 'breast') st.dur = Math.min(180, st.dur + 1);
        else if (type === 'temp') st.amount = Math.min(42, Math.round((st.amount + 0.1) * 10) / 10);
        else st.amount = Math.min(1000, st.amount + 10);
        re();
      },
      setdur(el) { st.dur = Number(el.dataset.v); re(); },
      setamt(el) { st.amount = Number(el.dataset.v); re(); },
      seg(el) { st[el.dataset.name] = el.dataset.val; re(); },
      ago(el) { st.started = Date.now() - Number(el.dataset.min) * 60000; re(); },
      endnow() { st.ended = Date.now(); re(); },
      endclear() { st.ended = null; re(); },
      save(el) { submit(el, false); },
      timer(el) { submit(el, true); },
      del(el) {
        if (!confirm('この記録を削除しますか?')) return;
        guard(el, async () => {
          await BA.api('DELETE', '/logs/' + l.id);
          BA.closeSheet();
          BA.toast('削除しました');
          await BA.refresh();
        });
      }
    }));
  };

  // ---------- 記録の種類を選ぶ ----------
  BA.openTypePicker = function () {
    const types = Object.keys(BA.TYPES);
    const html = '<div class="type-grid">' + types.map((k) => {
      const t = BA.TYPES[k];
      return '<button class="qbtn" data-act="pick" data-type="' + k + '"><span class="qi" style="background:' + t.color + '"><i class="fas ' + t.icon + '"></i></span>' + t.label + '</button>';
    }).join('') + '</div>';
    BA.openSheet('なにを記録しますか?', '', html, {
      click(act, el) {
        if (act !== 'pick') return;
        const type = el.dataset.type;
        BA.closeSheet();
        BA.openEntry(type);
      },
      input() {}
    });
  };

  // ---------- 子ども ----------
  BA.openChildForm = function (child) {
    const edit = !!child;
    const st = {
      name: child ? child.name : '',
      birthday: child ? child.birthday : BA.ymd(Date.now()),
      gender: child ? child.gender : 'unknown'
    };
    function render() {
      return '<label class="field"><span>お名前(ニックネーム可)</span><input type="text" maxlength="30" data-bind="name" value="' + esc(st.name) + '" placeholder="例: はる"></label>' +
        '<label class="field"><span>生年月日(出産前なら出産予定日)</span><input type="date" data-bind="birthday" value="' + esc(st.birthday) + '"></label>' +
        '<div class="field-label">性別</div>' + seg('gender', [['boy', '男の子'], ['girl', '女の子'], ['unknown', '未設定']], st.gender) +
        '<div style="height:16px"></div><div class="error-text" id="sheet-err"></div>' +
        (edit
          ? '<div class="btn-row"><button class="btn danger" data-act="del"><i class="fas fa-trash"></i>削除</button><button class="btn primary" data-act="save">保存</button></div>'
          : '<button class="btn primary block" data-act="save">登録する</button>');
    }
    mountSheet(edit ? 'お子さんの情報' : 'お子さんを追加', '', st, render, (re) => ({
      seg(el) { st[el.dataset.name] = el.dataset.val; re(); },
      save(el) {
        guard(el, async () => {
          setErr('');
          if (!st.name.trim()) throw new Error('お名前を入力してください');
          if (!st.birthday) throw new Error('生年月日を入力してください');
          let id;
          if (edit) { await BA.api('PUT', '/children/' + child.id, st); id = child.id; }
          else { const r = await BA.api('POST', '/children', st); id = r.id; }
          BA.state.childId = id;
          BA.ls.set('ba_child', id);
          BA.closeSheet();
          await BA.reloadMe();
          BA.toast(edit ? '更新しました' : 'お子さんを登録しました');
          await BA.refresh();
        });
      },
      del(el) {
        if (!confirm(child.name + 'さんの記録をすべて削除します。元に戻せません。よろしいですか?')) return;
        guard(el, async () => {
          await BA.api('DELETE', '/children/' + child.id);
          BA.closeSheet();
          BA.state.childId = null;
          await BA.reloadMe();
          BA.toast('削除しました');
          await BA.refresh();
        });
      }
    }));
  };

  BA.openChildSwitcher = function () {
    const cs = BA.state.children;
    const cur = BA.child();
    const isViewer = BA.isViewer();
    const html = '<div class="log-list">' + cs.map((c) =>
      '<button class="log-row" data-act="choose" data-id="' + c.id + '">' +
      '<span class="log-ic" style="background:' + (c.id === (cur && cur.id) ? 'var(--primary)' : 'var(--sub)') + '"><i class="fas fa-baby"></i></span>' +
      '<span class="log-main"><span class="log-title">' + esc(c.name) + '</span><br><span class="log-sub">' + esc(BA.ageText(c.birthday)) + '</span></span>' +
      (c.id === (cur && cur.id) ? '<i class="fas fa-check" style="color:var(--primary)"></i>' : '') +
      '</button>').join('') + '</div>' +
      (isViewer ? '' : '<div style="height:12px"></div><div class="btn-row"><button class="btn" data-act="edit"><i class="fas fa-pen"></i>情報を編集</button><button class="btn primary" data-act="add"><i class="fas fa-plus"></i>追加</button></div>');
    BA.openSheet('お子さんを選ぶ', '', html, {
      click(act, el) {
        if (act === 'choose') {
          BA.state.childId = el.dataset.id;
          BA.ls.set('ba_child', el.dataset.id);
          BA.closeSheet();
          BA.refresh();
        } else if (act === 'add') { BA.closeSheet(); BA.openChildForm(null); }
        else if (act === 'edit') { BA.closeSheet(); BA.openChildForm(cur); }
      },
      input() {}
    });
  };

  // ---------- 記録の詳細(閲覧専用用) ----------
  BA.openLogDetail = function (log) {
    const l = BA.parseLog(log);
    const d = BA.describe(l);
    const t = BA.TYPES[l.type];
    let time = BA.clock(l.started_at);
    if (l.type === 'sleep' && l.ended_at != null) time += ' – ' + BA.clock(l.ended_at);
    const who = BA.memberName(l.member_id);

    function render() {
      return '<div class="card" style="margin:0 0 14px;box-shadow:none;border:1px solid var(--line)">' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px">' + esc(d.title) + '</div>' +
        '<div class="muted" style="margin-bottom:6px"><i class="fas fa-clock"></i> ' + esc(time) + '</div>' +
        (d.sub ? '<div style="margin-bottom:6px"><i class="fas fa-circle-info"></i> ' + esc(d.sub) + '</div>' : '') +
        (who ? '<div class="muted" style="font-size:12px"><i class="fas fa-user"></i> 記録した人: ' + esc(who) + '</div>' : '') +
        '</div>' +
        '<button class="btn block" data-act="close"><i class="fas fa-xmark"></i>閉じる</button>';
    }
    BA.openSheet(t.label + 'の詳細', iconHtml(l.type), render(), {
      click(act) { if (act === 'close') BA.closeSheet(); },
      input() {}
    });
  };

  // ---------- 成長記録 ----------
  BA.openGrowthForm = function () {
    const last = (BA.data.growth || []).slice(-1)[0];
    const st = { date: BA.ymd(Date.now()), weight: null, height: null, head: null, note: '' };
    function render() {
      return '<label class="field"><span>測定日</span><input type="date" data-bind="date" value="' + esc(st.date) + '"></label>' +
        '<label class="field"><span>体重(g)' + (last && last.weight_g ? ' 前回 ' + last.weight_g + 'g' : '') + '</span><input type="number" inputmode="numeric" min="300" max="40000" step="1" data-bind="weight" data-kind="num" placeholder="例: 3250"></label>' +
        '<label class="field"><span>身長(cm)' + (last && last.height_cm ? ' 前回 ' + last.height_cm + 'cm' : '') + '</span><input type="number" inputmode="decimal" min="20" max="150" step="0.1" data-bind="height" data-kind="num" placeholder="例: 50.5"></label>' +
        '<label class="field"><span>頭囲(cm)(任意)</span><input type="number" inputmode="decimal" min="20" max="70" step="0.1" data-bind="head" data-kind="num" placeholder="例: 34.0"></label>' +
        '<label class="field"><span>メモ(任意)</span><input type="text" maxlength="200" data-bind="note" placeholder="例: 1か月健診"></label>' +
        '<div class="error-text" id="sheet-err"></div>' +
        '<button class="btn primary block" data-act="save">記録する</button>';
    }
    mountSheet('成長を記録', '', st, render, () => ({
      save(el) {
        guard(el, async () => {
          setErr('');
          if (st.weight == null && st.height == null && st.head == null) throw new Error('体重・身長・頭囲のいずれかを入力してください');
          await BA.api('POST', '/children/' + BA.child().id + '/growth', {
            measured_on: st.date, weight_g: st.weight, height_cm: st.height, head_cm: st.head, note: st.note
          });
          BA.closeSheet();
          BA.toast('記録しました');
          await BA.refresh();
        });
      }
    }));
  };

  // ---------- 予防接種 ----------
  BA.openVaccine = function (row) {
    if (BA.isViewer()) {
      const range = BA.ymd(row.startDate.getTime()) + ' 〜 ' + BA.ymd(row.endDate.getTime());
      function renderView() {
        return '<p class="muted" style="margin-bottom:12px">標準的な時期の目安: ' + esc(range) + (row.note ? '<br>' + esc(row.note) : '') + '</p>' +
          (row.doneOn
            ? '<div class="notice" style="margin-bottom:12px"><i class="fas fa-check" style="color:var(--ok)"></i> 接種日: <b>' + esc(row.doneOn.replace(/-/g, '/')) + '</b> (接種済み)</div>'
            : '<div class="notice" style="margin-bottom:12px"><i class="fas fa-clock" style="color:var(--sub)"></i> 未接種</div>') +
          '<button class="btn block" data-act="close"><i class="fas fa-xmark"></i>閉じる</button>' +
          '<p class="disclaimer" style="margin-top:12px">実際の接種時期・間隔は、かかりつけ医や自治体の案内に従ってください。</p>';
      }
      BA.openSheet(row.name, '', renderView(), {
        click(act) { if (act === 'close') BA.closeSheet(); },
        input() {}
      });
      return;
    }
    const st = { date: row.doneOn || BA.ymd(Date.now()) };
    const range = BA.ymd(row.startDate.getTime()) + ' 〜 ' + BA.ymd(row.endDate.getTime());
    function render() {
      return '<p class="muted" style="margin-bottom:12px">標準的な時期の目安: ' + esc(range) + (row.note ? '<br>' + esc(row.note) : '') + '</p>' +
        '<label class="field"><span>接種日</span><input type="date" data-bind="date" value="' + esc(st.date) + '"></label>' +
        '<div class="error-text" id="sheet-err"></div>' +
        (row.doneOn
          ? '<div class="btn-row"><button class="btn danger" data-act="undo">未接種に戻す</button><button class="btn primary" data-act="save">日付を更新</button></div>'
          : '<button class="btn primary block" data-act="save"><i class="fas fa-syringe"></i>接種済みにする</button>') +
        '<p class="disclaimer" style="margin-top:12px">実際の接種時期・間隔は、かかりつけ医や自治体の案内に従ってください。</p>';
    }
    mountSheet(row.name, '', st, render, () => ({
      save(el) {
        guard(el, async () => {
          setErr('');
          if (!st.date) throw new Error('接種日を入力してください');
          await BA.api('PUT', '/children/' + BA.child().id + '/vaccinations/' + row.key, { done_on: st.date });
          BA.closeSheet();
          BA.toast('記録しました');
          await BA.refresh();
        });
      },
      undo(el) {
        guard(el, async () => {
          await BA.api('DELETE', '/children/' + BA.child().id + '/vaccinations/' + row.key);
          BA.closeSheet();
          BA.toast('未接種に戻しました');
          await BA.refresh();
        });
      }
    }));
  };

  // ---------- ワンタップ操作 ----------
  BA.quickRecord = async function (type, detail) {
    const c = BA.child();
    if (!c) return;
    try {
      const r = await BA.api('POST', '/children/' + c.id + '/logs', {
        type, started_at: Date.now(), ended_at: null, amount: null, detail: detail || null, note: null
      });
      BA.toast(BA.TYPES[type].label + 'を記録しました', {
        action: '取り消す',
        onAction: async () => {
          try { await BA.api('DELETE', '/logs/' + r.id); await BA.refresh(); } catch (e) { BA.errToast(e); }
        }
      });
      await BA.refresh();
    } catch (e) { BA.errToast(e); }
  };

  const putLog = (l, patch) => {
    const x = BA.parseLog(l);
    return BA.api('PUT', '/logs/' + l.id, Object.assign({
      type: l.type, started_at: l.started_at, ended_at: l.ended_at, amount: l.amount, detail: x.d, note: l.note
    }, patch));
  };

  BA.toggleSleep = async function () {
    const c = BA.child();
    if (!c) return;
    const running = (BA.data.logs || []).find((l) => l.type === 'sleep' && l.ended_at == null);
    try {
      if (running) {
        await putLog(running, { ended_at: Date.now() });
        BA.toast('おはよう。睡眠を記録しました');
      } else {
        const r = await BA.api('POST', '/children/' + c.id + '/logs', {
          type: 'sleep', started_at: Date.now(), ended_at: null, amount: null, detail: null, note: null
        });
        BA.toast('おやすみ。睡眠を計測中です', {
          action: '取り消す',
          onAction: async () => { try { await BA.api('DELETE', '/logs/' + r.id); await BA.refresh(); } catch (e) { BA.errToast(e); } }
        });
      }
      await BA.refresh();
    } catch (e) { BA.errToast(e); }
  };

  BA.stopTimer = async function (id) {
    const l = (BA.data.logs || []).find((x) => x.id === id);
    if (!l) return;
    try {
      await putLog(l, { ended_at: Date.now() });
      BA.toast(BA.TYPES[l.type].label + 'を記録しました');
      await BA.refresh();
    } catch (e) { BA.errToast(e); }
  };

  BA.cancelTimer = async function (id) {
    if (!confirm('この計測を破棄しますか?')) return;
    try { await BA.api('DELETE', '/logs/' + id); await BA.refresh(); } catch (e) { BA.errToast(e); }
  };

  BA.ui = { mountSheet, setErr, guard, seg, stepper, iconHtml };
})();
