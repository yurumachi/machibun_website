# 引き継ぎ: 管理画面と公開サイトを分ける

## 決まったこと（2026-10-16）

EmDash を入力の場所（管理画面と編集用の鍵のフォーム）にだけ使い、公開サイトはビルドで作った静的なファイルで配る（ADR 0006）。CPU の上限（無料プランで 10ms）のため。測った結果は `docs/notes/emdash-gates.md`。

| 項目 | 決まったこと |
|---|---|
| フォルダ | `cms/`（EmDash。2026-10-16 に `site/` から名前を変えた）と `web/`（公開サイト、Astro の静的なサイト）を同じ repo に置く |
| Worker | もとの `machibun-website` の名前を `machibun-cms` に変えた。公開サイト用の Worker を新しく作り、名前を `machibun2026`（URL は `machibun2026.yurumachi-yuruyuru.workers.dev`）にした（静的なファイルだけ）。ページの URL には年を入れない。パスキーはホスト名に結び付くので、管理者は作り直した |
| 中身の受け渡し | `web/` のビルドで、CMS の REST API を読むだけの API token（`content:read`・`media:read`）で読む。`web/` の Preview は CMS の Preview を、本番は CMS の本番を読む。token も分ける |
| ビルドし直すきっかけ | 公開・公開の取り消し・削除、公開中のものの保存があると、`cms/` のプラグインのフックが `web/` の Deploy Hook を呼ぶ。下書きの保存では呼ばない。コードの変更では、ビルドの設定の `path-includes` で `cms/**`・`web/**` ごとに絞る |
| 写真 | 元は KV のまま（ADR 0004）。`web/` のビルドで取ってきて縮め、公開サイトから配る |
| 下書きのプレビュー | 作らない。公開してから直すことが多いと分かったら考える |
| cron | 1時間ごと（`0 * * * *`）。予約した公開は使わない。使うときは 15 分ごとにする |
| 関門1 | 管理画面と編集用の鍵のフォームが Error 1102 で止まらないかで判断し、関門2と一緒に確かめる |
| 言葉 | 「公開サイト」「管理画面」を GLOSSARY に足した |
| 年と URL | 年は URL のホスト名に入れる（いまは Worker の名前 `machibun2026`。独自ドメインにしたら `machibun2026.<ドメイン>` のようなサブドメイン）。次の年は、Worker の名前を変えるか DNS で名前を付けて分ける。パス（`/2026/…`）で年を切り替えることはしない。ページの URL は `/exhibitors/<識別名>`・`/notices/<識別名>` |

## 次にやること

1. （済み、2026-10-16）`site/` を `cms/` に名前を変え、cron を `0 * * * *` にした。Worker の名前とビルドの設定の root は、4 で直した。
2. （済み、2026-10-16）`web/` を作った。トップページ・404・レイアウト・CSS・画像を `cms/` から移し、REST API から読む形にした（`web/src/lib/cms.ts`）。手元の CMS を読んでビルドが通り、写真は `/_astro/` の webp に縮まる（2.27MB が 57〜169KB）。
   - 手元のビルド: `web/.env` に `CMS_URL=http://localhost:4321` と、手元の管理者で作った読むだけの token（`CMS_TOKEN`）を置く。token は `POST /_emdash/api/admin/api-tokens`（`{"name":"web-build-read","scopes":["content:read","media:read"]}`）で作る。
   - 管理者の token で読むと、参照する側（出展者・出演枠）から取る API は、下書きの版を返す。一件を取る API（`{collection}/{id}`）は下書きの名前を、`{id}/references/{relation}/children` は下書きで選び直した参照を返す（手元で確かめた。`relations.ts` の `stagedPageFor`）。API token は管理者しか作れないので、権限では避けられない。
   - そこで、一覧（`status=published`、公開中の版を返す）と、参照される側（カテゴリ・出演者・ステージ）から取る `{id}/references/{relation}/parents` だけを使う。`parents` は公開中のつながりだけを返す。下書きを残したままビルドして、公開サイトに下書きが出ないことを確かめた。
   - REST API は、索引の無い項目では並べ替えられない（`Custom fields must be indexed before sorting`）。並べ替えは `web/` の側で行う。
   - ビルドのたびに CMS の Worker に、一覧 10 回（トップ 7・出展者の詳細 2・お知らせの詳細 1）と、参照される側の数だけの GET（カテゴリはトップと出展者の詳細で2回ずつ）が届く。1回ごとの CPU は 8〜95ms（中央 12〜20ms、2026-10-16 の Preview、emdash-gates.md）。
