# 写真家「日々」ポートフォリオ

ストリートフォトに写る一瞬を、自分のペースで鑑賞するための静的サイトです。トップページを下へスクロールしながら作品を鑑賞でき、作品一覧、写真の拡大、作者紹介を用意しています。

拡大画面は写真全体を画面内に収めて表示し、前後の写真への移動と閉じる操作を備えます。

画像上の右クリックメニューとドラッグ保存を抑止します。対応ブラウザでは画像の長押しメニューも抑止します。通常の文章・リンクの操作は維持します。これは画像取得を完全に防ぐ仕組みではなく、直接URL・開発者ツール・スクリーンショットによる取得は防げません。

## 現在の状態

- 2026年10月29日の差し替え依頼に基づき、ユーザー提供フォルダの`color/`・`monochrome/`から各20点、計40点を掲載します。画面下部の「Color」「Monochrome」で作品群とサイト全体の配色を切り替えます。
- 原寸の提供画像は変更・公開せず、`assets/photos/provided/`に閲覧用WebP 200ファイル（合計32,781,660 bytes）を生成しました。長辺400・800・1400・2200pxを候補に、原寸以下で縮小します。構図を切り取らず、写真自体への色調変更は行いません。
- 提供画像のICCはAdobe RGB 38点・ROMM RGB 1点・Display P3 1点です。閲覧コピーにICCを保持し、EXIF・GPS・XMPを除去します。
- `npm run check`で各20点の枚数、提供ファイルの相対名・SHA-256・重複、画像の形式・実寸法・容量を確認します。各作品の閲覧サイズとサムネイルの重複参照を除いた合計は2MB未満です。
- 掲載順はユーザーから編集を任されており、鑑賞の流れを考えて構成します。作品ごとの固定IDは並べ替えても変更しません。
- 初回v1は2026年10月25日に5点を公開し、10月26日にInstagram由来のカラー20点・モノクロ20点へ更新しました。これらは今回の提供40点とは区別した過去の掲載記録です。
- 管理先は公開リポジトリ [bon214/hibi-portfolio](https://github.com/bon214/hibi-portfolio)、公開URLは [https://bon214.github.io/hibi-portfolio/](https://bon214.github.io/hibi-portfolio/) です。今回の公開確認は[検証記録](docs/validation.md)に記録します。
- 月1回程度、Codexへ写真の差し替え・並べ替えを依頼する運用です。管理画面・認証・データベースは使用しません。

写真の出典と今回の公開範囲は [写真の出典と扱い](docs/asset-sources.md) を参照してください。`selectionStatus: 'approved'`はユーザーによる公開選定指示を表し、個別作品について別途本人承認を得たという記録ではありません。制作基準を記した`要件定義.md`はローカル文書としてGit管理対象外です。

カラー／モノクロの要件・素材・確認記録は[コレクション切り替え](docs/collections.md)を参照してください。

## ローカルで見る

公開用画像をリポジトリに含めています。Node.jsとnpm、Python 3を利用できる環境で、取得したプロジェクトのディレクトリから実行します。通常の表示・検査に依存パッケージのインストールや画像の再取得は不要です。

```sh
npm run check
npm run dev
```

ブラウザで <http://127.0.0.1:4186/> を開きます。終了時はターミナルで `Ctrl+C` を押します。JavaScriptモジュールを読み込むため、`index.html` の直接オープンではなくHTTPサーバーを使います。画像はサイト内の閲覧コピーを表示し、Instagramなどへの接続を必要としません。

Pythonの起動コマンドを直接使う場合は、`python3 -m http.server 4186 --bind 127.0.0.1`です。

## 構成

| パス | 内容 |
| --- | --- |
| `index.html` | 画面の構造と基本情報 |
| `styles.css` | 写真の表示サイズ、余白、画面への適応 |
| `app.js` | 縦スクロール、入場アニメーション、一覧、拡大、作者紹介、URLと操作の制御 |
| `data/works.js` | 作家紹介・活動歴・外部リンク、作品の固定ID、画像参照、寸法、代替テキスト、掲載順 |
| `assets/profile/hibi.webp` | 本人のlit.linkで使用されているプロフィール画像 |
| `assets/photos/provided/` | ユーザー提供のカラー20点・モノクロ20点から作成した閲覧用WebP |
| `assets/share.jpg` | SNSなどでの共有用画像 |
| `assets/reference/` | 取得元の原寸画像。Git管理対象外 |
| `assets/photos/reference/` | 旧ローカル試作用画像。Git管理対象外 |
| `scripts/prepare-provided-assets.py` | 提供フォルダと非公開の選定リストから現行閲覧コピー・寸法・SHA記録を生成。PillowのWebP対応が必要 |
| `scripts/prepare-v1-assets.py` / `scripts/prepare-instagram-assets.py` | 過去のv1・Instagram由来画像の生成スクリプト。現行の提供40点には使用しない |
| `scripts/prepare-reference-assets.mjs` | 旧参照画像の再取得。通常の起動には不要 |
| `scripts/check-content.mjs` | 作品データ、実画像寸法、必須ファイルの整合確認 |
| `scripts/verify-public.mjs` | 公開URLのHTTP応答、MIME、SHA-256、入口HTMLを検証 |
| `.nojekyll` | GitHub PagesのJekyll処理を無効化 |
| `docs/update-guide.md` | 写真の追加・差し替え・並べ替えと確認手順 |

## 操作

トップページは一画面につき一枚を鑑賞する構成です。写真・余白・操作部のどこにマウスがあっても、ブラウザ標準の操作で上下にスクロールでき、写真の位置に揃って止まります。一覧からは任意の作品へ直接移動できます。拡大を閉じると該当作品の停止位置へ戻ります。写真のURLには掲載順に依存しない固定IDを使用します。

画面下部の「カラー」「モノクロ」で作品群を切り替えます。背景・文字・罫線・ダイアログの配色とInstagramへのリンクも連動します。それぞれの鑑賞位置を同じページを開いている間は記憶し、一覧表示中は一覧のまま切り替えます。写真そのものにフィルターはかけません。

通常の画面移動は滑らかにつなぎ、最初の写真は初めから表示します。ブラウザ標準の[CSS Scroll Snap](https://drafts.csswg.org/css-scroll-snap/#scroll-snap-stop)を使い、JavaScriptでホイール入力を抑止しません。慣性や連続入力の扱いはブラウザに委ねます。一覧・ダイアログ内はスナップの対象外です。最終作品の次には末尾メニューへ進めます。OSの「動きを減らす」設定では入場アニメーションと滑らかな移動を停止します。

写真の解説・撮影地・撮影時期は、本人から提供され承認された内容だけを掲載します。作品を解釈する文章や正式なシリーズ名を、参照画像から推測して加えません。

## 更新・確認

更新後はローカル検査とブラウザ確認を行い、公開用画像・作品データ・変更を`main`へpushします。GitHub Pagesのデプロイ後に公開ファイルを照合します。

```sh
npm run check
npm run verify:public -- https://bon214.github.io/hibi-portfolio/
```

公開検証の結果は`artifacts/public-verification.json`に保存されます。構図・色・暗部・読みやすさ・実際の操作はブラウザで別途確認します。詳細は [更新ガイド](docs/update-guide.md)、検証記録は [検証記録](docs/validation.md) を参照してください。

## GitHub・公開・費用の境界

GitHub Pagesの公開元は`main`の`/(root)`です。公開元のルートに`index.html`と`.nojekyll`を置き、リポジトリ内の静的ファイルをそのまま配信します。branch公開でもGitHub組込みのPages用Actionsが動作します。独自workflowは追加しません。[公開元設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

PublicリポジトリのGitHub Pagesと標準runnerは無料対象です。有料runner、独自ドメインの購入、有料サービスの契約は行いません。[GitHub公式料金説明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

提供された原寸画像、選定入力・生成manifest、旧試作コピー、QA用スクリーンショット、秘密情報、アクセストークンはコミットしません。現行画像の再生成には`python3 scripts/prepare-provided-assets.py --source-dir /path/to/originals`を使い、Git管理対象外の`artifacts/provided-selection.json`を用意します。`npm run references`と旧版の生成スクリプトは、現在の提供40点の更新には使用しません。
