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

  // 江東区(2026年10月3日に区の公式ページで確認)
  const KOTO = [
    {
      id: 'koto-iryo', cat: 'お金', title: '子ども医療費助成・マル乳医療証(江東区)', apply: 'need', phase: [-30, 2000],
      amount: '18歳到達後の最初の3月31日まで、保険診療の自己負担分を区が助成。保護者の所得制限なし(就学前は「マル乳医療証」)',
      body: '助成を受けるには医療証の交付申請が必要です。医療証は東京都内のほとんどの医療機関で、健康保険証(マイナ保険証など)と一緒に出して使います。毎年10月1日に更新され、2026年10月1日からは緑色の医療証です(新しい医療証は9月11日以降に順次到着)。',
      how: '区役所3階14番(こども家庭支援課給付係)か、豊洲シビックセンター3階の窓口で申請。マイナポータル(ぴったりサービス)の電子申請や郵送も使えます。出生直後で保険情報がまだ手元にない場合は、お子さんが加入予定の保護者の書類で代用できます。',
      links: [
        L('江東区: 子ども医療費助成', 'https://www.city.koto.lg.jp/281011/kodomo/kosodate/teate/5844.html'),
        L('江東区: 児童手当・子ども医療費助成の電子申請', 'https://www.city.koto.lg.jp/281011/20171121.html')
      ],
      note: '健康診断・予防接種・差額ベッド代・入院時の食事代などは対象外です。東京都外の医療機関で受診したときなど、医療証が使えずに支払った分は、受診日の翌日から5年以内に区へ還付申請できます。'
    },
    {
      id: 'koto-ninpu', cat: 'お金', title: '出産・子育て応援給付金の申請(江東区)', apply: 'need', phase: [-300, 730],
      amount: '1回目(出産前)妊婦1人あたり5万円、2回目(出産後)お子さん1人につき5万円。現金(口座振込)またはギフトカード',
      body: '国の「妊婦のための支援給付」を江東区で受け取る制度です。申請から約2か月で、妊産婦さん本人名義の口座に振り込まれます(配偶者名義は不可)。',
      how: '1回目は「ゆりかご面接」の後に渡される案内に沿って、2回目は「新生児・産婦訪問」のときに渡される案内に沿って申請します。案内を受け取っていない場合は、区の出産・子育て応援給付金コールセンターへ。',
      links: [L('江東区: 出産・子育て応援給付金(妊婦のための支援給付)', 'https://www.city.koto.lg.jp/260501/kodomo/ninshinshussan/ninshin/97552.html')],
      note: '申請期限は、1回目が胎児の心拍が確認された受診日から2年間、2回目が出産予定日の8週間前から2年間です。'
    },
    {
      id: 'koto-sango', cat: '健康', title: '産後ケア事業(江東区)', apply: 'need', phase: [-300, 365],
      amount: '宿泊型は1泊2日9,800円〜5泊6日29,400円(2026年4月から。住民税非課税世帯・生活保護世帯は減免あり)。5泊6日まで分割して利用可',
      body: '助産所などの施設で、助産師から母子のケア、授乳・育児の指導を受けられます。宿泊型・日帰り型は産後4か月未満(施設により受入月齢が違います)、スポット型・訪問型は産後1年未満が対象です。',
      how: '妊娠届を出したあとの「ゆりかご面接」で、全員が申し込めて承認番号が発行されます。利用は、出産の翌日以降に、利用したい施設へ直接電話かホームページで予約します。母子健康手帳などを持参し、利用当日に負担金を施設に支払います。',
      links: [
        L('江東区: 産後ケア事業', 'https://www.city.koto.lg.jp/260501/kodomo/ninshinshussan/kenko/99710.html'),
        L('江東区: 宿泊型産後ケア', 'https://www.city.koto.lg.jp/260501/kodomo/ninshinshussan/kenko/99711.html')
      ],
      note: '施設によって追加料金が発生することがあります。予約のキャンセルは利用前日の午前10時までに(施設により異なる)。'
    },
    {
      id: 'koto-kaji', cat: '預け先', title: 'こうとう家事・育児サポート事業', apply: 'need', phase: [-300, 1095],
      amount: '利用料は1時間500円。上限は子1人あたり、妊娠中〜0歳が90時間、1・2歳が30時間(0歳の弟妹がいる場合は90時間)',
      body: '妊娠中または3歳未満のお子さんを育てている区内のご家庭に、訪問支援者が来て、掃除・洗濯・調理などの家事や、授乳の見守り、沐浴のサポートをしてくれます。2026年8月1日から妊娠中の方も対象になり、上限時間も増えました。双子などの多胎児家庭は別の事業(多胎児家庭向け)です。',
      how: '区へ利用登録の申請(原則は電子申請)→ 約1週間〜10日で決定通知が郵送 → 委託事業者(パソナライフケア)のページから、希望日の1週間以上前に予約。1回2時間以上・1時間単位で、利用は午前9時〜午後9時です。',
      links: [
        L('江東区: こうとう家事・育児サポート事業', 'https://www.city.koto.lg.jp/281012/kajiikuji-kateihoumon.html'),
        L('江東区: 多胎児家庭向けの事業', 'https://www.city.koto.lg.jp/281012/tataizishien2.html')
      ],
      note: '予約は混み合っています。前日の午後5時以降のキャンセルは、1,000円のキャンセル料と2時間分の利用時間の消費があります。'
    },
    {
      id: 'koto-sitter', cat: '預け先', title: 'ベビーシッター利用支援事業(江東区)', apply: 'need', phase: [0, 2190],
      amount: '東京都認定事業者の利用料を、1時間2,500円まで(22時〜翌7時は3,500円まで)補助。子1人あたり年度内144時間まで(多胎児・障害児・ひとり親は288時間)',
      body: '未就学児を育てる、保護者・お子さんとも区内に住民登録がある方が対象です。区への事前申請は不要で、リフレッシュや急な用事など目的は問いません。育休中や保育園に通っている方も使えます。',
      how: '東京都の認定事業者と直接契約し、利用のあとで事業者から「要件証明書」と領収書をもらい、利用月の翌月末(必着)までに、区の事務局へ電子申請(郵送も可)します。',
      links: [L('江東区: ベビーシッター利用支援事業', 'https://www.city.koto.lg.jp/281012/kosodatesetaiouen/documents/babysitter.html')],
      note: '2026年度の対象は2027年3月31日までの利用分で、最終の申請締切は2027年4月15日です。交通費・キャンセル料・月会費などは補助の対象外です。問い合わせ: 0120-996-258(平日9〜17時)'
    },
    {
      id: 'koto-azukaaru', cat: '預け先', title: 'こども誰でも通園制度「あずかーる」(江東区)', apply: 'need', phase: [180, 1095],
      amount: '江東区民は無料(園によって実費は別)。月40時間まで(国の10時間+区独自の30時間)',
      body: '保育所などに通っていない、生後6か月〜満3歳を迎えた年度末までのお子さんを、区内の保育園・幼稚園などが定期的に預かります。受入れ年齢は施設ごとに違います。',
      how: 'こども家庭庁の「つうえんポータル」で区へ利用認定を申請 → アカウント発行 → 利用したい施設で初回面談(要予約) → 予約して利用、の流れです。',
      links: [
        L('江東区: こども誰でも通園制度「あずかーる」', 'https://www.city.koto.lg.jp/285002/daretsuu.html'),
        L('あずかーる実施園(保育園)', 'https://www.city.koto.lg.jp/285000/azukaaru-hoiku.html')
      ],
      note: '前日の23時59分までにキャンセルしないと、予約した時間分が利用時間として消費されます。'
    },
    {
      id: 'koto-hoiku', cat: '預け先', title: '認可保育園などの第1子の保育料の無償化(江東区)', apply: 'auto', phase: [150, 1100],
      amount: '年齢や課税状況にかかわらず、第1子の月額保育料が無償(2025年9月〜)',
      body: '対象は認可保育園、認定こども園(2号・3号)、小規模認可保育園、居宅訪問型保育事業です。無償になるのは月額保育料のみで、延長保育料や、日用品・おむつ・行事代などの実費は対象外です。',
      how: '対象かどうかは区が確認し、通知書が送られるため、無償化のための手続きは不要です(保育園への入園の申込みは別に必要です)。',
      links: [L('江東区: 認可保育園等における第1子保育料の無償化', 'https://www.city.koto.lg.jp/280308/daiissimusyouka.html')]
    }
  ];

  const KOTO_DESK = [
    ['児童手当・子ども医療証の窓口', '区役所3階14番(こども家庭支援課給付係) 03-3647-4754 / 豊洲シビックセンター3階7番(豊洲特別出張所) 03-5859-0165'],
    ['郵送・電子申請', '児童手当や子ども医療費助成の一部は、郵送やマイナポータルの電子申請でも手続きできます(区のページに案内があります)。'],
    ['産後ケア・ゆりかご面接', 'お住まいの地域を担当する保健相談所、または豊洲特別出張所で受けられます。']
  ];

  const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];

  const MUNI = [
    ['子ども医療費の助成', '通院・入院の自己負担が無料または一部負担になる制度です。対象年齢や所得制限は市区町村で大きく違います。「医療証」の手続きを忘れずに。'],
    ['産後ケア事業', '助産師などによる宿泊・日帰り・訪問のケア。利用料の補助は市区町村で異なります。'],
    ['保育料の軽減・一時預かり・ファミリーサポート', '多子世帯の軽減、一時預かりやファミサポの利用料補助など、独自の制度がある市区町村があります。'],
    ['おむつ・ベビー用品などの支給、出産祝い', '現物やクーポン、独自の給付を行う市区町村があります。'],
    ['予防接種の助成', '定期接種は無料ですが、おたふくかぜなどの任意接種を助成する市区町村があります(予防接種は「健康」タブのスケジュールも参照)。']
  ];

  const CITIES = ['江東区', 'その他の区市町村'];

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

  // ---------- 申請済みのチェック(お子さんごと・家族で共有) ----------
  const subMap = () => {
    const m = {};
    ((BA.data && BA.data.subs) || []).forEach((r) => { m[r.item_key] = r; });
    return m;
  };
  const checkable = (it) => it.apply !== 'plan';
  const isDone = (it) => !!subMap()[it.id];
  const doneWord = (it) => (it.apply === 'auto' ? '確認済み' : '申請済み');
  const todayYMD = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function doneInfo(r) {
    const d = BA.parseYMD(r.done_on);
    const m = (BA.state.members || []).find((x) => x.id === r.member_id);
    return fmtMD(d) + (m ? ' に' + m.name + 'さんがチェック' : ' にチェック');
  }

  async function toggleDone(id) {
    const ch = BA.child();
    if (!ch) return;
    const list = (BA.data.subs || []).slice();
    const idx = list.findIndex((r) => r.item_key === id);
    const before = list.slice();
    const base = '/children/' + ch.id + '/subsidies/' + encodeURIComponent(id);
    try {
      if (idx >= 0) {
        list.splice(idx, 1);
        BA.data.subs = list; BA.render();
        await BA.api('DELETE', base);
      } else {
        const rec = { item_key: id, done_on: todayYMD(), member_id: BA.state.me };
        list.push(rec);
        BA.data.subs = list; BA.render();
        await BA.api('PUT', base, { done_on: rec.done_on });
      }
    } catch (e) {
      BA.data.subs = before; BA.render(); BA.errToast(e);
    }
  }

  // summary の中のボタンは、開閉させずにチェックだけ切り替える
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const b = t.closest('[data-sub-toggle]');
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    toggleDone(b.getAttribute('data-sub-toggle'));
  });

  function itemHtml(it, ch, days, urgentOk) {
    let dl = '';
    let tag = '';
    const rec = checkable(it) ? subMap()[it.id] : null;
    if (rec) urgentOk = false;
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
    const chk = checkable(it)
      ? '<button type="button" class="sub-check' + (rec ? ' on' : '') + '" data-sub-toggle="' + it.id + '" role="checkbox" aria-checked="' + (rec ? 'true' : 'false') + '" aria-label="' + esc(it.title) + 'を' + doneWord(it) + 'にする"><i class="fas fa-check"></i></button>'
      : '';
    const doneBadge = rec ? '<span class="badge now">' + doneWord(it) + '</span>' : badge(it);
    const doneBtn = checkable(it)
      ? '<button type="button" class="btn ' + (rec ? 'soft' : 'primary') + ' sub-donebtn" data-sub-toggle="' + it.id + '">' +
        (rec ? '<i class="fas fa-rotate-left"></i> ' + doneWord(it) + 'を取り消す' : '<i class="fas fa-check"></i> ' + doneWord(it) + 'にする') + '</button>' +
        (rec ? '<p class="muted" style="margin:6px 0 0">' + esc(doneInfo(rec)) + '</p>' : '')
      : '';
    return '<details class="fold sub-item' + (rec ? ' is-done' : '') + '" id="sub-' + it.id + '"><summary>' + chk + '<span class="sub-t">' + esc(it.title) + '</span>' + tag + doneBadge + '</summary>' +
      '<div class="sub-body">' +
      '<p class="sub-row"><b>金額・内容</b>' + esc(it.amount) + '</p>' +
      '<p class="sub-row">' + esc(it.body) + '</p>' +
      (it.how ? '<p class="sub-row"><b>手続き</b>' + esc(it.how) + '</p>' : '') +
      dl +
      (it.note ? '<p class="sub-row muted">' + esc(it.note) + '</p>' : '') +
      (doneBtn ? '<div class="sub-done-row">' + doneBtn + '</div>' : '') +
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
    const city = isTokyo ? (BA.ls.get('ba_city') || '') : '';
    const isKoto = city === '江東区';
    const nowNat = NATIONAL.filter((it) => relevantNow(it, days));
    const restNat = NATIONAL.filter((it) => !relevantNow(it, days));
    // 江東区は区の制度(第1子保育料の無償化)で詳しく案内するので、都の同項目は省く
    const tokyoItems = isKoto ? TOKYO.filter((it) => it.id !== 'tokyo-hoiku') : TOKYO;
    const nowTky = isTokyo ? tokyoItems.filter((it) => relevantNow(it, days)) : [];
    const restTky = isTokyo ? tokyoItems.filter((it) => !relevantNow(it, days)) : [];
    const nowKoto = isKoto ? KOTO.filter((it) => relevantNow(it, days)) : [];
    const restKoto = isKoto ? KOTO.filter((it) => !relevantNow(it, days)) : [];

    const prefSel = '<section class="card"><h2><i class="fas fa-hand-holding-heart" style="color:var(--primary)"></i>国・都・区の補助と手続き</h2>' +
      '<p class="muted" style="margin-bottom:10px">お子さんの月齢に合わせて、確認したい制度を並べています。内容は <b>' + AS_OF + '</b> 時点で公式ページを確認したものです。</p>' +
      '<label class="field"><span>お住まいの都道府県(この端末だけに保存)</span><select id="pref-select" aria-label="お住まいの都道府県">' +
      '<option value="">選んでください</option>' + PREFS.map((p) => '<option value="' + p + '"' + (p === pref ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label>' +
      (pref && !isTokyo ? '<div class="notice" style="margin:10px 0 0">' + esc(pref) + 'の独自の制度は、まだこのアプリに載せていません。国の制度(全国共通)は下に載っています。' +
        '<br><a class="link-btn" href="https://www.google.com/search?q=' + encodeURIComponent(pref + ' 子育て 支援 給付金 補助') + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-magnifying-glass"></i> ' + esc(pref) + 'の子育て支援を検索</a></div>' : '') +
      (!pref ? '<p class="muted" style="margin-top:8px">都道府県を選ぶと、その都道府県の制度も表示します(現在は東京都に対応。東京都では江東区の制度も載せています)。</p>' : '') +
      (isTokyo ? '<label class="field" style="margin-top:10px"><span>お住まいの区市町村(この端末だけに保存)</span><select id="city-select" aria-label="お住まいの区市町村">' +
        '<option value="">選んでください</option>' +
        CITIES.map((c) => '<option value="' + c + '"' + (c === city ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>' +
        (city === 'その他の区市町村' ? '<p class="muted" style="margin-top:6px">この区市町村の独自の制度は、まだ載せていません。下の「区市町村で確認」を参考に、役所のページを確認してください。</p>' : '') : '') +
      '</section>';

    const nowAll = nowNat.concat(nowTky, nowKoto);
    // 期限のあるものを先に
    // 申請済みは後ろへ。そのなかでは期限のあるものを先に
    nowAll.sort((a, b) => ((checkable(a) && isDone(a)) ? 1 : 0) - ((checkable(b) && isDone(b)) ? 1 : 0) || (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1));

    // 進み具合(申請が必要な制度のうち、チェック済みの数)
    const allShown = NATIONAL.concat(tokyoItems.filter(() => isTokyo), isKoto ? KOTO : []);
    const needs = allShown.filter((it) => it.apply === 'need');
    const doneN = needs.filter((it) => isDone(it)).length;
    const progress = needs.length
      ? '<p class="sub-progress"><b>' + doneN + ' / ' + needs.length + '</b> 件を申請済み<span class="sub-bar"><i style="width:' + Math.round(doneN / needs.length * 100) + '%"></i></span></p>'
      : '';
    const nowSec = section('いま確認したいこと', 'fa-bell', nowAll, ch, days, true,
      (ch ? esc(ch.name) + 'さん(' + esc(BA.ageText(ch.birthday)) + ')に関係しそうな制度です。' : '') + '<br>手続きが終わったら、左のチェックを入れておくと、家族みんなの画面に反映されます。' + progress);
    const natSec = section('そのほかの国の制度(全国共通)', 'fa-landmark', restNat, ch, days, false);
    const tkySec = isTokyo ? section('東京都の制度(そのほか)', 'fa-city', restTky, ch, days, false) : '';
    const kotoSec = isKoto ? section('江東区の制度(そのほか)', 'fa-location-dot', restKoto, ch, days, false) : '';

    const kotoDesk = '<section class="card sub-list"><h2><i class="fas fa-building-columns" style="color:var(--primary)"></i>江東区の窓口</h2>' +
      KOTO_DESK.map((m) => '<details class="fold sub-item"><summary><span class="sub-t">' + esc(m[0]) + '</span></summary><div class="sub-body"><p class="sub-row">' + esc(m[1]) + '</p></div></details>').join('') +
      '<div class="sub-links" style="margin-top:8px"><a class="link-btn" href="https://www.city.koto.lg.jp/281011/kodomo/kosodate/teate/96043.html" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> 江東区: 手当と医療費助成制度について</a>' +
      '<a class="link-btn" href="https://www.city.koto.lg.jp/shussan.html" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> 江東区: 妊娠・出産のページ</a></div></section>';

    const muni = '<section class="card sub-list"><h2><i class="fas fa-building-columns" style="color:var(--primary)"></i>お住まいの市区町村で確認</h2>' +
      '<p class="muted" style="margin-bottom:6px">実際の窓口や独自の上乗せは、市区町村ごとに違います。「○○市 子育て 支援」で検索するか、役所の子育て窓口・母子手帳の資料で確認してください。</p>' +
      MUNI.map((m) => '<details class="fold sub-item"><summary><span class="sub-t">' + esc(m[0]) + '</span></summary><div class="sub-body"><p class="sub-row">' + esc(m[1]) + '</p></div></details>').join('') + '</section>';

    const disc = '<p class="disclaimer">ここに載せた金額・条件・期限は、国や自治体の公式ページをもとにした目安です(' + AS_OF + '時点)。制度は毎年のように改正され、所得や就労形態、お住まいの自治体によって対象や手続きが変わります。申請の前に、必ずリンク先の公式ページか役所の窓口で最新の内容をご確認ください。このアプリは申請の代行や受給の保証をするものではありません。</p>';

    return prefSel + nowSec + natSec + tkySec + kotoSec + (isKoto ? kotoDesk : muni) + disc;
  };

  // 都道府県・区市町村の選択
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el instanceof Element && el.id === 'city-select') {
      if (el.value) BA.ls.set('ba_city', el.value); else BA.ls.del('ba_city');
      BA.render();
      return;
    }
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
    if (isDone({ id: 'jidou', apply: 'need' })) return '';
    return '<section class="card" aria-label="手続きのお知らせ"><button class="sub-hint" data-act="opensubsidy" data-id="jidou">' +
      '<span class="qi" style="background:var(--warn)"><i class="fas fa-file-signature"></i></span>' +
      '<span class="sub-hint-t"><b>児童手当の申請期限が近づいています</b><br><span class="muted">' + fmtMD(plusDays(ch.birthday, 15)) + 'まで(' + (left === 0 ? '今日' : 'あと' + left + '日') + ')。' + (BA.ls.get('ba_city') === '江東区' && BA.ls.get('ba_pref') === '東京都' ? '子ども医療証も同じ窓口で。' : '') + '補助・手続きの一覧を見る</span></span>' +
      '<i class="fas fa-chevron-right" style="color:var(--sub)"></i></button></section>';
  };

  BA.subsidyInfo = { AS_OF, NATIONAL, TOKYO, KOTO };
})();
