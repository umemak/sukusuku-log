# すくすくログ

## Project Overview
- **Name**: すくすくログ(webapp)
- **Goal**: 新生児期からの育児記録を、家族みんなで共有しながら続けられるようにする
- **Features**: ワンタップ記録 / 授乳・睡眠タイマー / 家族コード共有 / 日次・期間まとめ / 成長グラフ(WHOパーセンタイル) / 予防接種スケジュール / 離乳食・アレルギー記録 / 写真つき思い出日記 / 家事・育児の分担 / 受診用まとめ / ダークモード / PWA

## URLs
- **Dev (sandbox)**: `pm2 start ecosystem.config.cjs` 後に http://localhost:3000
- **Production**: https://sukusuku-log.pages.dev
- **GitHub**: https://github.com/umemak/sukusuku-log

## 現在できること
- **最初の画面**: 「招待コードをもらっている」か「はじめて使う」を先に選び、入力画面を分けている(名前欄・コード欄が混ざらない)。招待リンク(`/?code=`)から開くと参加画面にコードが入った状態で始まる。
- **新規家族作成時のメール認証**: 初めて家族を作成する際は、メールアドレスを入力して6桁の認証コードを受信・確認した上で家族を作成する（Cloudflare Accessは不要）。認証コードは10分間有効。
- **家族共有とワンタイム招待コード**: ログイン不要。パートナーや家族を招待する際は、「家族」タブから**24時間有効・1回限りの使い捨て招待コード**を発行する（共通の固定コードは不使用）。
  - **発行時のロール選択**: 「記録・閲覧」用または「閲覧専用(記録しない)」(祖父母や見守り向け)を指定して招待コードを発行可能。
  - **別の端末の追加**: PCやタブレットなど別の端末を追加する際も、参加済みの端末から新しい招待コードを発行して入る。前と同じ呼び名で入ると同じメンバーとして端末が追加される。一度使われたコードやすでに期限切れのコードは使用できない。
  - **閲覧のみユーザーの画面**: 授乳・睡眠・おむつなどの記録ボタン、タイマー、音声入力、写真追加、編集・削除ボタンが非表示になり、見守りや閲覧に専念できるシンプルなUIになる。タイムラインのタップ時も編集フォームではなく閲覧詳細シートを表示。
  - **権限の変更**: 「家族」タブのメンバー一覧から、記録権限を持つメンバーが各メンバーの権限(記録・閲覧 / 閲覧のみ)を切り替えられる(最後の記録者を閲覧専用に変更できないよう保護)。
- **記録の種類**: 母乳(左右)、ミルク(ml)、搾母乳(ml)、睡眠、おしっこ、うんち(状態)、体温、お風呂、薬、メモ
- **ホーム**: 最後の授乳・睡眠・おむつからの経過時間、授乳/睡眠タイマー、ワンタップ記録(取り消し付き)、今日のまとめ
- **記録タブ**: 日付ごとのタイムライン。タップで編集・削除(閲覧専用ユーザーは内容の確認のみ)。
- **まとめタブ**: 7/14/30日の平均値、睡眠・授乳・おむつのグラフ、**お世話の分担**(記録した人ごとの件数と内訳)
- **健康タブ**:
  - 成長: 体重・身長・頭囲の記録とグラフ(月齢軸)。性別を設定すると **WHO成長基準(2006)** の曲線(-2SD/中央値/+2SD)と**パーセンタイル**を表示
  - 予防接種: 生年月日から時期を自動計算、接種済みチェック(閲覧専用ユーザーは確認のみ)
  - 離乳食: 食べたものの記録、特定原材料8品目の経験状況、食後の様子(問題なし/軽い症状/強い症状と受診の目安)
  - **受診用まとめ**: 直近3/7/14日の授乳・睡眠・おむつ・体温・薬・成長(パーセンタイル付き)・接種・アレルギーを1枚に集約し、印刷 / PDF保存
- **思い出タブ**: 写真(端末側で縮小したJPEG、R2に保存)とひとことの日記。月齢つき、編集・削除可(閲覧専用ユーザーは閲覧のみ)。写真は家族メンバーだけが認証付きで取得できる。
- **家族タブ**: 有効な招待コードの一覧・招待リンクのコピー/共有・招待の取り消し・新しい招待コードの発行(記録用 / 閲覧用)、メンバー一覧(権限バッジ・権限切り替え・**削除**)、複数の子ども(きょうだい)、テーマ切替、連携解除
- **声・文章でまとめて記録(Gemini)**: ホームの「声・文章でまとめて記録」から、話しかける(最大30秒)か文章で入力 → AIが記録の候補に変換 → 確認・修正してから保存。例「さっきミルク120と、おしっこ。うんちはやわらかめ」。`GEMINI_API_KEY` を設定した環境でのみボタンが表示される(閲覧専用ユーザーには非表示)。1家族あたり1日40回まで(日本時間)。AIは記録の抽出だけを行い、診断や助言はしない。音声・文章はGoogle(Gemini API)に送信され、アプリ側には保存しない(有料枠のキー前提)。
- 他端末の記録は20秒ごと、および画面を開き直したときに自動で反映される。