3. （済み、2026-10-16）`cms/` を管理画面だけにした。公開ページのキャッシュの設定（`routeRules`・`cache`）を消し、`/` は `/_emdash/admin` に転送する。フックのプラグイン（`cms/src/plugins/rebuild-web.ts`）を足した。
   - 公開・公開の取り消し・削除・復元と、公開中で下書きの版が無いものの保存（下書きの仕組みが無いカテゴリ・ステージ・出演枠）で、環境変数 `DEPLOY_HOOK_URL` に POST する。下書きの保存・破棄・新しい下書きでは呼ばない。手元で、コンテナの中に立てた受け口（port 4599）で確かめた。
   - 手元の `cms/.env` の `DEPLOY_HOOK_URL` は `http://localhost:4599/hook`。受け口が無いときは、呼んで失敗したことがログに出るだけで、公開は止まらない。
   - 本番と Preview では、Worker の secret に `DEPLOY_HOOK_URL` を置く（4 で作る）。無ければ、警告をログに出してビルドし直さない。
   - メディアライブラリの「差し替え」は、同じファイル名のまま写真を上書きし、EmDash のフックを一つも呼ばない。そこで `cms/src/middleware.ts` で、差し替えが成功したら Deploy Hook を呼ぶ。写真のファイルは ETag 付きで返るので、Astro はビルドのときに確かめ直して新しい写真を取る。差し替えで幅と高さが変わっても中身のデータには古い値が残るので、協賛のロゴは `inferSize` で測る。
   - Deploy Hook の呼び出しが失敗しても、やり直さない（ログに残るだけ）。公開サイトが古いままなら、Workers Builds の画面から公開サイトのビルドをやり直す。
   - 出演者かステージが公開されていない出演枠は、スケジュールに載せない。
4. （済み、2026-10-16）Cloudflare の作業（feat の Preview まで）。
   - Worker の名前を `machibun-cms` に変えた。`cf` に名前を変えるコマンドが無いので、user が画面で変えた。ビルドの設定と D1・KV とのつながりは、名前を変えても残った。
   - 管理画面のビルドの設定の root を `/cms` に、ビルドが動くフォルダを `cms/*` にした。
   - 本番と Preview の D1 を作り直し、user が両方で管理者を作った。Preview は、最初のパスキー登録に失敗してパスキーの無い管理者が残ったので、もう一度作り直した。
   - 公開サイトの Worker（今の名前は `machibun2026`）は、user が画面の「リポジトリをインポート」で作った。`cf` では Git につないだ Worker を新しく作れない。
   - 両方の管理画面で読むだけの token（`web-build-read`）を作り、公開サイトのビルドの設定の変数 `CMS_TOKEN`（シークレット）に入れた。token は会話を通さず、user の端末で入れた。
   - 公開サイトの Preview: https://feat-emdash-site-machibun2026.yurumachi-yuruyuru.workers.dev 。Preview の CMS を読んでビルドが通った。
5. （済み、2026-10-17）PR #4 を `main` に取り込んだ（merge commit `2277df2`）。
   - 取り込む前に、管理画面の本番用のビルドの設定（`f5bb4f2d-…`）を `main` に、Preview 用（`7346b588-…`）を「`main` 以外」に戻した。
   - 公開サイトの本番 https://machibun2026.yurumachi-yuruyuru.workers.dev は、本番の CMS を読んで初めてのビルドが通った。本番の `CMS_TOKEN` も正しかった。
   - 公開サイトの `main` の Deploy Hook を、管理画面の本番の secret `DEPLOY_HOOK_URL` に入れた。本番の管理画面で見本の出展者の公開を取り消すと公開サイトから消え、公開し直すと戻ることを確かめた（反映まで2分ほど）。
   - Deploy Hook の URL は `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/<id>`。作ったときの返事に URL は入らない。URL を知っていれば誰でもビルドを始められるので、id は repo にも会話にも書かない（2026-10-17、HANDOVER に書いていた id を全履歴から消し、Hook を作り直した）。
   - 本番の CMS の見本のデータ（出展者・出演枠・お知らせ・協賛・出演者・ステージ・カテゴリの25件）は、2026-10-17 に user の判断で、ゴミ箱からも消した。Preview の試しのデータは残している。
   - 管理画面の「サイトを表示」は、EmDash の中で `/` に決め打ちされている。`cms/src/pages/index.astro` で、`/` を `PUBLIC_SITE_URL`（`cms/wrangler.jsonc` の `vars` と `previews.vars`）に転送する。EmDash の `siteUrl` は使わない（パスキーがそのホスト名に結び付くため）。
6. EmDash は使える前提で進める（2026-10-16、user が決めた）。関門2の人による試し（user と学生、手順は emdash-gates.md）は後で行う。agent が通した結果は emdash-gates.md にある。試しのデータ（「関門2の試し」の出展者・お知らせ・出演者・出演枠）は、見本として残す。
   - （済み、2026-10-16）管理用の Preview で公開すると、公開サイトの Preview がビルドし直される。公開サイトの feat の Deploy Hook を、管理画面の Worker の Preview の secret `DEPLOY_HOOK_URL` に置いた。
