import { defineMiddleware } from "astro:middleware";
import { env, waitUntil } from "cloudflare:workers";
import { ADMIN, ADMIN_ONLY, PAST_MESSAGE, YEARLY, currentYear } from "./plugins/admin-guard";
import { requestRebuild } from "./plugins/rebuild-web";

const MEDIA_REPLACE = /^\/_emdash\/api\/media\/[^/]+\/replace$/;
const CONTENT_API = /^\/_emdash\/api\/content\/([^/]+)(\/.*)?$/;
const REVISION_RESTORE = /^\/_emdash\/api\/revisions\/([^/]+)\/restore$/;
// PUBLIC_SITE_URL に preview が入っているかで見分ける方法は採らない。URL を変えたときに黙って出なくなるため
const PREVIEW_BADGE = `<div style="position:fixed;inset:0;z-index:2147483647;pointer-events:none;border:4px solid #b45309"><span style="position:absolute;top:0;left:50%;transform:translateX(-50%);padding:0 10px;background:#b45309;color:#fff;font:700 14px/1.5 sans-serif;border-radius:0 0 6px 6px">Preview（確認用）</span></div>`;

// プラグインのフックで受ける方法は採らない。写真の差し替えでは、EmDash のフックが一つも呼ばれないため
// 言語の Cookie を応答に付けるだけにする方法は採らない。EmDash は届いた要求の Cookie で言語を選ぶので、最初の1回が英語のまま出るため
export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;
	if (context.request.method === "GET" && pathname.startsWith("/_emdash/admin") && !context.cookies.has("emdash-locale")) {
		context.cookies.set("emdash-locale", "ja", { path: "/_emdash", sameSite: "lax", maxAge: 31536000, secure: context.url.protocol === "https:" });
		return context.redirect(pathname + context.url.search);
	}
	const role = context.locals.user?.role ?? 0;
	// MCP の要求の中身（呼ぶ道具の名前）を読んで一部だけ断る方法は採らない。複数の要求をまとめる形や slug での指定まで追うことになり、EmDash を上げたときに壊れやすいため
	if (pathname === "/_emdash/api/mcp" && context.locals.user && role < ADMIN) {
		return Response.json({ success: false, error: { code: "FORBIDDEN", message: "MCP は、管理者だけが使えます" } }, { status: 403 });
	}
	const revision = context.request.method === "POST" ? REVISION_RESTORE.exec(pathname) : null;
	if (revision && role < ADMIN) {
		const found = await context.locals.emdash?.handleRevisionGet(revision[1]);
		const item = (found?.data as { item?: { collection?: string; entryId?: string; data?: { year?: unknown } } } | undefined)?.item;
		if (item?.collection && item.entryId && YEARLY.has(item.collection)) {
			const entry = await context.locals.emdash?.handleContentGetIncludingTrashed(item.collection, item.entryId);
			const entryYear = (entry?.data as { item?: { data?: { year?: unknown } } } | undefined)?.item?.data?.year;
			const year = await currentYear();
			// 版の復元は保存のフックを通らないので、戻す版の年もここで見る
			if (Number(entryYear) !== year || (item.data?.year !== undefined && Number(item.data.year) !== year)) {
				return Response.json({ success: false, error: { code: "FORBIDDEN", message: PAST_MESSAGE } }, { status: 403 });
			}
		}
	}
	const content = CONTENT_API.exec(pathname);
	// 複製の後に年を今の年へ直す方法は採らない。複製は保存のフックを通らず、写った前の年の下書きを実行委員が直せなくなるため
	if (content && YEARLY.has(content[1]) && content[2]?.endsWith("/duplicate") && role < ADMIN) {
		return Response.json({ success: false, error: { code: "FORBIDDEN", message: "複製は、管理者だけができます" } }, { status: 403 });
	}
	// プラグインの content:beforeDelete で断る方法は採らない。削除のフックには操作した人が渡らず、管理者の削除まで断ることになるため。復元にはフックが無い
	const sub = content?.[2] ?? "";
	const trashing = (context.request.method === "DELETE" && /^\/[^/]+(\/permanent)?$/.test(sub)) || (context.request.method === "POST" && /^\/[^/]+\/restore$/.test(sub));
	if (content && trashing && YEARLY.has(content[1]) && role < ADMIN) {
		const found = await context.locals.emdash?.handleContentGetIncludingTrashed(content[1], content[2]!.split("/")[1]);
		const item = (found?.data as { item?: { data?: { year?: unknown } } } | undefined)?.item;
		if (item && Number(item.data?.year) !== (await currentYear())) {
			return Response.json({ success: false, error: { code: "FORBIDDEN", message: PAST_MESSAGE } }, { status: 403 });
		}
	}
	if (content && ADMIN_ONLY.has(content[1]) && context.request.method !== "GET" && role < ADMIN) {
		return Response.json({ success: false, error: { code: "FORBIDDEN", message: "カテゴリとステージは、管理者だけが変えられます" } }, { status: 403 });
	}
	// 一覧の画面（page を付けて呼ぶ）とカテゴリ・ステージの候補を今の年に絞る。出展者などの候補は絞らない。「前回の出展」で前の年を選ぶため
	// next() に書き換えた URL や Request を渡す方法は採らない。EmDash の一覧の API は context.url を読むので、絞り込みが届かないため
	const params = context.url.searchParams;
	if (content && YEARLY.has(content[1]) && context.request.method === "GET" && !content[2] && !params.has("fieldFilters") && (params.has("page") || ADMIN_ONLY.has(content[1]))) {
		params.set("fieldFilters", JSON.stringify({ year: await currentYear() }));
	}
	const res = await next();
	if (context.request.method === "PUT" && res.ok && MEDIA_REPLACE.test(pathname)) {
		waitUntil(requestRebuild(console.warn).catch(console.error));
	}
	// 年の項目の既定値をスキーマに持たせる方法は採らない。今の年を変える道（設定の画面・MCP・API）ごとに、全部のコレクションの既定値も直すことになるため
	if (context.request.method === "GET" && pathname === "/_emdash/api/manifest" && res.ok) {
		const body = (await res.json()) as { data?: { hash?: string; collections?: Record<string, { fields?: Record<string, { defaultValue?: unknown }> }> } };
		const manifest = body.data ?? {};
		const year = await currentYear();
		for (const slug of YEARLY) {
			const field = manifest.collections?.[slug]?.fields?.year;
			if (field) field.defaultValue = year;
		}
		// 管理画面が hash で manifest を使い回しても、今の年を変えたら読み直させる
		manifest.hash = `${manifest.hash}-${year}`;
		const headers = new Headers(res.headers);
		headers.delete("content-length");
		return new Response(JSON.stringify(body), { status: res.status, headers });
	}
	if ((env as { PREVIEW?: string }).PREVIEW && res.headers.get("content-type")?.startsWith("text/html")) {
		return new HTMLRewriter().on("body", { element: (body) => void body.append(PREVIEW_BADGE, { html: true }) }).transform(res);
	}
	return res;
});