## Data Architecture
- **Storage**: Cloudflare D1(SQLite)。`migrations/0001_initial_schema.sql`, `0002_diary_foods.sql`, `0006_member_role.sql`, `0007_invitations.sql`, `0008_email_verifications.sql`
- **Object storage**: Cloudflare R2(バケット `sukusuku-log-photos`、バインディング `PHOTOS`、キーは `<family_id>/<photo_id>`)
- **Tables**: families / members(role: 'editor' | 'viewer') / children / logs / growth / vaccinations / foods / diary / ai_usage(AI利用回数) / member_tokens(追加端末の鍵) / invitations(ワンタイム招待コード) / email_verifications(メール認証コード)
- **WHO データ**: `public/static/who-lms.js`(Weight-for-age / Length(Height)-for-age / Head circumference-for-age の LMS 表、0〜5歳)
- **認証**: 端末ごとのランダムトークン(localStorage)。DBにはSHA-256ハッシュのみ保存。全APIが家族IDで絞り込み、書き込みAPIは `editor` 権限を要求。

## API(すべて `/api` 配下、`Authorization: Bearer <token>`)
| メソッド | パス | 内容 |
|---|---|---|
| POST | /auth/send-code | メール認証コードの送信(6桁数字・10分間有効、認証不要) |
| POST | /families | 家族作成(email, code, memberName を検証、認証不要) |
| GET | /invitations/check?code= | 招待コードの事前検証(有効/期限切れ/使用済み、role返却、認証不要) |
| POST | /join | ワンタイム招待コードで参加(認証不要) |
| GET/POST | /invitations | 家族の有効な招待コード一覧取得 / 招待コード発行 (POSTはeditorのみ・24時間/1回限り有効) |
| DELETE | /invitations/:code | 招待コードの取り消し (editorのみ) |
| GET | /me | 自分(role含む)・家族・メンバー・子ども |
| PUT | /members/:id/role | メンバー権限の変更 (editor ⇄ viewer、editorのみ) |
| POST/PUT/DELETE | /children[/:id] | 子どもの追加・更新・削除 (editorのみ) |
| GET/POST | /children/:id/logs | 育児ログ取得(from,to,limit) / 追加(POSTはeditorのみ) |
| GET | /children/:id/last | 種類ごとの最新記録 |
| PUT/DELETE | /logs/:id | ログ更新 / 削除 (editorのみ) |
| POST | /families/discard | 「はじめて使う」の取り消し(メンバー1人・お子さん0人の家族だけ削除できる) |
| DELETE | /members/:id | メンバー削除(自分自身は不可、editorのみ) |
| GET/POST, DELETE | /children/:id/growth, /growth/:id | 成長記録(POST/DELETEはeditorのみ) |
| GET/POST, DELETE | /children/:id/foods, /foods/:id | 離乳食・アレルギー記録(POST/DELETEはeditorのみ) |
| POST, GET, DELETE | /photos, /photos/:id | 写真(JPEGのみ・4MBまで、POST/DELETEはeditorのみ) |
| GET/POST, PUT/DELETE | /children/:id/diary, /diary/:id | 思い出日記(POST/PUT/DELETEはeditorのみ) |
| GET, PUT/DELETE | /children/:id/vaccinations[/:key] | 接種記録(PUT/DELETEはeditorのみ) |
| GET | /ai/status | AI機能の有効/無効と今日の残り回数 |
| POST | /ai/parse?tz= | 音声または `{text}` → 記録候補 (editorのみ) |

## ローカル開発
```
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs   # D1 と R2 はローカルエミュレーション(--local)
```

