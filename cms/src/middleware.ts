import { defineMiddleware } from "astro:middleware";
import { env, waitUntil } from "cloudflare:workers";
import { ADMIN, ADMIN_ONLY, PAST_MESSAGE, YEARLY, currentYear } from "./plugins/admin-guard";
import { requestRebuild } from "./plugins/rebuild-web";

const MEDIA_REPLACE = /^\/_emdash\/api\/media\/[^/]+\/replace$/;
const CONTENT_API = /^\/_emdash\/api\/content\/([^/]+)(\/.*)?$/;
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
	const content = CONTENT_API.exec(pathname);
	// 複製の後に年を今の年へ直す方法は採らない。複製は保存のフックを通らず、写った前の年の下書きを実行委員が直せなくなるため
	if (content && YEARLY.has(content[1]) && content[2]?.endsWith("/duplicate") && (context.locals.user?.role ?? 0) < ADMIN) {
		return Response.json({ success: false, error: { code: "FORBIDDEN", message: "複製は、管理者だけができます" } }, { status: 403 });
	}
	// プラグインの content:beforeDelete で断る方法は採らない。削除のフックには操作した人が渡らず、管理者の削除まで断ることになるため。復元にはフックが無い
	const sub = content?.[2] ?? "";
	const trashing = (context.request.method === "DELETE" && /^\/[^/]+(\/permanent)?$/.test(sub)) || (context.request.method === "POST" && /^\/[^/]+\/restore$/.test(sub));
	if (content && trashing && YEARLY.has(content[1]) && (context.locals.user?.role ?? 0) < ADMIN) {
		const found = await context.locals.emdash?.handleContentGetIncludingTrashed(content[1], content[2]!.split("/")[1]);
		const item = (found?.data as { item?: { data?: { year?: unknown } } } | undefined)?.item;
		if (item && Number(item.data?.year) !== (await currentYear())) {
			return Response.json({ success: false, error: { code: "FORBIDDEN", message: PAST_MESSAGE } }, { status: 403 });
		}
	}
	if (content && ADMIN_ONLY.has(content[1])) {
		if (context.request.method !== "GET" && (context.locals.user?.role ?? 0) < ADMIN) {
			return Response.json({ success: false, error: { code: "FORBIDDEN", message: "カテゴリとステージは、管理者だけが変えられます" } }, { status: 403 });
		}
		// 一覧の画面（page を付けて呼ぶ）は絞らない。前の年のカテゴリとステージを管理者が見られなくなるため
		// next() に書き換えた URL や Request を渡す方法は採らない。EmDash の一覧の API は context.url を読むので、絞り込みが届かないため
		if (context.request.method === "GET" && !content[2] && !context.url.searchParams.has("page") && !context.url.searchParams.has("fieldFilters")) {
			context.url.searchParams.set("fieldFilters", JSON.stringify({ year: await currentYear() }));
		}
	}
	const res = await next();
	if (context.request.method === "PUT" && res.ok && MEDIA_REPLACE.test(pathname)) {
		waitUntil(requestRebuild(console.warn).catch(console.error));
	}
	if ((env as { PREVIEW?: string }).PREVIEW && res.headers.get("content-type")?.startsWith("text/html")) {
		return new HTMLRewriter().on("body", { element: (body) => void body.append(PREVIEW_BADGE, { html: true }) }).transform(res);
	}
	return res;
});