7. （済み、2026-10-16）出展者の詳細ページ（`/exhibitors/<識別名>`）とお知らせのページ（`/notices/<識別名>`）を `web/` に作った。年は URL の頭（Worker の名前 `machibun2026`）に入れ、ページの URL には入れない。
   - 紹介文（`text` の項目）は、管理画面では「Enter markdown content...」と案内されるが、公開サイトではマークダウンとして描かず、改行だけ生かした文章で出す。マークダウンを HTML にすると、出展者が書いた危ない HTML を消す処理まで要るため。`**` などはそのまま出る。
   - お知らせの本文（Portable Text）は `astro-portabletext` で描く。リンクは `http`・`https`・`mailto`・`tel` だけ通す。本文の中の画像は、まだ描かない（出ない）。
8. PageSpeed の直し（フォントは #2、イラストの大きさは #3）。点の測り直しは `preview` に取り込んでから行う。
   - （2026-10-17、`feat/font-nonblocking`）フォント（#2）: Google Fonts の CSS を `media="print"` で読み、読み終えたら `all` に切り替える（`Base.astro`）。CSS を待たずに端末のフォントで先に表示し、届いたら Noto Sans JP に替わる。読み込む `@font-face` は減らしていない（前に本番で測ったときのフォントは約 720KB。表示する文字とキャッシュで変わる）。Astro の Fonts API で自前で配る方法も試したが、Google の CSS（約 245 の `@font-face`）が全ページの `<style>` に埋め込まれ、トップページの HTML が gzip で 4KB から 67KB に増えたのでやめた。
   - 点の測り直しは PageSpeed の画面（pagespeed.web.dev）で行う。API（`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<URL>&strategy=mobile`）は、key が無いと共有の1日の上限に当たって断られた（2026-10-17）。本番は一覧が空、Preview には試しのデータがあるので、比べるときは同じ環境の前後で比べる。
   - 取り込む前の Preview（2026-10-17 17:50、Lighthouse 13.5.0）: モバイル 66 点（FCP 5.3s・LCP 5.4s・CLS 0、表示を止める読み込みの見込みの短縮 5,250ms）、デスクトップ 95 点（FCP 1.1s・CLS 0.001）。取り込んだ後に同じ画面で測り、FCP と CLS を比べる。
   - （2026-10-17、`feat/illust-resize`）イラスト（#3）: `web/public/assets/illust/` を `web/src/assets/illust/` に移し、`astro:assets` の `<Image>` で、CSS で出す最大の幅（px）の 1 倍と 2 倍に縮める（`densities`）。CSS の幅を変えたら `index.astro` の `width` も変える。全体の `layout: "constrained"` の CSS が位置の指定とぶつからないよう、イラストは `layout="none"` にした。一番大きい talk は 640px・24KB から、224px・8KB と 448px・21KB になった。取り込む前の Preview の「Improve image delivery」は、モバイル 39KiB、デスクトップ 65KiB（2026-10-17 17:50）。
   - （2026-10-18、PR #22。2026-10-30 に `main` に入れた）FCP が縮まらなかった原因は、フォントだった。Lighthouse の計算（Lantern、devtools-frontend の `lantern/metrics/FirstContentfulPaint.ts`）は、最初の描画より前に読み終わった優先度 VeryHigh の読み込みを、描画を止めたものとして数える。`media="print"` の形ではフォント（約 600KB）が描画より前に読み終わる回があり、そのとき FCP が 5.3s になっていた。フォントの CSS を、最初の描画の後（`requestAnimationFrame` から `setTimeout`）に script で足す形にした（`Base.astro`）。Preview のモバイルは 99〜100 点（FCP 0.9〜1.4s）になった。同じ時間帯の本番（前の形）は 67 点と 95 点で、フォントが描画より前に読み終わった回だけ 5.3s だった。実際の利用者の FCP は前から速く（手元の Chrome で 0.1〜0.2s）、上がったのは主に測定の点。手元のコンテナの Lighthouse では、どちらの形でも描画が先で再現しない。
   - PageSpeed を agent-browser で回すときは、新しいタブ（`tab new`）で開く。裏のタブでは結果が描かれない。結果の JSON はページの `window.__LIGHTHOUSE_MOBILE_JSON__` で読める。
   - （2026-10-31、本番）フォントを描画の後に読む形（PR #22）を本番に入れて、モバイルを測った。2回とも FCP は 0.8s。1回は 100 点、もう1回は 78 点（LCP 5.6s）。78 点の回は描画が 2.4s と遅く、フォントがその前に読み終わっていて、計算上の LCP にフォントが数えられた（FCP と同じ仕組み）。デスクトップは 99 点。PageSpeed は同じ URL を続けて測ると、同じ結果を返すことがある（3回続けて同じ数値だった）。
   - （2026-10-31、`feat/illust-sizes`）スマホで CSS の幅が狭くなる cheers（104px）と balloons（64px）は、`densities` だとスマホの 1.75 倍の画面に 2 倍の画像（cheers は 384px・19KB）が配られ、本番の「Improve image delivery」に残っていた。この2つは `widths` と `sizes` で、スマホとそれ以外の幅をそれぞれ書く形にした。CSS の幅を変えたら `sizes` も変える。
