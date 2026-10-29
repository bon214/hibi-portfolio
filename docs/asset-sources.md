# 写真の出典と扱い

確認日: 2026-10-29

## 現在の掲載選定：ユーザー提供40点

2026-10-29の明示依頼「写真を全て差し替えます」に基づき、ユーザーが指定した提供フォルダの`color/`と`monochrome/`にあるJPEGを各20点、合計40点使用します。今回の閲覧コピーはInstagramの配信画像から再取得したものではありません。第三者のストック写真や生成画像は含みません。

掲載順はユーザーから編集を任されており、写真を鑑賞する流れを考えて構成します。正式なシリーズや作者の制作意図を主張するものではありません。未提供の作品名・作品解説・撮影地・撮影時期を推測して加えません。`selectionStatus: 'approved'`は今回のユーザーによる公開選定指示に基づく状態で、写真家本人から各写真の個別承認を別途取得したという記録ではありません。

各作品の`source`は`{ type: 'provided', file: 'color/元ファイル名.jpg', sha256: '原本のSHA-256' }`形式です。モノクロの`file`は`monochrome/`から始まります。SHA-256は元ファイルから算出した64桁の小文字16進数です。公開データには提供フォルダの絶対パスを含めません。Instagramへのリンクは作者の活動先として維持し、今回の画像ファイルの出典とは区別します。

## 提供画像と閲覧コピー

- 閲覧コピーは200 WebP、合計32,781,660 bytesです。すべて品質92で書き出し、各作品の最大合計は1,736,264 bytesです。
- 原寸の提供40点は変更せず、公開リポジトリに収録しません。サイトでは`assets/photos/provided/`に生成した閲覧用WebPだけを使用します。
- 埋め込みICCはAdobe RGB 38点、ROMM RGB 1点、Display P3 1点です。閲覧コピーでは元のICCをバイト単位で保持し、EXIF・GPS・XMPを除去します。EXIFの表示方向が必要な場合だけ向きを補正します。
- 長辺400・800・1400・2200pxを候補とし、原寸の長辺を上限とします。拡大生成・クロップ・色調変更は行いません。元の構図、白枠や署名がある場合はそれらも保持します。
- `variants`の`width`・`height`は書き出し画像の実寸です。各作品のサムネイルと閲覧サイズは、同じ参照先の重複を除いた合計を2MB未満にします。
- 生成には`scripts/prepare-provided-assets.py --source-dir /path/to/originals`と、Git管理対象外の`artifacts/provided-selection.json`を使います。選定入力は`id`・`collection`・`file`・`sha256`・`alt`を持つ配列で、`file`は提供フォルダからの相対パスです。
- ローカルの生成記録`artifacts/provided-image-manifest.json`に、原寸の寸法・ICCのSHA-256・圧縮設定と、各WebPの寸法・容量・SHA-256を記録します。選定入力・生成manifest・原寸画像はコミットしません。
- 公開用の実容量と配信確認は、今回の生成・検証完了後に[検証記録](validation.md)へ記録します。共有用画像`assets/share.jpg`も今回の掲載写真から作成します。

写真の著作権は写真家に帰属します。公開リポジトリへの閲覧コピーの収録は、閲覧者への再利用許諾を意味しません。

## 「日々について」の出典と編集方針

ユーザーが提供したGrokの人物紹介は調査の手掛かりとし、掲載する事実は本人の公開ページで確認しました。居住地、性別、年齢、本業、性格などの推定は掲載しません。以下は今回追加する内容の出典記録であり、公開先への反映確認は別途行います。

