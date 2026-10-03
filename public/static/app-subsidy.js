/* すくすくログ - 国・都道府県の補助と手続きの案内(静的データ。最終確認日あり) */
(function () {
  'use strict';
  const BA = window.BA;
  const V = BA.views;
  const esc = BA.esc;

  // 掲載内容を最後に公式ページで確認した日。制度を更新したらここも更新する
  const AS_OF = '2026年10月3日';
  const DAY = 86400000;

  const L = (label, url) => ({ label, url });
  const fmtMD = (d) => (d.getMonth() + 1) + '月' + d.getDate() + '日';
  const plusDays = (birthday, n) => new Date(BA.parseYMD(birthday).getTime() + n * DAY);
  const daysLeft = (d) => {
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((d - today) / DAY);
  };

  // phase: [from, to] = 生後日数(負の値は誕生前)。この範囲なら「いま確認したいこと」に出す
  // apply: 'need' = 申請・届出が必要 / 'auto' = 原則申請不要 / 'plan' = 予定(未確定)
  const NATIONAL = [
    {
      id: 'birth-reg', cat: '手続き', title: '出生届', apply: 'need', phase: [-30, 14],
      amount: '— (すべての手続きの出発点)',
      body: '出生の日から14日以内に、市区町村の窓口へ提出します。児童手当・医療証・健康保険など、ほかの手続きもここから始まります。',
      deadline: (b) => ({ date: plusDays(b, 14), note: '出生の日から14日以内' }),
      links: []
    },
    {
      id: 'jidou', cat: 'お金', title: '児童手当', apply: 'need', phase: [-30, 90],
      amount: '3歳未満は月15,000円(第3子以降は月30,000円)。3歳〜高校生年代は月10,000円(第3子以降は月30,000円)。所得制限なし',
      body: '0歳から高校生年代(18歳になった年度末)までの子を養育している人に、偶数月(2・4・6・8・10・12月)に2か月分ずつ支給されます。公務員の場合は勤務先に申請します。',
      how: '現在住んでいる市区町村へ「認定請求書」を提出します。里帰り出産でも、住民票のある市区町村へ。',
      deadline: (b) => ({ date: plusDays(b, 15), note: '出生の翌日から15日以内に申請すれば、出生した月分から受け取れます。遅れると、遅れた月分は原則受け取れません(申請した月の翌月分からの支給になります)' }),
      links: [L('こども家庭庁: 児童手当制度のご案内', 'https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai')]
    },
    {
      id: 'ninpu', cat: 'お金', title: '妊婦のための支援給付', apply: 'need', phase: [-300, 365],
      amount: '合計10万円(妊娠の認定後に5万円、出産(予定)後の届出で「胎児の数×5万円」)',
      body: '妊娠中から出産後にかけて、市区町村での面談(伴走型相談支援)とあわせて受け取れる給付金です。',
      how: '妊娠の届出時などに、お住まいの市区町村の窓口に申請します。申請の期限や時期は市区町村によって異なるので、出産後でまだの場合は早めに窓口へ。',
      links: [L('こども家庭庁: 妊婦のための支援給付', 'https://www.cfa.go.jp/policies/shussan-kosodate')]
    },
    {
      id: 'ichijikin', cat: 'お金', title: '出産育児一時金', apply: 'need', phase: [-300, 730],
      amount: '子ども1人につき原則50万円',
      body: '公的医療保険に加入している人が出産したときに、加入先の保険者(健保組合・協会けんぽ・国保など)から支給されます。多くの医療機関では「直接支払制度」で、病院への支払いに直接充てられ、差額だけ精算します。',
      how: '直接支払制度を使う場合は、医療機関で同意書にサインするだけ。差額が出た場合の請求は加入先の保険者へ(請求できる期間には期限があります)。',
      links: [L('厚生労働省: 出産育児一時金等について', 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/shussan/index.html')]
    },
    {
      id: 'free-birth', cat: 'お金', title: '出産費用の無償化(予定)', apply: 'plan', phase: [-300, 0],
      amount: '詳細は今後決定',
      body: '出産費用を公的保険から給付して自己負担をなくす法改正が2026年に成立しました。施行は2028年ごろまでの見込みで、全国一律の価格などの詳細はこれから決まります。現行の出産育児一時金は当面あわせて残る方針と報じられています。',
      how: '現時点では、上記の出産育児一時金を前提に準備してください。最新の情報は厚生労働省のページで確認できます。',
      links: [L('厚生労働省: 出産育児一時金等について', 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/shussan/index.html')]
    },
    {
      id: 'ikukyu', cat: '仕事', title: '育児休業給付金・出生後休業支援給付金', apply: 'need', phase: [-120, 365],
      amount: '育休中は休業前賃金の約67%(180日まで。それ以降は50%)。さらに条件を満たすと最大28日間は13%が上乗せされ、合計80%(手取りで約10割相当)',
      body: '雇用保険に加入している人が育児休業を取ったときの給付です。上乗せ(出生後休業支援給付金)は、子の出生後の一定期間内に、両親がそれぞれ14日以上の育休を取るなどの条件があります。',
      how: '会社(事業主)を通じてハローワークへ申請するのが一般的です。早めに勤務先の担当者に相談してください。厚生労働省に要件の簡易診断ツールがあります。',
      links: [
        L('厚生労働省: 育児休業等給付について', 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html'),
        L('出生後休業支援給付の簡易診断ツール', 'https://www.mhlw.go.jp/stf/syussyougo_kanishindan_00001.html')
      ]
    },
    {
      id: 'jitan', cat: '仕事', title: '育児時短就業給付金', apply: 'need', phase: [180, 730],
      amount: '時短勤務中の賃金額の10%',
      body: '2歳未満の子を育てるために時短勤務をしている雇用保険の加入者に支給されます。',
      how: '会社(事業主)を通じてハローワークへ申請します。勤務先の担当者に確認してください。',
      links: [L('厚生労働省: 育児休業等給付について', 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html')]
    },
    {
      id: 'nenkin', cat: 'お金', title: '国民年金保険料の育児免除(2026年10月〜)', apply: 'need', phase: [-60, 365],
      amount: '1歳になる誕生日の前月まで(最大12か月)、国民年金保険料が免除。免除期間は納付したものとして年金額に反映',
      body: '自営業・フリーランス・学生などの国民年金「第1号被保険者」が対象で、所得制限はありません。会社員や公務員(第2号)、その扶養配偶者(第3号)は対象外です。産前産後免除を受けた実母は、その後の9か月間が対象になります。',
      how: '市区町村の国民年金窓口へ届出(郵送可)、またはマイナポータルから電子申請。産前産後免除の届出済みでマイナンバー連携で確認できる場合は、届出が不要なことがあります。',
      links: [L('日本年金機構: 国民年金保険料の育児免除制度', 'https://www.nenkin.go.jp/service/kokunen/menjo/ikujimenjo.html')]
    },
    {
      id: 'daretsu', cat: '預け先', title: 'こども誰でも通園制度', apply: 'need', phase: [180, 1095],
      amount: '月10時間までの利用枠(利用料は自治体・施設で異なる)',
      body: '保育所などに通っていない生後6か月〜満3歳未満の子が、親の就労にかかわらず、時間単位で保育所などを定期的に利用できる制度です。',
      how: '実施の状況や申込方法は市区町村ごとに異なります。お住まいの市区町村のページや、制度のポータルサイトで確認してください。',
      links: [
        L('こども家庭庁: こども誰でも通園制度', 'https://www.cfa.go.jp/policies/hoiku/daredemo-tsuen'),
        L('こども誰でも通園制度ポータル', 'https://www.daretsu.cfa.go.jp/')
      ]
    },
    {
      id: 'mushouka', cat: '預け先', title: '幼児教育・保育の無償化(国の制度)', apply: 'need', phase: [730, 1100],
      amount: '3〜5歳の認可保育所・幼稚園などの利用料が無償。0〜2歳は住民税非課税世帯が対象(第2子以降の軽減もあり)',
      body: '3歳になった後の最初の4月1日から(幼稚園などは3歳になった日から)対象になります。認可外施設などは上限つきです。',
      how: '保育所は入所手続きの中で、幼稚園・認可外施設は市区町村への認定申請が必要です。',
      links: [L('こども家庭庁: 幼児教育・保育の無償化', 'https://www.cfa.go.jp/policies/kokoseido/mushouka/gaiyou')]
    },
    {
      id: 'iryohi', cat: '税金', title: '医療費控除(確定申告)', apply: 'need', phase: [-300, 2000],
      amount: '1年間の医療費が合計10万円(所得が200万円未満なら所得の5%)を超えた分を、所得から控除',
      body: '出産費用(一時金などを引いた自己負担分)、通院の交通費、家族全員分を合計できます。領収書は5年間保管します。マイナ保険証を使うと、確定申告で医療費通知を使えます。',
      how: '翌年の確定申告で申告します(還付申告は5年間さかのぼれます)。',
      links: [L('国税庁: 医療費控除', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm')]
    }
  ];

  const TOKYO = [
    {
      id: 'tokyo-018', cat: 'お金', title: '018サポート(東京都)', apply: 'need', phase: [-30, 365],
      amount: '0〜18歳(18歳になった年度末まで)の子1人あたり月額5,000円(年額最大6万円)。所得制限なし',
      body: '都内に住所のある子が対象。毎月1日時点の在住状況で計算し、年3回(8月・12月・4月)に分けて支給されます。年度の途中に生まれた・転入した場合も、在住した月数に応じて支給されます。',
      how: '「東京都018サポートポータルサイト」から申請します。親子ともマイナンバーカードがあり公金受取口座を登録している場合は、書類の添付が省略できます。いちど申請・受給していれば、原則として毎年の再申請は不要です。',
      links: [
        L('018サポート ポータルサイト', 'https://018support.metro.tokyo.lg.jp/'),
        L('東京都福祉局: 018サポート', 'https://www.fukushi.metro.tokyo.lg.jp/kodomo/kosodate/018')
      ],
      note: '電話・メール・SMSで振込や暗証番号を求められたら詐欺です。申請サイトのURLが「metro.tokyo.lg.jp」であることを確認してください。コールセンター: 0120-056-018'
    },
    {
      id: 'tokyo-plus', cat: 'お金', title: '子育て応援+(プラス)(東京都)', apply: 'auto', phase: [-30, 365],
      amount: '子ども1人あたり11,000円(1回)',
      body: '2026年2月2日〜2027年4月1日の間に0〜14歳の都民が対象。018サポートの仕組みを使った「申請不要」の給付で、018サポートを申請していれば一緒に支給されます。',
      how: '018サポートを申請すれば、初回の支給日に一緒に振り込まれます(別の申請は不要)。',
      links: [L('東京都福祉局: 018サポート(子育て応援+)', 'https://www.fukushi.metro.tokyo.lg.jp/kodomo/kosodate/018')]
    },
    {
      id: 'tokyo-hoiku', cat: '預け先', title: '第1子の保育料の無償化(東京都の区市町村への支援)', apply: 'need', phase: [150, 1100],
      amount: '認可保育所などの0〜2歳児クラスの第1子の保育料が、所得制限なしで無償(2025年9月〜)',
      body: '東京都が支援して区市町村が実施する制度で、実施の有無や対象施設・手続きは区市町村ごとに異なります。3〜5歳は国の無償化制度です。',
      how: 'お住まいの区市町村の保育担当窓口やホームページで確認してください。',
      links: [L('東京都福祉局: 保育料等の無償化について', 'https://www.fukushi.metro.tokyo.lg.jp/kodomo/hoiku/mushouka')]
    },
    {
      id: 'tokyo-mutsu', cat: 'お金', title: '無痛分娩の費用助成(東京都)', apply: 'need', phase: [-300, 365],
      amount: '最大10万円',
      body: '2025年10月1日以降に、東京都が公表する「対象医療機関」で硬膜外麻酔などによる無痛分娩をした都民が対象です。妊娠の届出から申請日まで継続して都内に住民登録があることなどの条件があります。室料差額・食事代などは対象外です。',
      how: '電子申請(郵送不可)。領収書・明細書(無痛分娩の費用が分かるもの)などが必要です。',
      deadline: (b) => { const d = BA.parseYMD(b); d.setFullYear(d.getFullYear() + 1); return { date: d, note: '出産日の翌日から1年以内(厳守)' }; },
      links: [L('東京都福祉局: 無痛分娩費用の助成', 'https://www.fukushi.metro.tokyo.lg.jp/kodomo/shussan/mutsubunben/subsidy')],
      note: 'コールセンター: 0120-620-620(平日9〜17時)'
    }
  ];

  const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];

  const MUNI = [
    ['子ども医療費の助成', '通院・入院の自己負担が無料または一部負担になる制度です。対象年齢や所得制限は市区町村で大きく違います。「医療証」の手続きを忘れずに。'],
    ['産後ケア事業', '助産師などによる宿泊・日帰り・訪問のケア。利用料の補助は市区町村で異なります。'],
    ['保育料の軽減・一時預かり・ファミリーサポート', '多子世帯の軽減、一時預かりやファミサポの利用料補助など、独自の制度がある市区町村があります。'],
    ['おむつ・ベビー用品などの支給、出産祝い', '現物やクーポン、独自の給付を行う市区町村があります。'],
    ['予防接種の助成', '定期接種は無料ですが、おたふくかぜなどの任意接種を助成する市区町村があります(予防接種は「健康」タブのスケジュールも参照)。']
  ];

  // ---------- 状態 ----------
  const getPref = () => BA.ls.get('ba_pref') || '';
  const st = BA.state;

  function relevantNow(it, days) {
    return days >= it.phase[0] && days <= it.phase[1];
  }

  function badge(it) {
    if (it.apply === 'auto') return '<span class="badge now">申請不要</span>';
    if (it.apply === 'plan') return '<span class="badge opt">予定</span>';
    return '<span class="badge">申請が必要</span>';
  }

  function itemHtml(it, ch, days, urgentOk) {
    let dl = '';
    let tag = '';
    if (it.deadline && ch) {
      const d = it.deadline(ch.birthday);
      const left = daysLeft(d.date);
      const when = fmtMD(d.date) + (left >= 0 ? '(あと' + left + '日)' : '(過ぎています)');
      dl = '<p class="sub-row"><b>期限の目安</b>' + esc(when) + '<br><span class="muted">' + esc(d.note) + '</span></p>';
      if (urgentOk) {
        if (left >= 0 && left <= 14) tag = '<span class="badge now">' + (left === 0 ? '今日まで' : 'あと' + left + '日') + '</span>';
        else if (left < 0) tag = '<span class="badge late">期限超過</span>';
      }
    }
    return '<details class="fold sub-item" id="sub-' + it.id + '"><summary><span class="sub-t">' + esc(it.title) + '</span>' + tag + badge(it) + '</summary>' +
      '<div class="sub-body">' +
      '<p class="sub-row"><b>金額・内容</b>' + esc(it.amount) + '</p>' +
      '<p class="sub-row">' + esc(it.body) + '</p>' +
      (it.how ? '<p class="sub-row"><b>手続き</b>' + esc(it.how) + '</p>' : '') +
      dl +
      (it.note ? '<p class="sub-row muted">' + esc(it.note) + '</p>' : '') +
      '<div class="sub-links">' + it.links.map((l) => '<a class="link-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> ' + esc(l.label) + '</a>').join('') + '</div>' +
      '</div></details>';
  }

  function section(title, icon, items, ch, days, urgentOk, lead) {
    if (!items.length) return '';
    return '<section class="card sub-list"><h2><i class="fas ' + icon + '" style="color:var(--primary)"></i>' + esc(title) + '</h2>' +
      (lead ? '<p class="muted" style="margin-bottom:6px">' + lead + '</p>' : '') +
      items.map((it) => itemHtml(it, ch, days, urgentOk)).join('') + '</section>';
  }

  V.subsidyBody = function () {
    const ch = BA.child();
    const days = ch ? Math.round((Date.now() - BA.parseYMD(ch.birthday).getTime()) / DAY) : 0;
    const pref = getPref();
    const isTokyo = pref === '東京都';
    const nowNat = NATIONAL.filter((it) => relevantNow(it, days));
    const restNat = NATIONAL.filter((it) => !relevantNow(it, days));
    const nowTky = isTokyo ? TOKYO.filter((it) => relevantNow(it, days)) : [];
    const restTky = isTokyo ? TOKYO.filter((it) => !relevantNow(it, days)) : [];

    const prefSel = '<section class="card"><h2><i class="fas fa-hand-holding-heart" style="color:var(--primary)"></i>国・都道府県の補助と手続き</h2>' +
      '<p class="muted" style="margin-bottom:10px">お子さんの月齢に合わせて、確認したい制度を並べています。内容は <b>' + AS_OF + '</b> 時点で公式ページを確認したものです。</p>' +
      '<label class="field"><span>お住まいの都道府県(この端末だけに保存)</span><select id="pref-select" aria-label="お住まいの都道府県">' +
      '<option value="">選んでください</option>' + PREFS.map((p) => '<option value="' + p + '"' + (p === pref ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label>' +
      (pref && !isTokyo ? '<div class="notice" style="margin:10px 0 0">' + esc(pref) + 'の独自の制度は、まだこのアプリに載せていません。国の制度(全国共通)は下に載っています。' +
        '<br><a class="link-btn" href="https://www.google.com/search?q=' + encodeURIComponent(pref + ' 子育て 支援 給付金 補助') + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-magnifying-glass"></i> ' + esc(pref) + 'の子育て支援を検索</a></div>' : '') +
      (!pref ? '<p class="muted" style="margin-top:8px">都道府県を選ぶと、その都道府県の制度も表示します(現在は東京都に対応)。</p>' : '') +
      '</section>';

    const nowAll = nowNat.concat(nowTky);
    // 期限のあるものを先に
    nowAll.sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1));
    const nowSec = section('いま確認したいこと', 'fa-bell', nowAll, ch, days, true,
      ch ? esc(ch.name) + 'さん(' + esc(BA.ageText(ch.birthday)) + ')に関係しそうな制度です。' : '');
    const natSec = section('そのほかの国の制度(全国共通)', 'fa-landmark', restNat, ch, days, false);
    const tkySec = isTokyo ? section('東京都の制度(そのほか)', 'fa-city', restTky, ch, days, false) : '';

    const muni = '<section class="card sub-list"><h2><i class="fas fa-building-columns" style="color:var(--primary)"></i>お住まいの市区町村で確認</h2>' +
      '<p class="muted" style="margin-bottom:6px">実際の窓口や独自の上乗せは、市区町村ごとに違います。「○○市 子育て 支援」で検索するか、役所の子育て窓口・母子手帳の資料で確認してください。</p>' +
      MUNI.map((m) => '<details class="fold sub-item"><summary><span class="sub-t">' + esc(m[0]) + '</span></summary><div class="sub-body"><p class="sub-row">' + esc(m[1]) + '</p></div></details>').join('') + '</section>';

    const disc = '<p class="disclaimer">ここに載せた金額・条件・期限は、国や自治体の公式ページをもとにした目安です(' + AS_OF + '時点)。制度は毎年のように改正され、所得や就労形態、お住まいの自治体によって対象や手続きが変わります。申請の前に、必ずリンク先の公式ページか役所の窓口で最新の内容をご確認ください。このアプリは申請の代行や受給の保証をするものではありません。</p>';

    return prefSel + nowSec + natSec + tkySec + muni + disc;
  };

  // 都道府県の選択
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el instanceof Element && el.id === 'pref-select') {
      if (el.value) BA.ls.set('ba_pref', el.value); else BA.ls.del('ba_pref');
      BA.render();
    }
  });

  // ホーム用: 児童手当などの期限が近いときのお知らせ
  V.subsidyHint = function () {
    const ch = BA.child();
    if (!ch) return '';
    const days = Math.round((Date.now() - BA.parseYMD(ch.birthday).getTime()) / DAY);
    if (days < 0 || days > 14) return '';
    const left = daysLeft(plusDays(ch.birthday, 15));
    if (left < 0) return '';
    return '<section class="card" aria-label="手続きのお知らせ"><button class="sub-hint" data-act="opensubsidy" data-id="jidou">' +
      '<span class="qi" style="background:var(--warn)"><i class="fas fa-file-signature"></i></span>' +
      '<span class="sub-hint-t"><b>児童手当の申請期限が近づいています</b><br><span class="muted">' + fmtMD(plusDays(ch.birthday, 15)) + 'まで(' + (left === 0 ? '今日' : 'あと' + left + '日') + ')。補助・手続きの一覧を見る</span></span>' +
      '<i class="fas fa-chevron-right" style="color:var(--sub)"></i></button></section>';
  };

  BA.subsidyInfo = { AS_OF, NATIONAL, TOKYO };
})();