9. （2026-10-17 に決めた。6 の Access のほかは済んだ）作業は feat → `preview` → `main` の順に取り込み、Preview は `preview` ブランチの1組（管理画面 `preview-machibun-cms` と公開サイト `preview-machibun2026`）だけにする（ADR 0007）。Preview の CMS の Hook が1つのブランチしかビルドし直せないため。次の順で設定する。Cloudflare と GitHub の設定を変える前と、消す前には user に確かめる。
   1. （済み、2026-10-17）2つの Worker の Preview 用のビルドの設定（`7346b588-…`、`6e95cff8-…`）で、`preview` ブランチのときだけビルドとデプロイをする。Preview 用の設定の `branch_includes`・`branch_excludes` は `["*"]`・`["main"]` から変えられない（API が `Invalid request body` を返す。本番用の設定は変えられる）。そこで、ビルドのコマンドを `[ "$WORKERS_CI_BRANCH" != preview ] || pnpm build`、デプロイのコマンドを `[ "$WORKERS_CI_BRANCH" != preview ] || npx wrangler preview` にした。作業ブランチを push すると、ビルドは始まるが、依存を入れたところで何もせずに終わる。ブランチ名 `preview` から、今と同じ `preview-machibun-cms` ができる。
   2. （済み、2026-10-17）PR #6（ADR 0007・AGENTS.md・`previews.vars.PUBLIC_SITE_URL` を `preview-machibun2026…` に）を `main` に取り込んだ。
   3. （済み、2026-10-17）`main` から `preview` ブランチを作った。
   4. （済み、2026-10-17）公開サイトに Deploy Hook を2つ作り直した: `cms-production`（`main`）と `cms-preview`（`preview`）。user が画面で、管理画面の Worker の secret `DEPLOY_HOOK_URL` を環境ごとに入れ替えた。base config は新しい Preview にだけ付くので、`cf previews delete preview --worker machibun-cms --force` で消して `cf builds create 7346b588-… --branch preview` で作り直した（D1 は同じなので、パスキーと中身は残った）。両方の管理画面でステージを中身を変えずに保存し、それぞれの Hook からビルドが始まることを確かめた。Hook から始まったビルドでも `WORKERS_CI_BRANCH` は入り、`preview-machibun2026` が更新された。
   5. （済み、2026-10-17）GitHub で `preview` を `main` と同じように保護した（PR でだけ取り込む。管理者にも効く。force push と削除は禁止）。
   6. （止めている、2026-10-17）公開サイトの Preview の URL に Cloudflare Access をかける。本番も `workers.dev` なので、Preview の URL だけにかけられるかを先に確かめる。管理画面の Preview にはかけない（ビルドがその API を読むため）。 Access を使うには、先にアカウントで Zero Trust を始める（無料プラン、チーム名は `yurumachi` にするつもり）必要があり、申し込みでクレジットカードの登録を求められる。登録してよいかを user だけでは決められないので止めた。許す人は、メールアドレス2つ（user が決めた。公開の repo なので、ここには書かない）と、GitHub の org `yurumachi` のメンバーにするつもり。GitHub の org には、Access のログイン用の OAuth App を user が作った（Redirect URI は `https://yurumachi.cloudflareaccess.com/cdn-cgi/access/callback`）。Access の画面は、Worker の設定の「Access」のタブから入る。
   7. （済み、2026-10-17）古いものを消した。古い Deploy Hook 2つを消した。Workers Builds はブランチごとに Preview を自動で作り（`auto_delete: true`）、GitHub でブランチを消すとその Preview も消える。`feat-emdash-site` などの古い Preview は、ブランチを消したときに消えていた。

