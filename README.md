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
- **家族共有**: ログイン不要。「家族を新しく作る」と8文字の家族コードが発行される。パートナーはコード(または `/?code=XXXXXXXX` の招待リンク)で参加。記録には「誰が記録したか」が残る。他の家族のデータにはアクセスできない。
- **記録の種類**: 母乳(左右)、ミルク(ml)、搾母乳(ml)、睡眠、おしっこ、うんち(状態)、体温、お風呂、薬、メモ
- **ホーム**: 最後の授乳・睡眠・おむつからの経過時間、授乳/睡眠タイマー、ワンタップ記録(取り消し付き)、今日のまとめ
- **記録タブ**: 日付ごとのタイムライン。タップで編集・削除。
- **まとめタブ**: 7/14/30日の平均値、睡眠・授乳・おむつのグラフ、**お世話の分担**(記録した人ごとの件数と内訳)
- **健康タブ**:
  - 成長: 体重・身長・頭囲の記録とグラフ(月齢軸)。性別を設定すると **WHO成長基準(2006)** の曲線(-2SD/中央値/+2SD)と**パーセンタイル**を表示
  - 予防接種: 生年月日から時期を自動計算、接種済みチェック
  - 離乳食: 食べたものの記録、特定原材料8品目の経験状況、食後の様子(問題なし/軽い症状/強い症状と受診の目安)
  - **受診用まとめ**: 直近3/7/14日の授乳・睡眠・おむつ・体温・薬・成長(パーセンタイル付き)・接種・アレルギーを1枚に集約し、印刷 / PDF保存
- **思い出タブ**: 写真(端末側で縮小したJPEG、R2に保存)とひとことの日記。月齢つき、編集・削除可。写真は家族メンバーだけが認証付きで取得できる。
- **家族タブ**: 家族コード共有・**再発行**(漏えい時。古いコードは無効、参加済み端末は継続)、メンバー一覧と**削除**、複数の子ども(きょうだい)、テーマ切替、連携解除
- 他端末の記録は20秒ごと、および画面を開き直したときに自動で反映される。

## Data Architecture
- **Storage**: Cloudflare D1(SQLite)。`migrations/0001_initial_schema.sql`, `0002_diary_foods.sql`
- **Object storage**: Cloudflare R2(バケット `sukusuku-log-photos`、バインディング `PHOTOS`、キーは `<family_id>/<photo_id>`)
- **Tables**: families / members / children / logs / growth / vaccinations / foods / diary
- **WHO データ**: `public/static/who-lms.js`(Weight-for-age / Length(Height)-for-age / Head circumference-for-age の LMS 表、0〜5歳)
- **認証**: 端末ごとのランダムトークン(localStorage)。DBにはSHA-256ハッシュのみ保存。全APIが家族IDで絞り込み。

## API(すべて `/api` 配下、`Authorization: Bearer <token>`)
| メソッド | パス | 内容 |
|---|---|---|
| POST | /families, /join | 家族作成 / 家族コードで参加(認証不要) |
| GET | /me | 自分・家族・メンバー・子ども |
| POST/PUT/DELETE | /children[/:id] | 子どもの追加・更新・削除 |
| GET/POST | /children/:id/logs | 育児ログ取得(from,to,limit) / 追加 |
| GET | /children/:id/last | 種類ごとの最新記録 |
| PUT/DELETE | /logs/:id | ログ更新 / 削除 |
| POST | /families/regenerate-code | 家族コードの再発行 |
| DELETE | /members/:id | メンバー削除(自分自身は不可) |
| GET/POST, DELETE | /children/:id/growth, /growth/:id | 成長記録 |
| GET/POST, DELETE | /children/:id/foods, /foods/:id | 離乳食・アレルギー記録 |
| POST, GET, DELETE | /photos, /photos/:id | 写真(JPEGのみ・4MBまで) |
| GET/POST, PUT/DELETE | /children/:id/diary, /diary/:id | 思い出日記 |
| GET, PUT/DELETE | /children/:id/vaccinations[/:key] | 接種記録 |

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

## 未実装・今後の候補
- プッシュ通知(Cloudflare Pagesでは常駐処理ができないため未対応)
- 日記写真の複数枚添付、日記の写真差し替え
- 修正月齢(早産)に対応した成長曲線
- アプリ側での Cloudflare Access JWT(AUD)検証

## 注意
予防接種の時期・成長の目安・パーセンタイル(WHO Child Growth Standards 2006。日本の乳幼児身体発育曲線とは基準が異なる)・アレルギー関連の表示は一般的な目安であり、医療的な診断・助言ではありません。実際はかかりつけ医・自治体の案内に従ってください。

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active(Cloudflare Pages プロジェクト `sukusuku-log` / D1 `sukusuku-log-production`)
- **Tech Stack**: Hono + TypeScript + D1 + Vanilla JS + Chart.js + FontAwesome
