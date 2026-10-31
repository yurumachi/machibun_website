# 共有と検索のための設計（favicon・OGP・sitemap）

2026-10-18 に決めたことと、作るものの一覧。

## 決めたこと（user）

| 問い | 答え |
|---|---|
| 本番の URL | `https://machibun2026.yurumachi-yuruyuru.workers.dev` のまま。独自ドメインにしたら `astro.config.mjs` の `site` を変えて作り直す |
| favicon と共有の画像の元 | ロゴの SVG（`web/public/assets/logo.svg`）とブロブの色から、repo の中で作る |
| 出展者のページを共有したときの画像 | その出展者の1枚目の写真。写真が無ければサイト共通の画像 |
| イベントの構造化データ（`Event`） | 入れない。Google の検索結果にイベントとして出る表示は、日本と日本語に対応していない（https://developers.google.com/search/docs/appearance/structured-data/event 、2026-10-18 に確かめた）。対応したら、日付だけ（時間は未定のため）で足すことを考える |

## 決めたこと（agent、前提として明記）

- Preview（`WORKERS_CI_BRANCH` が `main` でないビルド）には `<meta name="robots" content="noindex">` を入れ、検索に載せない。手元のビルドにも入る。
- `og:url`・sitemap の URL は、どのビルドでも本番の URL にする（`site` から作る）。canonical は `noindex` でないページにだけ書く。Preview には本番に無いページ（試しの出展者など）があり、本番の URL を指すと 404 になるため（Codex のレビュー）。
- `noindex` は「ビルドが `main` でない」か「ページが `noindex` を渡した」の OR にする。ページから Preview の `noindex` を外せないようにするため。`robots.txt` で `Disallow` はしない。Google が `noindex` を読めなくなるため。
- 404 のページにも `noindex` を入れる。
- 共有の画像に文字（日付など）は入れない。ロゴは path だけで描かれているのでそのまま使えるが、日付を入れるには、ビルドの環境に日本語のフォントが要る。Workers Builds の環境にあるかは確かめていない。日付は `og:description` で伝える。

## 作るもの

### 1. favicon
- `web/src/pages/favicon.svg.ts`: ブランドのグラデーション（`--gradient-brand`）の丸みのある四角に、ロゴの「まち」「ぶん」を 2×2 に並べ、本文の地の色（`#1a1b20`）で載せる。白で載せる形は採らない。グラデーションの明るい水色（`#58e6ff`）の上の白は、コントラストが 1.5:1 ほど（地の色なら 11.6:1）で、16px では読めないため。（2026-11-01、user が6つの候補から選んだ）。SVG はロゴの path から、ビルドのたびに作る（`web/src/lib/brand-art.ts`）。
- `web/src/pages/apple-touch-icon.png.ts`: iOS は SVG のアイコンを使わないので、同じ SVG を角を丸めずに sharp（Astro の画像処理で入っている）で 180×180 の PNG にする。PNG は commit せず、ビルドのたびに作る。
- `Base.astro` に `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` と `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`。これで多くのブラウザは `/favicon.ico` を取りに行かなくなるが、取りに来るクライアントは残る（Codex のレビュー）。

### 2. 共有の画像（OGP）
- `web/src/pages/og.png.ts`: 1200×630。暗い背景に、ブロブを3つ（`--blob-a` から `--blob-c` の色）置き、真ん中にロゴ。SVG を組み立て、sharp で PNG にする。
  - SVG の描画（librsvg）は `in oklch` の補間を知らないので、oklch で計算した中間の色を stop に並べて近づける（`brand-art.ts` の `oklchStops`）。sRGB の2色の stop にすると、水色とピンクの間が tokens.css の色と違って見えた。
- 出展者のページ: 1枚目の写真を `getImage` で幅 1200 の JPEG にする（4:3 のまま。小さい写真は大きくしない）。共有先は 1200×630 でなくても画像を出すので、切り抜いて大きさをそろえることはしない。`og:image:width` と `og:image:height` は `getImage` の結果から書く。CMS の URL を直接渡さないのは、共有先が CMS に取りに来るのを避けるため。

### 3. `Base.astro` に足すもの
`Base.astro` の props に `image?`（共有の画像の URL・幅・高さ・説明）と `noindex?` を足す。説明は `og:image:alt` に書く。共通の画像は「まちナかぶんかさいのロゴ」、出展者の写真は CMS の写真の説明（無ければ出展者の名前）。

```
{!noindex && <link rel="canonical" href={canonical} />}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="まちナかぶんかさい" />
<meta property="og:locale" content="ja_JP" />
<meta property="og:title" content={fullTitle} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonical} />
<meta property="og:image" content={image} />  （絶対 URL）
<meta property="og:image:width" … /> <meta property="og:image:height" … /> <meta property="og:image:alt" … />
<meta name="twitter:card" content="summary_large_image" />
{noindex && <meta name="robots" content="noindex" />}
```

`canonical` は `new URL(Astro.url.pathname, Astro.site)`。

### 4. sitemap
- `@astrojs/sitemap` を入れ、`astro.config.mjs` に `site` と integration を足す。ビルドしたページから `/sitemap-index.xml` を作る。404 は外す。
- `web/public/robots.txt` に `Sitemap:` の行を書く。今の `robots.txt` は Cloudflare が自動で付けている content signal で、自前のものと合わさるかは作るときに確かめる。

## 確かめ方
- Preview で、ページの `<head>` に上のタグが出ていて、`noindex` が入っていること。
- 本番に入れた後に確かめること:
  - Facebook の Sharing Debugger と LINE で共有したとき、カードに画像が出ること
  - タブに favicon が出て、`/favicon.svg` の取得が 200 であること
- canonical・sitemap・配信の URL で、末尾のスラッシュの有無がそろっていること。配信はスラッシュ付きの URL（`/exhibitors/<識別名>/`）で、付けない URL は 307 で転送される。トップページから詳細へのリンクもスラッシュ付きにそろえた。
- `main` のビルドの成果物に `noindex` が無いこと。
- PageSpeed の SEO とベストプラクティスが 100 のままであること。

## やらないこと
- `favicon.ico`。今のブラウザは `<link rel="icon">` の SVG を使う。