10. （済み、2026-10-17）一覧が空のとき、トップページに「お知らせはまだありません」「決まり次第お知らせします」の文を出す（`web/src/pages/index.astro`）。本番の見本を消したので、本番は今この表示になっている。
11. （済み、2026-10-17）本番の公開サイトに Cloudflare Web Analytics を入れた（クレジットカードは要らなかった）。`cf rum site-info create` で作ったサイト（host は `machibun2026.yurumachi-yuruyuru.workers.dev`）の beacon を、`WORKERS_CI_BRANCH` が `main` のビルドにだけ入れる（`web/src/layouts/Base.astro`）。数は Cloudflare の画面の Web Analytics で見る。`machibun2026` の Workers Logs は、Worker のコードが無く静的なファイルだけなので、有効にしてもほとんど残らないと考えて入れていない。
12. （2026-10-17）管理画面を最初から日本語で出す。EmDash は Cookie `emdash-locale` → ブラウザの言語 → 英語 の順で言語を選ぶので、`cms/src/middleware.ts` で、Cookie が無い人に `emdash-locale=ja` を付けて開き直させる。画面で英語を選んだ人の Cookie はそのまま使う。
13. （2026-10-30）トップページの時間を「14:00〜19:00」にした（user）。アクセス「JR長岡駅 大手口から徒歩5分」は、新潟県の観光情報サイトの「徒歩約5分」と合っていた。
14. （2026-10-17、`feat/worktree-dev`）作業を worktree で並べられるようにした。
   - `.worktreeinclude`: Orca で worktree を作ると `cms/.env` と `web/.env` が写る。Orca はこの一覧を、登録した元の checkout から読むので、`main` に入ってから効く。素の `git worktree add` では写らない。 手元の CMS の DB（`cms/.wrangler/`）は写らず、新しい worktree では空から作られる。`web/.env` の `CMS_TOKEN` は元の DB で作ったものなので、その worktree の管理画面で作り直す（PR #16 のレビューの指摘。EmDash は token を DB に登録して照合する）。
   - `compose.yaml`: entrypoint で、起動のたびに cms と web の `pnpm install --prefer-offline` を流す。worktree の新しい volume は空なので。入っていれば 1 秒ほどで終わる。`exec` は entrypoint を通らない。
   - `compose.yaml`: ホスト側のポートを固定しない（docker が空いている番号を選ぶ）。コンテナの中は 4321 のままなので、`web/.env` の `CMS_URL` は変えなくてよい。
   - `pnpm_store` の volume は、名前を固定して全 worktree で共有する。`node_modules` と `cf_config`（`cf` のログイン）の volume は worktree（compose の project）ごとに別。`cf_config` を共有しないのは、依存のスクリプトが動くコンテナに、ほかの worktree のログインまで渡さないため（PR #16 のセキュリティレビューの指摘）。
   - entrypoint の `pnpm install` には `--frozen-lockfile` を付け、lockfile と違う版を入れない。依存のスクリプトは、`pnpm-workspace.yaml` の `allowBuilds` で esbuild と workerd だけに絞ってある。
   - 試しの worktree で確かめた: 空の volume に store から 7 秒で入り、2 回目は 1 秒。ポートは 32768 が選ばれ、管理画面が応答した。`down -v` を打つと、共有の volume も消そうとした（使用中で消えなかった）。
15. （2026-10-17、`feat/preview-badge`）Preview の公開サイトと管理画面に、上の真ん中の「Preview（確認用）」と、画面の縁の線を重ねる。ページやレイアウトのコードには書かない。
   - 公開サイト: `web/astro.config.mjs` の integration が、`WORKERS_CI_BRANCH` が `preview` のビルドの後で、`dist` の HTML すべての `</body>` の前に差し込む。本番の HTML には入らない。
   - 管理画面: `cms/src/middleware.ts` が、`PREVIEW`（`cms/wrangler.jsonc` の `previews.vars` にだけ置く）があるとき、HTML の応答に `HTMLRewriter` で差し込む。手元で試すときは `cms/.env` に `PREVIEW=1` を足して dev を開き直す。
   - 目印の HTML は2か所（`web/astro.config.mjs` と `cms/src/middleware.ts`）にある。変えるときは両方を変える。
   - 手元で、公開サイトは `preview` のビルドの 11 ページすべてに入り、ほかのビルドには入らないこと、管理画面は読み込んだ後の画面にも出続けることを確かめた。