| データ | 出典・扱い |
| --- | --- |
| `artist.description` | [本人note「二度と同じ瞬間には出会えないから」](https://note.com/___hibi___/n/n8b3c0d8e5913)（2024-04-13）と[「『THE SNAP 2024』主催の想い」](https://note.com/___hibi___/n/ndb3fc53e8e1b)（2024-08-13）に基づく事実の要約。街、光、人の動き、日常の場面を撮ることを紹介する編集文で、本人の直接発言として引用しません。 |
| `artist.viewingNote` | ユーザーの「写っている一瞬を丁寧に紐解いて鑑賞してほしい」という要望を基にした、鑑賞者への案内。本人が公表した作品解説や引用文ではありません。 |
| `artist.essay` | 上記の本人note「二度と同じ瞬間には出会えないから」の出典情報。作者紹介には記事への個別ボタンを表示しません。 |
| `artist.activities` / 交 | [cafe DODOの開催告知](https://www.dodo-sakae.com/post/2025-11-20-thu-12-10-wed-group-photo-exhibition-vol-15-%E4%BA%A4)が日々とアカウントを明記。2025年11月20日〜12月10日。 |
| `artist.activities` / 々 | [本人Instagramの2025年9月18日投稿](https://www.instagram.com/hibigraph116/p/DOwxLJTEyY6/)のプロフィール一覧上の告知画像に、個展・9月20〜21日・HuBaseと記載。本人X投稿の転載も開催を裏付ける。 |
| `artist.activities` / MIX UP！ | [cafe DODOの開催告知](https://www.dodo-sakae.com/post/2024-11-28-thu-12-29-sun-group-show-mix-up%EF%BC%81-culmination-of-2024)の後半欄に日々とアカウントを明記。参加期間は2024年12月13〜29日。 |
| `artist.activities` / THE SNAP 2024 | 本人の[開催概要](https://note.com/___hibi___/n/n58da171c86a3)と[主催の想い](https://note.com/___hibi___/n/ndb3fc53e8e1b)から、主催、2024-10-08〜20、名古屋・セントラルギャラリーを確認。人数や終了時刻は資料間で差があるため記載しません。 |
| `artist.activities` / DAYS | [本人の販売ページ](https://hibi-11.stores.jp/items/65aa948bba8c3d0c07577375)をブラウザで確認。初の写真集、愛知・京都で撮影、B5判・28ページという情報を掲載。価格・在庫・使用機材は掲載しません。 |
| `artist.links` | カラー／モノクロのInstagram、X、note、Storeへの固定リンク。フッターのInstagramは引き続き表示中のコレクションに連動します。 |

プロフィール画像は[本人のlit.link](https://lit.link/hibi1162)で表示されている画像です。ブラウザで確認した配信URLから取得し、配信されたWebPをそのまま保存しました。公開用は`assets/profile/hibi.webp`、240 × 240px、3,424 bytesです。切り取り、色調変更、描き足し、再圧縮は行っていません。配信URLの署名などは公開資料に保存しません。

`artist.statement`は`null`を維持します。上記の要約と鑑賞案内を合わせて、本人の正式なステートメントとして扱わないでください。2026-10-26のユーザー指示により、紹介に追加したlit.linkの引用メッセージと出典リンクは削除しました。プロフィール画像の出典は引き続きlit.linkです。

## 以前のInstagram由来40点（2026-10-26、履歴）

以下は今回の提供40点への差し替え前の記録です。「現在」などの記述と容量・寸法は、2026-10-26時点を表します。現行の画像出典・生成方法には適用しません。

### 当時の掲載選定

ユーザーの2026-10-26の明示依頼「カラー・モノクロ各20点、既知のInstagramから」に基づき、[カラー @hibigraph116](https://www.instagram.com/hibigraph116/)と[モノクロ @hibi_mono](https://www.instagram.com/hibi_mono/)から各20点、合計40点を選定しました。既存ログイン済みChromeで各プロフィールの実DOMと画像を確認し、カラーの展示告知1枚を除外して写真を選びました。第三者のストック写真や生成画像は含みません。

各作品の投稿URLは`data/works.js`の`source`に保存しています。`selectionStatus: 'approved'`は今回のユーザーによる公開選定指示に基づく状態であり、写真家本人から各写真の個別承認を別途取得したという記録ではありません。掲載順は画面上で鑑賞するための編集上の選定で、写真家による正式なシリーズや制作意図を主張しません。未提供の正式な作品名・作品解説・ステートメントを創作しません。以下のプロフィール紹介文と鑑賞の案内は、本人の公式ステートメントとは区別した編集文です。

現在のカラー20点は初回v1のカラー5点を入れ替えたものです。モノクロの640px試作12点とそのWebP 24ファイルは今回の画像に置き換え、旧試作ファイルを削除しました。40点版は2026-10-26にGitHub Pagesへ公開し、209ファイルのHTTP・MIME・SHA-256一致と、公開画面で各コレクション20点の表示・切り替えを確認しました。

### 当時の取得画像と閲覧コピー

- 取得した40点はすべてJPEGで、幅1440px、高さ1150〜1800pxです。写真家が保有する撮影原本そのものではなく、Instagramで配信された画像です。全40点に埋め込みICCプロファイルはありません。
- 取得JPEGは`assets/reference/instagram/`に保存し、Git管理・一般公開の対象外です。取得後の元ファイルは変更していません。
- 公開対象は`assets/photos/instagram/`のWebP 200ファイル、合計20,611,074 bytesです。1作品につき4つの閲覧サイズとサムネイルを用意しました。
- 長辺400・800・1400・2200pxを候補とし、取得元の長辺を上限にします。今回の最大サイズは長辺1440〜1800pxです。拡大生成、クロップ、色調変更、回転はせず、投稿に含まれる作者の白枠・署名も画像の一部として維持します。
- `variants`の`width`・`height`は各書き出し画像の実寸です。元比率を保った縮小とWebP圧縮だけを行い、EXIF/GPSは閲覧コピーに移しません。
- 生成記録はローカルの`artifacts/instagram-image-manifest.json`です。投稿URL、取得画像の寸法・バイト数・SHA-256、各WebPの寸法・SHA-256・圧縮設定を含みます。署名付き画像配信URLやログイン情報は公開資料に記録しません。

写真の著作権は写真家に帰属します。公開リポジトリへの閲覧コピーの収録は、閲覧者への再利用許諾を意味しません。

### 当時の40点の投稿元と取得JPEGの検証記録

以下は当時の生成manifestから転記した取得画像の記録です。各コレクション内は2026-10-26時点の掲載順です。SHA-256は閲覧用WebPではなく、取得JPEGの値です。

#### カラー20点

| 固定ID・投稿元 | 取得JPEG寸法 | バイト数 | SHA-256 |
| --- | --- | ---: | --- |
| [hibi-color-c3ka-2gvly8](https://www.instagram.com/hibigraph116/p/C3ka-2GvLY8/) | 1440 × 1152 | 364100 | `6c31e01c2ba4bb1a10ca1e75d8b6deb31cce8fad6bd3ea60a57dda87afbffb57` |
| [hibi-color-c24kdsgpogc](https://www.instagram.com/hibigraph116/p/C24kdsgPOgC/) | 1440 × 1799 | 491516 | `d88030a60c46b2af4a12bd0a874da870b183cba06952636e347aab3addf48db6` |
| [hibi-color-c2m3qiqv9rn](https://www.instagram.com/hibigraph116/p/C2m3qIQv9Rn/) | 1440 × 1152 | 122299 | `f379cb97501161850907da57eddfc12db8eef2bed2d343d4f01c65e648b2d2e7` |
| [hibi-color-c3nh3b9pxgo](https://www.instagram.com/hibigraph116/p/C3nH3b9Pxgo/) | 1440 × 1799 | 228294 | `da779c23f972713683cb2bbd50c64860cc6fa6cc066bc467b4ad8de14e0ff7cf` |
| [hibi-color-c3t5apbpm-l](https://www.instagram.com/hibigraph116/p/C3t5ApBPM-l/) | 1440 × 1152 | 210564 | `ba455ef0b4c8415d73a071dc90421d1612c58cfd19df59e20ec439f9bc72c2b3` |
| [hibi-color-c2mwrljvzwv](https://www.instagram.com/hibigraph116/p/C2MwRLJvzWV/) | 1440 × 1152 | 52785 | `c6d16cafc6d56d28f4a58c88ca5dc81766e9ccc101029a70eff0b1b462ca4f7d` |
| [hibi-color-c1amw-rpttt](https://www.instagram.com/hibigraph116/p/C1amW_rPttT/) | 1440 × 1152 | 115715 | `a0ccc1dfd8e170592ac8d751c36e9cf6908bc5ddf6bb002831d2488dd8be34a1` |
| [hibi-color-c2eoagrp1z7](https://www.instagram.com/hibigraph116/p/C2eoAgrP1z7/) | 1440 × 1152 | 111391 | `3f163dca38ac0b1e8bb6a582324b6cbbdf7b6dd9366e609f7abb0f3ba6388018` |
| [hibi-color-c2htjbnp65p](https://www.instagram.com/hibigraph116/p/C2htJbNP65p/) | 1440 × 1799 | 229023 | `c48c87525177fca2c837a7901addf7699e7a7779446b8a47fc64dc0421f3aba7` |
| [hibi-color-c07xgqnp-zi](https://www.instagram.com/hibigraph116/p/C07xGqnP-Zi/) | 1440 × 1798 | 176088 | `e2c7c6a53a6128124113859c93e1eb0df5c53f391acecc7e15098fb398002db5` |
| [hibi-color-c08jirrvbni](https://www.instagram.com/hibigraph116/p/C08JIRrvbNI/) | 1440 × 1152 | 125992 | `6f720e70ad0cca805bdd72c5d2d61999c514c6c9fa2ade8794a99455dad404d3` |
| [hibi-color-c1bz4x-v7md](https://www.instagram.com/hibigraph116/p/C1Bz4x_v7md/) | 1440 × 1798 | 166947 | `a79debaca17af40046836698df54f4c924be01390a99b01d0767752cdb79c787` |
| [hibi-color-c0qbb9bvrru](https://www.instagram.com/hibigraph116/p/C0qbB9bvRRu/) | 1440 × 1152 | 73966 | `4cda76b0b6afc1d843f20ad52adc6f054bc5f56e8a3b947fdf437ee8758b5a30` |
| [hibi-color-c2pi3hopran](https://www.instagram.com/hibigraph116/p/C2Pi3hOPraN/) | 1440 × 1798 | 114724 | `6bbfffc60454cb0cd1e468e3794de68eadf0fdcccfffe73901c991676a8ef695` |
| [hibi-color-c08xx1zv8rl](https://www.instagram.com/hibigraph116/p/C08xx1Zv8rl/) | 1440 × 1798 | 116177 | `d2aa6d3c58c566a3e15afcec1cc3d8f74fd8ac571fb38339a0e80af488d10443` |
| [hibi-color-c0-tfbvpj-1](https://www.instagram.com/hibigraph116/p/C0_TfBVPj_1/) | 1440 × 1152 | 106548 | `57b035671603ef2d91355443e0a0cd2500c4b7a74c401786cb5f7c35520e086c` |
| [hibi-color-c2j95zfvdju](https://www.instagram.com/hibigraph116/p/C2J95ZFvdjU/) | 1440 × 1799 | 177139 | `f5e5450647a252b05fef85a7eb8e30071ece0775e7b78df91231dff0187f32cc` |
| [hibi-color-c0lkjccp5ip](https://www.instagram.com/hibigraph116/p/C0lkJcCP5iP/) | 1440 × 1797 | 127727 | `45bcb6f83eccd0635682bbc395f9ddc6ee5fb37d23e26b71f5e757ea8ad421df` |
| [hibi-color-c0i8wcbpauw](https://www.instagram.com/hibigraph116/p/C0i8wcBPauw/) | 1440 × 1798 | 157235 | `0b1537dd89b2472de1451d4028d0c6441a45c5dcc5d6c5e0c043c76d109c3ebe` |
| [hibi-color-c0kjj7evchw](https://www.instagram.com/hibigraph116/p/C0kjJ7EvCHw/) | 1440 × 1152 | 159933 | `ae004fd427f14afd5f9c57ba5ade09ce74d7b9fbf9c5f726064de5cbce8b43bb` |

#### モノクロ20点

| 固定ID・投稿元 | 取得JPEG寸法 | バイト数 | SHA-256 |
| --- | --- | ---: | --- |
| [hibi-mono-c2htguvpsjj](https://www.instagram.com/hibi_mono/p/C2htguVpSJj/) | 1440 × 1799 | 145000 | `ed3e556ac343444a890cb5fd61fb0c1f6c2ce15c9f5bf4b79db348c6ce68df7c` |
| [hibi-mono-c2eohefpy3w](https://www.instagram.com/hibi_mono/p/C2eoHEFpy3W/) | 1440 × 1152 | 95941 | `f02ba88476424ce384ebe8fb7ae2c1b8725204b5145284f1c162e27d406cfdbe` |
| [hibi-mono-c2pi9frj4vd](https://www.instagram.com/hibi_mono/p/C2Pi9FrJ4vd/) | 1440 × 1798 | 51325 | `5d0ba4ee2612e120b467e01e2ed04c59826887c6f7ca584aa3ce230adc939579` |
| [hibi-mono-c1amcdcbp6n](https://www.instagram.com/hibi_mono/p/C1amcDCBp6N/) | 1440 × 1152 | 150767 | `4428e10a2fcdb711372a9c3635b5f7994ff14935ca046729ae4642e44d0a99bb` |
| [hibi-mono-c0i9aqbjbyi](https://www.instagram.com/hibi_mono/p/C0i9AqBJBYi/) | 1440 × 1797 | 183031 | `571ed3543f6aa0344a58ab7f66d9b6dc26a2c2027e84945e1068f8fd09540df4` |
| [hibi-mono-c2j-fpzjncr](https://www.instagram.com/hibi_mono/p/C2J-FPZJNCr/) | 1440 × 1800 | 229321 | `cd6067e23f1910b4fd42e87a31950c67e12ab1c403f5a7a4667574f3cee302cf` |
| [hibi-mono-c3nh-iip1l4](https://www.instagram.com/hibi_mono/p/C3nH_IIp1L4/) | 1440 × 1799 | 333115 | `0d3c33a9a49ae5a931cac90c4ea17ec64ebeccc52e11c7d68de1890dd9f668e7` |
| [hibi-mono-c0-tmtsp2d5](https://www.instagram.com/hibi_mono/p/C0_TmTSp2d5/) | 1440 × 1150 | 74676 | `687d5de7b5654b648a6edcea5d7a8aa8f635e8d71722522cdd8b0b0278532e78` |
| [hibi-mono-c3kbhilp50o](https://www.instagram.com/hibi_mono/p/C3kbHiLp50O/) | 1440 × 1152 | 177484 | `494b43e34b4a267bef83904ea7c7cf9b8e117ec88be0a1e4d33bfeb25741ad69` |
| [hibi-mono-c3t5ik5jbwu](https://www.instagram.com/hibi_mono/p/C3t5Ik5JBwu/) | 1440 × 1152 | 420725 | `9d071c5e8bf322158ebfd97683f90c81afd4b7e3c2c28bc2c9a9df650ded9b6f` |
| [hibi-mono-c2m3ychjyn4](https://www.instagram.com/hibi_mono/p/C2m3yCHJYn4/) | 1440 × 1152 | 291936 | `31a4036887a248794b66548ab136bb4d89cd30ae1a992ec4ba130e170b653564` |
| [hibi-mono-c07w7xmv-kx](https://www.instagram.com/hibi_mono/p/C07w7XMv-KX/) | 1440 × 1798 | 219216 | `a9f74223d4d4546eb496e461609bfd5612ea705ce7fa298c6de31a2dd48b4e38` |
| [hibi-mono-c08jprlpaao](https://www.instagram.com/hibi_mono/p/C08JPRLpaaO/) | 1440 × 1152 | 189232 | `c11e4cae875fbbbf2bc2654e47748c6899fe8d27ec12552496239f8e225ff6a9` |
| [hibi-mono-c0kjpbyv8lo](https://www.instagram.com/hibi_mono/p/C0kjPbYv8Lo/) | 1440 × 1152 | 218610 | `d059d8fadde97c45223f88a77cdcd06c2f108cda562a866b0e42289a66afb0a8` |
| [hibi-mono-c1b2yuvjrya](https://www.instagram.com/hibi_mono/p/C1B2YUvJRYA/) | 1440 × 1798 | 622416 | `c1d6c787b6594164a4088c08d415bb1060fd825b22916e1e4305b7321b7db6bd` |
| [hibi-mono-c24kkggjrrd](https://www.instagram.com/hibi_mono/p/C24kkggJRrd/) | 1440 × 1799 | 514482 | `b8f5c75552feec4a9dbecb32016df1a074a81973c07f7ebf5f9b816c32bbc810` |
| [hibi-mono-c0qbiy3jph1](https://www.instagram.com/hibi_mono/p/C0qbIY3JPH1/) | 1440 × 1152 | 121934 | `f04089b1ffe60e4aaaa1e30093c2e01725b78d28bddfd80ae99d405cde633322` |
| [hibi-mono-c0lkthppyf6](https://www.instagram.com/hibi_mono/p/C0lkThppyf6/) | 1440 × 1797 | 313658 | `412097e59fb15234274ba2f46df2d49685514fb6cae19a19c979575ae91b57ce` |
| [hibi-mono-c08x318prxk](https://www.instagram.com/hibi_mono/p/C08x318prXK/) | 1440 × 1797 | 59170 | `b64b31203d2514b52caf2fc79f5a445b732cc736aa287af0840cc519e4c4d209` |
| [hibi-mono-c2mwzkzj1lz](https://www.instagram.com/hibi_mono/p/C2MwZkZJ1lz/) | 1440 × 1152 | 50062 | `67018a976bca095c739dc821e5f6b04e93fe5b31b747bc1b0648b96d5d3a977e` |

## 初回v1の出典記録（2026-10-25）

以下は初回5点版の履歴です。現在の40点の出典・掲載状態を示すものではありません。旧5点は今回のカラー20点への入れ替えに伴い、現在の作品配列から外れています。

### 利用範囲

初回v1では、写真家「日々」氏の作品と確認できる展示主催者の公開ページから取得した5点を掲載作品に選定しました。第三者のストック写真や生成画像は含めていません。

ユーザーの2026-10-25の「閲覧できるサイトになるまで全作業を継続する」という公開指示に基づき、5点から作成した閲覧コピーを公開対象としています。`selectionStatus: 'v1'`はこの公開版への選定を表し、各写真について写真家本人の個別承認が別途得られたことを表すものではありません。正式な作品名・作品解説・ステートメントは創作せず、未提供の項目は`null`です。

公開用は`assets/photos/v1/`のWebP 20ファイル（5点×長辺800・1400・2200pxおよびサムネイル、合計約5.91 MB）と、共有用`assets/share.jpg`です。原寸取得画像の`assets/reference/`、旧ローカル試作画像の`assets/photos/reference/`はGit管理対象外です。写真の著作権は写真家に帰属し、公開リポジトリへの収録は閲覧者への再利用許諾を意味しません。

取得後のトリミング、色調変更、回転、描き足しは行っていません。Web用に縦横比を保って縮小・圧縮し、画像の実寸を`data/works.js`の`width`・`height`と各`variants`に記録します。作品名・撮影場所・撮影日・人物の属性は資料から確認できないため付与していません。以下の見た目の説明は画面確認のための観察であり、本人の作品解説ではありません。

### 本人作品と判断した根拠

- [cafe DODO・2025年展示紹介](https://www.dodo-sakae.com/post/2025-11-20-thu-12-10-wed-group-photo-exhibition-vol-15-%E4%BA%A4): `日々 / Instagram @hibigraph116` 欄の `about the works in the venue` 直下に3点が掲載されています。次の出展者 `Hiro.` 欄より前の画像だけを対象にしました。
- [cafe DODO・2024年展示紹介](https://www.dodo-sakae.com/post/2024-11-28-thu-12-29-sun-group-show-mix-up%EF%BC%81-culmination-of-2024): `日々 / Instagram @hibigraph116` 欄のコンセプト直下に2点が掲載されています。
- どちらの紹介ページもユーザー指定の [Instagram @hibigraph116](https://www.instagram.com/hibigraph116/) にリンクしています。プロフィール画像や他の出展作家の画像は取得していません。
- 配信URLの画像変換パラメータが付く前の、同じWixメディア識別子を持つ原寸配信URLからダウンロードしました。

### ファイル一覧

| ファイル | 寸法 | 出典内の位置 | 見た目の観察 |
| --- | --- | --- | --- |
| `assets/reference/hibi-2025-01.jpeg` | 3023 × 4534 | 2025年・日々氏の作品1 | タイル壁に差す強い光と、道路沿いを歩く人物のシルエット。縦位置。 |
| `assets/reference/hibi-2025-02.jpeg` | 4192 × 6284 | 2025年・日々氏の作品2 | 白い建物壁面、青緑の陰影、奥に見える一脚の椅子。縦位置。 |
| `assets/reference/hibi-2025-03.jpeg` | 4529 × 3019 | 2025年・日々氏の作品3 | 樹木の暗部を抜ける通路、明るい建物、遠方の人物。横位置。 |
| `assets/reference/hibi-2024-01.jpeg` | 6000 × 4000 | 2024年・日々氏の作品1 | 階段と歩行者の影。上下の感覚が揺れる構図。横位置。 |
| `assets/reference/hibi-2024-02.jpeg` | 7728 × 5152 | 2024年・日々氏の作品2 | 窓枠越しのカフェテラス、座る人々、樹木、周囲の建物。横位置。 |

### 画像取得元

- [hibi-2025-01.jpeg](https://static.wixstatic.com/media/59f1cd_582cb400d6bc409fa1305cd3c8d646fb~mv2.jpeg)
- [hibi-2025-02.jpeg](https://static.wixstatic.com/media/59f1cd_7f8805be04014b33ac66f0aedd1f7cc0~mv2.jpeg)
- [hibi-2025-03.jpeg](https://static.wixstatic.com/media/59f1cd_a2457f393e2e42ac9dcb4e6377424b27~mv2.jpeg)
- [hibi-2024-01.jpeg](https://static.wixstatic.com/media/59f1cd_fac47f3989fb43fcac045c2c058ea7e5~mv2.jpeg)
- [hibi-2024-02.jpeg](https://static.wixstatic.com/media/59f1cd_4c6ca8463aca4327b8b3d5850d85858d~mv2.jpeg)

### 原寸ファイルの検証記録

全5点のダウンロード終了コード0、JPEG終端マーカー `FFD9`、寸法、実画像の表示を確認しました。

| ファイル | バイト数 | SHA-256 |
| --- | ---: | --- |
| `hibi-2025-01.jpeg` | 2862468 | `02bf45125c0a4884d9572d8f65d3fc0a9965202c510b7e05a37a600792e6f97e` |
| `hibi-2025-02.jpeg` | 8189344 | `807d089ff197fb153c84e3eb255737ebb2f6301f5d7f45d41935893d75335d86` |
| `hibi-2025-03.jpeg` | 2068859 | `ffc85321cbd09d5f546f62d7828da8650019f5fdf1c0bf68fb13ee4bdb0fceef` |
| `hibi-2024-01.jpeg` | 498690 | `bb1b15555052cfad5efb3105225810f986145939ca61b698d9ea0491fceaabe2` |
| `hibi-2024-02.jpeg` | 1755978 | `977e8977b7e0a06751175bf046b4d3b44015ccd81b361bd9110edb78e449d71d` |

### 展示履歴の確認状況（2026-10-29）

ユーザーから提示された10件の展示一覧に基づき掲載。ログイン済みInstagramの本人の展示ハイライトを照合し、一覧にない2件も追加した。

- 「四重奏」（2023年5〜6月）と「[#] vol.8 —「 」—」（2024年1月）は[本人の展示ハイライト](https://www.instagram.com/stories/highlights/17873416622904533/)の告知画像で名称・会期・会場を確認。
- 「the pupil 4.0mm」は[主催者のInstagram告知](https://www.instagram.com/p/CyNxgyDB8Kz/)と本人のハイライトで参加、2023年10月25〜29日、pif & metureを確認。
- 「My Point of view」は本人のハイライトに参加告知があり、[主催者の記録](https://note.com/kikumarupics/n/n9db5537ce175)に会期・会場・当時のアカウントが記載されている。[本人のモノクロアカウント](https://www.instagram.com/hibi_mono/)には当時のX IDと現アカウントへのリンクがある。
- 「My Leica Photo」は[会場のInstagram告知](https://www.instagram.com/p/C6tHqZJvLcx/)と本人のハイライトで参加、2024年5月9〜14日、F16（大阪）を確認。
- 「Leve me展」はユーザーの一覧ではvol.14だが、同じ会期・会場を記載する[主催者の告知](https://hyougen-sha.com/leve-me-vol-4/)ではvol.4のため、vol.4と表記。本人参加はユーザー提供の情報に基づく。
- 「FILM LEICA展」「UNBOUND」はユーザー提供の情報に基づく。本人参加を直接確認できる個別の公開告知は今回見つからなかったため、外部リンクを設けない。
- 「MIX UP！」は会場公式で後半参加（2024年12月13〜29日）を確認。
