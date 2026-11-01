export const YEAR = 2026;

const { CMS_URL, CMS_TOKEN } = process.env;
if (!CMS_URL || !CMS_TOKEN) throw new Error("CMS_URL と CMS_TOKEN を環境変数か web/.env に設定する");

export interface Entry<T> {
	id: string;
	slug: string | null;
	data: T;
}

export interface MediaValue {
	// width・height は読まない。メディアライブラリで差し替えても、ここに残った値は古いまま変わらないため
	meta: { storageKey: string };
	alt?: string;
}

// 識別名をそのまま URL に使う方法は採らない。`#`・`?`・`/` を含む値や、Unicode の正規化で別の識別名と同じになる値では、
// 一覧のリンクと作られるページの URL が食い違うため。ビルドを止める方法も採らない。公開サイトが黙って古いままになるため
export const pageSlug = (e: { id: string; slug: string | null }) =>
	e.slug && e.slug === e.slug.normalize() && !/[\s/?#%\\]/.test(e.slug) ? e.slug : e.id;

async function get(path: string) {
	const res = await fetch(new URL(`/_emdash/api/content/${path}`, CMS_URL), {
		headers: { Authorization: `Bearer ${CMS_TOKEN}` },
	});
	if (!res.ok) throw new Error(`CMS の ${path} が ${res.status} を返した: ${await res.text()}`);
	return (await res.json()).data;
}

export async function list<T>(collection: string, year: number) {
	// 並べ替えは CMS に頼まない。REST API は、索引を作った項目でしか並べ替えられないため
	const q = new URLSearchParams({ status: "published", limit: "100", fieldFilters: JSON.stringify({ year }) });
	const { items, total } = await get(`${collection}?${q}`);
	// 続きのページを読む処理は書かない。1年の件数は 100 に届かないので、超えたら黙って切らずに止める
	if (items.length < total) throw new Error(`${collection} が ${total} 件あり、1回で読める 100 件を超えた`);
	return items as Entry<T>[];
}

// 参照する側（出展者・出演時間）から取る API（`{id}` と `{id}/references/{relation}/children`）は使わない。
// token を作った管理者には、下書きに取り置かれた選択を返すため。参照される側から取ると、公開中のつながりだけが返る
export async function titleByReferrer(collection: string, targets: Entry<{ title: string }>[], relation: string) {
	const titles = new Map<string, string>();
	await Promise.all(
		targets.map(async (t) => {
			const { parents, nextCursor } = await get(`${collection}/${t.id}/references/${relation}/parents?limit=100`);
			if (nextCursor) throw new Error(`${t.data.title} を参照するものが 100 件を超えた`);
			for (const p of parents as { id: string }[]) titles.set(p.id, t.data.title);
		}),
	);
	return titles;
}

export const mediaUrl = (m: MediaValue) => new URL(`/_emdash/api/media/file/${m.meta.storageKey}`, CMS_URL).href;

// 書かれた URL をそのまま href に入れる方法は採らない。出展者などが書いた `javascript:` の URL が動いてしまうため
export const safeHref = (url: string | undefined) => (url && /^(https?:|mailto:|tel:)/i.test(url) ? url : undefined);

const tokyo = { timeZone: "Asia/Tokyo" } as const;
export const isoDate = (d: Date) => d.toLocaleDateString("sv-SE", tokyo);
export const jaDate = (d: Date) => d.toLocaleDateString("ja-JP", { ...tokyo, dateStyle: "long" });
export const hhmm = (d: Date) => d.toLocaleTimeString("ja-JP", { ...tokyo, hour: "2-digit", minute: "2-digit" });