本番デプロイは GitHub Actions(`.github/workflows/deploy.yml`)が自動で行う。`main` への push で、D1マイグレーション適用 → ビルド → Pages デプロイの順に実行される(Actions タブから手動実行も可)。
必要な GitHub シークレット: `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
マイグレーションはデプロイより先に走るため、旧バージョンのコードと両立する(後方互換な)変更にすること。

手動でデプロイする場合(スキーマ変更時は先に `npm run db:migrate:prod`):
```
npm run build && npx wrangler pages deploy dist --project-name sukusuku-log --branch main
```
フロントの修正(`public/`)後も、`npm run build` してから `pm2 restart webapp` が必要。

## AI機能(Gemini)の設定
APIキーは**サーバー側のシークレット**としてだけ扱い、画面には出ない。未設定ならAI機能は自動的に非表示になる。
```
# 本番(Cloudflare Pages)。Dashboard の Settings → Variables and Secrets でも可
npx wrangler pages secret put GEMINI_API_KEY --project-name sukusuku-log
# 任意: 使うモデルを変えたいとき(既定は gemini-3.8-flash)
npx wrangler pages secret put GEMINI_MODEL --project-name sukusuku-log
```
ローカルでは `.dev.vars`(git管理外)に `GEMINI_API_KEY=...` を書く。`GEMINI_API_BASE` を指定すると別のエンドポイント(テスト用モック)に向けられる。
シークレットを登録・変更した後は、再デプロイ(または Pages の新しいデプロイ)で反映される。

## メール認証(Cloudflare Email Routing)の設定
新規家族作成時のメール認証には Cloudflare Email Routing (`send_email` バインディング) を使用します。
- `wrangler.jsonc` の `send_email` バインディング (`EMAIL`) を通じてメールを送信します。
- 送信元アドレス (`EMAIL_FROM`) を変更する場合は、Cloudflare Pages の環境変数またはシークレットで設定します (例: `noreply@yourdomain.com`)。
- ローカル開発時やバインディング未設定時は、送信された認証コードがサーバーコンソール (`wrangler pages dev` の出力) に表示され、そのまま動作確認が可能です。

## 未実装・今後の候補
- AI: 離乳食メニュー提案、日記の下書き、受診まとめの要約(今回は音声入力のみ)
- プッシュ通知(Cloudflare Pagesでは常駐処理ができないため未対応)
- 日記写真の複数枚添付、日記の写真差し替え
- 修正月齢(早産)に対応した成長曲線

## 注意
予防接種の時期・成長の目安・パーセンタイル(WHO Child Growth Standards 2006。日本の乳幼児身体発育曲線とは基準が異なる)・アレルギー関連の表示は一般的な目安であり、医療的な診断・助言ではありません。実際はかかりつけ医・自治体の案内に従ってください。

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active(Cloudflare Pages プロジェクト `sukusuku-log` / D1 `sukusuku-log-production`)
- **Tech Stack**: Hono + TypeScript + D1 + Vanilla JS + Chart.js + FontAwesome

## アイコン
- 元データ: `public/static/icon.svg`(芽を生やした赤ちゃんの顔)。PNG は `rsvg-convert` で書き出し(`icon-v2-*.png`、maskable 用は余白付き)。
- iOS のホーム画面用 `apple-touch-icon` は、追加時に確実に読み込ませるため HTML に data URI で埋め込み(`src/touch-icon.ts`)。

## 補助・手続きの案内(健康タブ →「補助」)
- お子さんの月齢に合わせて「いま確認したいこと」を先頭に並べる、国・都道府県の子育て関連制度の案内(児童手当、妊婦のための支援給付、出産育児一時金、育児休業給付、国民年金の育児免除、こども誰でも通園制度、保育の無償化、医療費控除など)。
- 都道府県を選ぶ(端末に保存: `ba_pref`)と、その都道府県の制度も表示。**現在は東京都のみ対応**(018サポート、子育て応援+、第1子保育料無償化、無痛分娩費用助成)。他の都道府県は国の制度+検索リンクを表示。
- 東京都を選ぶと「お住まいの区市町村」(端末に保存: `ba_city`)も選べる。**現在は江東区に対応**(子ども医療費助成・マル乳医療証、出産・子育て応援給付金、産後ケア、こうとう家事・育児サポート、ベビーシッター利用支援、あずかーる、第1子保育料無償化、窓口案内)。江東区を選ぶと、都の第1子保育料無償化は区の項目に統合して表示。他の区市町村は汎用の案内カード。区市町村を増やすときは `KOTO` と同形式の配列と `CITIES` を追加する。
- 生後0〜14日は、ホームに「児童手当の申請期限」のお知らせを表示(出生の翌日から15日以内)。
- 各制度に「申請済み」のチェックを付けられる(お子さんごと・家族で共有。D1 `subsidy_done`、`/api/children/:id/subsidies`)。チェックした日と人を記録し、申請済みは「いま確認したいこと」の後ろへ回る。「予定」の制度はチェック対象外。児童手当をチェックするとホームのお知らせが消える。
- データは静的(`public/static/app-subsidy.js`)。**制度が変わったら `AS_OF`(最終確認日)と内容を更新**すること。現在の最終確認日: 2026年10月3日。
- 出産費用の無償化は法改正済みだが詳細未定のため「予定」と表示。金額・条件はあくまで目安で、公式ページへのリンクを併記。

## PWAの自動更新
- ビルドごとに版ID(`__BUILD_ID__`、`vite.config.ts` で生成)が変わり、HTMLの `<meta name="app-version">`・静的ファイルの `?v=`・`/api/version` に入る(静的ファイルのキャッシュ更新は手動の番号上げ不要)。
- アプリは起動時・前面に戻ったとき・5分ごとに `/api/version` を確認し、版が違えば自動で最新版に入れ替える(入力中や開いているシートがあるときは「更新」ボタン付きの通知)。更新の繰り返しは1セッション1回に制限。
- HTMLは `Cache-Control: no-cache`、Service Worker は `updateViaCache: 'none'` と `cache: 'no-cache'` で取得し、古い画面が残らないようにしている。