16. （2026-10-17）Workers Builds の「ブランチごとの Preview」（Worker Previews の `previews_enabled`）を、2つの Worker で止めた。Preview は、`cf` で作った Preview 用のビルドの設定（`preview` ブランチのときだけ動く）だけで出す（ADR 0007）。
   - 止める前は、画面の「設定」→「ビルド」→「プレビューのベース」の「プレビューブランチのビルド」が、2つの Worker でオンだった。設定は `cf builds workers get <Worker の id>` の `previews_enabled` と `previews_base_config` で読める。
     - `machibun-cms` のベースは、root が名前を変える前の、今は無いフォルダのままで、コマンドに `preview` ブランチの条件も無かった。`feat/worktree-dev` を push したとき、ここからそのブランチ用のビルドの設定が自動で作られ、`root directory not found` で落ちた。ブランチごとの設定は、Worker とは別の id（`90297c1e…`）に付くので、`machibun-cms` の設定の一覧には出なかった。ブランチを消すと消えた。ほかの feat ブランチで起きなかった理由は分かっていない。
   - **`previews_enabled` をオフにすると、本番用でないビルドの設定（`cf` で作った Preview 用のものも）が、変数ごと消える。** オンに戻しても作られない。シークレットは後から値を読めないので、消えると値は戻らない。2026-10-17 に `7346b588-…` と `6e95cff8-…` が消え、`cf builds triggers create --body` で同じ中身に作り直した（今の id は「いまの状態」に書いた）。公開サイトの方には `CMS_URL` と `CMS_TOKEN`（Preview の `web-build-read`、user が端末で入れた）を入れ直した。
   - `previews_base_config` は、本番用でないビルドの設定がある間は変えられない（画面でも `cf builds workers update` でも、エラーを出さずに元のまま）。有効にするときに同じ依頼で送ると保存され、`cf` で作った Preview 用の設定があると `[12048] Cannot enable preview settings while a non-production trigger exists` で断られる。`machibun-cms` のベースは、Preview 用の設定を消し、`{"previews_enabled":true,"previews_base_config":{…}}` を送ってから、オフに戻して直した（root `/cms`、`preview` の条件付きのコマンド、`cms/*`）。その後に Preview 用の設定を作り直した。`machibun2026` のベースも同じ手順で直した（root `/web`、`web/*`）。このとき Preview 用の設定が変数ごと消えたので、作り直して `CMS_URL` と `CMS_TOKEN` を入れ直した。今は2つとも `previews_enabled: false`。オンに戻さない。画面の「既存のプレビューに適用」も使わない。
   - 画面でビルドの設定を変える前に、`cf builds triggers list --external-script-id <Worker の id>` で、何が付いているかを見る。
   - 作り直した後、両方の Preview 用の設定で `preview` ブランチのビルドが通り、公開サイトの Preview は Deploy Hook（`cms-preview`）からもビルドされた。Deploy Hook は2つ（`cms-production`・`cms-preview`）とも消えていなかった。`preview` への push からのビルドは、この記録を取り込むときに確かめる。

17. （2026-10-18、`feat/share-and-search`）共有と検索のための設計を `docs/notes/share-and-search.md` に書いた（favicon・共有の画像（OGP）・canonical と `noindex`・sitemap）。Codex（labteam）の設計のレビューを受けて直した。イベントの構造化データは、Google の表示が日本に対応していないので入れない。次の順で進める。
   1. （済み、2026-11-01）favicon は「まち」「ぶん」の 2×2（user が選んだ）。
   2. （済み、2026-11-01）PR #26 で `preview` に取り込んだ。Preview で、favicon・アイコン・共有の画像・sitemap・robots.txt が 200 で返り、`noindex` が入ることを確かめた。robots.txt は、Cloudflare の content signal の後ろに自前の行が続く。
   3. `preview` を `main` に取り込み、本番で設計の「本番に入れた後に確かめること」を行う。イラストの直し（PR #25）も一緒に本番に入るので、本番で PageSpeed を測り、#3 を閉じる。
18. （2026-11-01、`feat/admin-guard`）実行委員（Editor）は今の年の中身だけを扱い、今の年・カテゴリ・ステージと前の年の中身は変えられないようにした（ADR 0008）。プラグイン `cms/src/plugins/admin-guard.ts` と `cms/src/middleware.ts`。
   - 手元で、画面から実行委員と管理者の操作を確かめた。項目と結果は `docs/notes/admin-guard-checks.md`。EmDash を上げたときは、これを流す。
   - 絞り込みは `next()` に URL や Request を渡しても EmDash に届かなかった（一覧の API が `context.url` を読む）。`context.url` に `fieldFilters` を足している。
   - 複製は保存のフックを通らないので、実行委員の複製は `middleware.ts` で断る。
   - 前の年の中身の削除・完全な削除・復元は、管理者だけができる。削除のフックには操作した人が渡らず、復元にはフックが無いので、`middleware.ts` で実行委員を断る。
   - MCP は同じ Worker の `/_emdash/api/mcp` で動き、`middleware.ts` を通る。実行委員の MCP は一律に断る。管理者の MCP での保存には操作した人が渡り、前の年の中身も直せる。
   - 版の復元（`/_emdash/api/revisions/<id>/restore`）は保存のフックを通らないので、実行委員が前の年の中身に行うものは `middleware.ts` で断る。予約公開はプラグインの `content:beforeSchedule` で断る。
   - 年が変わるときに直す場所は3つある。プラグインの設定の今の年、各コレクションの年の項目の既定値（2026）、`web/src/lib/cms.ts` の `YEAR`。1つにまとめるかは決まっていない（「決まっていないこと」）。
   - 管理画面の一覧には年で絞る仕組みが無く、前の年と今の年の中身が同じ一覧に並ぶ（「決まっていないこと」）。
   - `preview` での確認: 管理者で、プラグインの設定に今の年が出ることを確かめる。実行委員のアカウントは Preview に無いので、実行委員の操作は手元でだけ確かめた。

## いまの状態

