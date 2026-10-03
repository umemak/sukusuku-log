# すくすくログ

## Project Overview
- **Name**: すくすくログ(webapp)
- **Goal**: 新生児期からの育児記録を、家族みんなで共有しながら続けられるようにする
- **Features**: ワンタップ記録 / 授乳・睡眠タイマー / 家族コード共有 / 日次・期間まとめ / 成長グラフ / 予防接種スケジュール / ダークモード / PWA

## URLs
- **Dev (sandbox)**: `pm2 start ecosystem.config.cjs` 後に http://localhost:3000
- **Production**: https://sukusuku-log.pages.dev
- **GitHub**: https://github.com/umemak/sukusuku-log

## 現在できること
- **家族共有**: ログイン不要。「家族を新しく作る」と8文字の家族コードが発行される。パートナーはコード(または `/?code=XXXXXXXX` の招待リンク)で参加。記録には「誰が記録したか」が残る。他の家族のデータにはアクセスできない。
- **記録の種類**: 母乳(左右)、ミルク(ml)、搾母乳(ml)、睡眠、おしっこ、うんち(状態)、体温、お風呂、薬、メモ
- **ホーム**: 最後の授乳・睡眠・おむつからの経過時間、授乳/睡眠タイマー、ワンタップ記録(取り消し付き)、今日のまとめ
- **記録タブ**: 日付ごとのタイムライン。タップで編集・削除。
- **まとめタブ**: 7/14/30日の平均値、睡眠・授乳・おむつのグラフ
- **健康タブ**: 体重・身長・頭囲の記録とグラフ(月齢軸) / 予防接種(生年月日から時期を自動計算、接種済みチェック)
- **家族タブ**: 家族コード共有、メンバー、複数の子ども(きょうだい)、テーマ切替、連携解除
- 他端末の記録は20秒ごと、および画面を開き直したときに自動で反映される。

## Data Architecture
- **Storage**: Cloudflare D1(SQLite)。`migrations/0001_initial_schema.sql`
- **Tables**: families / members / children / logs / growth / vaccinations
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
| GET/POST, DELETE | /children/:id/growth, /growth/:id | 成長記録 |
| GET, PUT/DELETE | /children/:id/vaccinations[/:key] | 接種記録 |

## ローカル開発
```
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs
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
- 写真付き思い出日記(R2)、離乳食・アレルギー記録、家事分担の見える化
- 成長曲線(パーセンタイル)の重ね表示、小児科向けの受診用エクスポート
- 家族コードの再発行(漏えい時の対策)、メンバーの削除

## 注意
予防接種の時期と成長の目安は一般的な目安であり、医療的な助言ではありません。実際はかかりつけ医・自治体の案内に従ってください。

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active(Cloudflare Pages プロジェクト `sukusuku-log` / D1 `sukusuku-log-production`)
- **Tech Stack**: Hono + TypeScript + D1 + Vanilla JS + Chart.js + FontAwesome
