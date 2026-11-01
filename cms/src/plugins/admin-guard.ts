import { z } from "astro/zod";
import { ContentSaveRejectedError, definePlugin, getPluginSetting, type ActorInfo, type PluginContext } from "emdash";

// ADR 0008。@emdash-cms/auth の Role を読む方法は採らない。cms の依存に足すことになるため
export const ADMIN = 50;
export const ADMIN_ONLY = new Set(["categories", "stages"]);
const LABELS: Record<string, string> = { exhibitors: "出展者", performers: "出演者", slots: "出演枠", stages: "ステージ", categories: "カテゴリ", sponsors: "協賛", notices: "お知らせ" };
export const YEARLY = new Set(Object.keys(LABELS));
const FIRST_YEAR = 2026;

export const currentYear = async () => (await getPluginSetting<number>("admin-guard", "currentYear")) ?? FIRST_YEAR;

const isAdmin = (actor?: ActorInfo) => (actor?.role ?? 0) >= ADMIN;
const ADMIN_ONLY_MESSAGE = "カテゴリとステージは、管理者だけが変えられます";
export const PAST_MESSAGE = "前の年の中身は、参考として残すので変えられません";

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";
const yearOf = (content: Record<string, unknown>) => Number((content.data as Record<string, unknown> | undefined)?.year ?? content.year);
const yearInput = z.object({ year: z.number().int().min(FIRST_YEAR).optional() });

async function guardPublish(event: { collection: string; content: Record<string, unknown>; actor?: ActorInfo }) {
	if (isAdmin(event.actor) || !YEARLY.has(event.collection)) return;
	if (ADMIN_ONLY.has(event.collection)) return { cancel: true as const, reason: ADMIN_ONLY_MESSAGE };
	if (yearOf(event.content) !== (await currentYear())) return { cancel: true as const, reason: PAST_MESSAGE };
}

const PAST_LIMIT = 100;

// shortcut: コレクションごとに新しい順の 100 件まで。前の年の中身が増えて足りなくなったら、年を選んでページを送る形にする
async function pastPage(ctx: PluginContext) {
	const year = await currentYear();
	const blocks: unknown[] = [
		{ type: "header", text: "前の年の中身" },
		{ type: "context", text: `今の年（${year}）より前の中身。参考として残しているので、実行委員は開いて読むだけで、直す・消すのは管理者だけ。` },
	];
	for (const [collection, label] of Object.entries(LABELS)) {
		const { items } = await ctx.content!.list(collection, { limit: PAST_LIMIT, orderBy: { year: "desc" }, where: { fieldFilters: { year: { lt: year } } } });
		blocks.push({ type: "header", text: label });
		if (!items.length) blocks.push({ type: "context", text: "ありません" });
		for (const item of items) {
			const data = item.data as Record<string, unknown>;
			const name = String(data.title ?? data.starts_at ?? item.slug ?? item.id);
			blocks.push({ type: "section", text: `${data.year}年　${name}`, accessory: { type: "link", label: "開く", target: { kind: "content", collection, id: item.id } } });
		}
	}
	return { blocks };
}

export function createPlugin() {
	return definePlugin({
		id: "admin-guard",
		version: "0.1.0",
		capabilities: ["content:write", "hooks.content-policy:register"],
		routes: {
			admin: { permission: "content:read", handler: async (ctx) => pastPage(ctx) },
			"current-year": {
				permission: "plugins:manage",
				handler: async (ctx) => {
					const { year } = yearInput.parse(ctx.input ?? {});
					if (year !== undefined) await ctx.settings.set("currentYear", year);
					return { currentYear: await currentYear() };
				},
			},
		},
		mcp: {
			tools: {
				current_year: {
					description: "今の年を読む。year を渡すと、今の年をその年に変える。実行委員が扱える中身、一覧に出る中身、新しく作る中身の年がこの年になる",
					route: "current-year",
					input: yearInput,
					destructive: true,
				},
			},
		},
		admin: {
			pages: [{ path: "/past", label: "前の年の中身", icon: "history" }],
			settingsSchema: {
				currentYear: { type: "number", label: "今の年", description: "実行委員が扱える中身の年。一覧、カテゴリとステージの候補に出る中身と、新しく作る中身の年もこの年になる", default: FIRST_YEAR, min: FIRST_YEAR },
			},
		},
		hooks: {
			"content:beforeSave": async (event, ctx) => {
				if (!YEARLY.has(event.collection)) return;
				const year = await currentYear();
				// 年の項目の既定値（コンテンツの種類の設定）で入れる方法は採らない。今の年を変えるたびに、全部のコレクションの既定値も直すことになるため
				const content = event.isNew && isEmpty(event.content.year) ? { ...event.content, year } : event.content;
				if (!event.isNew && "year" in content && isEmpty(content.year)) throw new ContentSaveRejectedError("年を入れてください");
				if (isAdmin(event.actor)) return content;
				if (ADMIN_ONLY.has(event.collection)) throw new ContentSaveRejectedError(ADMIN_ONLY_MESSAGE);
				// 違う年を黙って今の年に直す方法は採らない。保存した後に年が変わり、入れた人が気づけないため
				const stored = !event.isNew && event.id ? await ctx.content!.get(event.collection, event.id) : null;
				if (stored && Number(stored.data.year) !== year) throw new ContentSaveRejectedError(PAST_MESSAGE);
				if ("year" in content && Number(content.year) !== year) throw new ContentSaveRejectedError(`年は ${year} にしてください。ほかの年は管理者だけが扱えます`);
				return content;
			},
			"content:beforePublish": guardPublish,
			"content:beforeUnpublish": guardPublish,
			"content:beforeSchedule": guardPublish,
		},
	});
}