- GitHub の repo は `yurumachi/machibun_website`（2026-10-16 に `machibun2026_website` から名前を変えた）。Workers Builds は repo の id でつながっていて、名前を変えたあとも、手でのビルドも push でのビルドも通った。
- 作業はタスクごとに `feat/<内容>` を切り、PR で取り込む（`main` は保護されている）。9 の設定が済んだら、`preview` から切って `preview` に取り込み、`preview` を `main` に取り込む（ADR 0007）。
- 開発は Docker のコンテナで行う（Node 22・pnpm 11.9.0・uv）。ホストには Node を入れない。
- EmDash は `cms/` にある（2026-10-16 に `site/` から名前を変えた）。公開ページは `web/` に移し（段2）、`cms/` は管理画面だけにした（段3）。
  - 中身の種類は `cms/seed/seed.json`。見本のデータも入っている。
  - トップページは `web/src/pages/index.astro`。キャッチコピー・開催日・会場は HTML に直接書いている。
- 画像は KV（`MEDIA`）に置く（ADR 0004）。置き場所の処理は `cms/src/storage/kv.ts`。
- Worker の設定は `cms/wrangler.jsonc` と `web/wrangler.jsonc`（ADR 0005）。
- Worker は2つ。管理画面 `machibun-cms`（id `b1c4e98112cc462e8d3a029fcb4e33c8`）と、公開サイト `machibun2026`（id `fe28605a553a4d6b99d5fa1276217d3d`）。
- 環境は3つで、データはつながない。
  - 手元（コンテナ）: `cms/.wrangler/` に保存する。seed から作り、いつでも作り直せる。
  - Preview: Cloudflare の Worker Previews。D1・KV は `cms/wrangler.jsonc` の `previews` に書いた Preview 用のものを、すべての Preview で共有する。URL は `<Preview の名前>-<Worker の名前>.yurumachi-yuruyuru.workers.dev` で、名前はふつうブランチ名から作られる。
    - 管理用の Preview（固定）: https://preview-machibun-cms.yurumachi-yuruyuru.workers.dev/_emdash/admin 。管理者は user が作った（2026-10-16、パスキー）。
    - 公開サイトの Preview: https://preview-machibun2026.yurumachi-yuruyuru.workers.dev 。Preview の CMS を読む。
  - 本番: 管理画面は https://machibun-cms.yurumachi-yuruyuru.workers.dev/_emdash/admin（D1 は 2026-10-16 に作り直し、user が管理者を作った）。公開サイトは https://machibun2026.yurumachi-yuruyuru.workers.dev 。
- デプロイは Cloudflare の Git 連携（Workers Builds）で行い、Cloudflare の側で wrangler が動く（私たちは打たない）。ビルドの設定は1つの Worker に2つまで。
  - 管理画面の本番用（`f5bb4f2d-8eca-4204-9909-92f321b036be`）: `npx wrangler deploy`。root は `/cms`、`cms/*` が変わったときだけ。
  - 管理画面の Preview 用（`965a5dd6-9080-4b71-b893-8838b7dbbf22`、2026-10-17 に作り直した。16 を見る）: `main` 以外を push するとビルドが始まり、`preview` ブランチのときだけ `npx wrangler preview`。root は `/cms`、`cms/*` が変わったときだけ。画面からは作れず、`cf builds triggers create --body` で作った。
  - 管理用の Preview は、Preview 用の設定を一時的に `npx wrangler preview --name preview` にし、`cf builds create <設定の id> --branch feat/emdash-site` で1回出して、元に戻した。
  - 公開サイトの本番用（`1bcd7adb-cc10-44f3-85f8-f53f2a161bd2`）: `main`、root は `/web`、`web/*` が変わったときだけ。変数 `CMS_URL`（本番の CMS）と `CMS_TOKEN`（シークレット）。
  - 公開サイトの Preview 用（`5be603bd-a529-4762-81fb-bef045ea9d84`、2026-10-17 に作り直した。16 を見る）: `main` 以外、`web/*` が変わったときだけで、`preview` ブランチのときだけ `npx wrangler preview`。変数は Preview の CMS のもの。`cf builds triggers create` は `--path-excludes` を求めるので、`--body` で作った。
  - Preview の URL は、Worker の「ドメイン」の画面で「プレビュー」を有効にしないと出ない。管理画面は最初の本番のデプロイで有効になったが、公開サイトは本番にデプロイする前だったので、user が画面で有効にした。
  - `wrangler preview` は、`wrangler.jsonc` に `previews` の項目が無いと止まる。公開サイトは空の `previews: {}` を置いた。
  - ビルドの変数のシークレットは、`cf builds triggers environment-variables upsert <設定の id> --body '{"CMS_TOKEN":{"value":"…","is_secret":true}}'` で入れる。コンテナには `curl` が無い。
- D1 と KV（アジア太平洋に置いた）:

  | | 本番 | Preview |
  |---|---|---|
  | D1 | `machibun`（`a9ce5dc4-8327-4cb5-84b1-dc8ca53cbaee`） | `machibun-preview`（`11da7c36-a9dc-4fb9-bec1-8bc78328277c`） |
  | KV `MEDIA` | `machibun-media`（`8c115efcc8d74942b5be5e9275f88366`） | `machibun-preview-media`（`2ae641097d0d449589fce79a71056d81`） |
  | KV `SESSION` | `machibun-session`（`d9219de9ab9f4f74af67822991ce1aca`） | `machibun-preview-session`（`346f84bf0a62489db258a863451895ae`） |

- `cf` のログインは volume（`cf_config`）に残る。
- 管理画面をブラウザで操作するときは、i2 の Chrome（`~/.local/share/chrome-profiles/iodine2net`、ポート 9333）に `agent-browser --cdp 9333` でつなぐ。パスキーでのログインは user が行う。本番と Preview はホスト名が違うので、別々にログインが要る。

## 手元で動かす

1. `docker compose up` で開く。依存は起動のたびに入る。ホスト側のポートは `docker compose port dev 4321` で見る（以下の `<port>`）。
2. http://localhost:<port>/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin を開くと、見本のデータが入り、開発用の管理者でログインできる。
3. seed を変えたら、`cms/.wrangler/` を消して作り直す（seed は空のデータベースにしか入らない）。
4. 開発サーバーが動いているときに、別のコンテナで `pnpm build` を打たない。共有している `node_modules/.vite` が書き換わり、開発サーバーが 500 を返す（`docker compose restart dev` で直る）。ビルドを試すときは、`/tmp` にコピーして `pnpm install --offline` してから打つ。

## 分かったこと

- EmDash のパスキーは、URL のホスト名に結び付く。Worker 名・workers.dev のサブドメイン・ドメインを変えると、作ったパスキーではログインできない。
- 空のデータベースで最初に管理画面を開いた人が、管理者を作れる。デプロイしたら、すぐに管理者を作る。
- Worker Previews の secret は、本番の secret と別に持つ。画面の「設定」→ 変数とシークレットで、環境に「プレビュー」を選んで入れる（Preview の base config）。base config は、これから作る Preview にだけ付く。今ある Preview に付けるには、`cf previews delete <名前> --worker machibun-cms --force` で消してビルドし直す（同じ URL・同じ D1 で作り直されるので、パスキーと中身はそのまま）。`cf` には Preview の secret を入れるコマンドが無く、wrangler は `cf` のログインを使えない。
- 作ったばかりの D1 では、最初のアクセスで表を作る。その1回目は `SETUP_STATUS_ERROR` や `NOT_CONFIGURED` を返すが、2回目からは返らない。
- `cf d1 delete` は、対話できない端末では `--force` が要る。agent が打つと Claude Code の安全確認で止まるので、user が `!` で打つ。
- 写真が縮められず元のまま出ているのは、`siteUrl`（`EMDASH_SITE_URL`）が無く、EmDash が `image.remotePatterns` を足さないため。公開サイトをビルドで作るなら、この直しは要らない。
- Preview ではキャッシュが効かない。wrangler の不具合（cloudflare/workers-sdk#16218）。issue にコメントするかは user が決める。
- cron は、予約した公開・掃除（1時間に1回）・プラグインの保存場所の索引作り（起動して最初の1回）を動かす。索引は cron でしか作られないので、編集用の鍵や連絡先のプラグインを作ったら、cron を止めない。
- 日時の項目は `Date` ではなく文字列で返る。
- `@astrojs/cloudflare` は、画像の変換に `IMAGES`、セッションに KV の `SESSION` を使う。
- `cms/` で `cf deploy` を打たない（`wrangler.jsonc` だけだと、`cf` が `astro.config.mjs` を書き換えようとする。ADR 0005）。
- Workers Logs の集計は `cms/.wrangler/cpu.mjs`（gitignore されている）。`cf o11y telemetry query --body` の結果を `/tmp/ev.json` に置いて、`node .wrangler/cpu.mjs` で集計する。

## 決まっていないこと

- 協賛のランク・見せ方・広告との分け方（`docs/content-model.md`）。
- 管理画面の入口を Cloudflare Access で絞るか（公開サイトの Preview にかけることは決めた。Zero Trust の申し込みでクレジットカードが要るので止めている。9 の 6）。
- 今の年を1か所で決めるか（18）。いまはプラグインの設定・年の項目の既定値・`web` の `YEAR` の3か所を、年が変わるときに管理者がそろえる。`web` が CMS からプラグインの設定を読むには管理者の権限の token が要る。
- 管理画面の一覧で、前の年と今の年の中身をどう分けて見せるか（18）。EmDash 1.3.0 の一覧には項目で絞る画面が無い。候補は、年で並べる、コレクションの `group` でまとめる、プラグインの管理ページに前の年の一覧を出す。
