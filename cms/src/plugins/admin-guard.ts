import { z } from "astro/zod";
import { ContentSaveRejectedError, definePlugin, getPluginSetting, type ActorInfo, type PluginContext, type RouteContext } from "emdash";

// ADR 0008。@emdash-cms/auth の Role を読む方法は採らない。cms の依存に足すことになるため
export const ADMIN = 50;
export const ADMIN_ONLY = new Set(["categories", "stages"]);
const LABELS: Record<string, string> = { exhibitors: "出展者", performers: "出演者", slots: "出演枠", stages: "ステージ", categories: "カテゴリ", sponsors: "協賛", notices: "お知らせ" };
export const YEARLY = new Set(Object.keys(LABELS));
const FIRST_YEAR = 2026;

export const currentYear = async () => (await getPluginSetting<number>("admin-guard", "currentYear")) ?? FIRST_YEAR;

const isAdmin = (actor?: ActorInfo) => (actor?.role ?? 0) >= ADMIN;
export const ADMIN_ONLY_MESSAGE = "カテゴリとステージの登録・編集は、管理者のみ行えます";
export const PAST_MESSAGE = "過去の開催のデータは編集できません（参考として保存しています）";

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";
const yearOf = (content: Record<string, unknown>) => Number((content.data as Record<string, unknown> | undefined)?.year ?? content.year);
const yearInput = z.object({ year: z.number().int().min(FIRST_YEAR).optional() });

async function guardPublish(event: { collection: string; content: Record<string, unknown>; actor?: ActorInfo }) {
	if (isAdmin(event.actor) || !YEARLY.has(event.collection)) return;
	if (ADMIN_ONLY.has(event.collection)) return { cancel: true as const, reason: ADMIN_ONLY_MESSAGE };
	if (yearOf(event.content) !== (await currentYear())) return { cancel: true as const, reason: PAST_MESSAGE };
}

const PAST_LIMIT = 100;

// shortcut: コレクションごとに新しい順の 100 件まで。過去の開催のデータが増えて足りなくなったら、年を選んでページを送る形にする
async function pastPage(ctx: PluginContext) {
	const year = await currentYear();
	const blocks: unknown[] = [
		{ type: "header", text: "過去の開催" },
		{ type: "context", text: `開催年（${year}年）より前のデータです。参考として保存しているため、実行委員は閲覧のみ行えます。編集と削除は管理者のみ行えます。` },
	];
	for (const [collection, label] of Object.entries(LABELS)) {
		const { items } = await ctx.content!.list(collection, { limit: PAST_LIMIT, orderBy: { year: "desc" }, where: { fieldFilters: { year: { lt: year } } } });
		blocks.push({ type: "header", text: label });
		if (!items.length) blocks.push({ type: "context", text: "データはありません" });
		for (const item of items) {
			const data = item.data as Record<string, unknown>;
			const name = String(data.title ?? data.starts_at ?? item.slug ?? item.id);
			blocks.push({ type: "section", text: `${data.year}年　${name}`, accessory: { type: "link", label: "開く", target: { kind: "content", collection, id: item.id } } });
		}
	}
	return { blocks };
}

const YEAR_GROUP = "イベント設定";

async function yearPage(ctx: RouteContext, toast?: { message: string; type: "success" | "error" }) {
	const year = await currentYear();
	const blocks: unknown[] = [
		{ type: "header", text: "開催年" },
		{ type: "context", text: "管理画面で登録・編集する際のデフォルトの開催年の設定です。" },
		{ type: "context", text: `新規作成する${Object.values(LABELS).join("・")}には、デフォルトでこの開催年が設定されます。一覧と選択肢には、この開催年のデータが表示されます。実行委員はこの開催年のデータのみ登録・編集できます。` },
		{ type: "context", text: "公開サイトに表示するデータの年と開催日時は、公開サイトのコードで設定しています。変更するには、コードの変更が必要です。" },
	];
	if (isAdmin(ctx.user)) {
		blocks.push({ type: "form", block_id: "year", fields: [{ type: "number_input", action_id: "year", label: "開催年", min: FIRST_YEAR, initial_value: year }], submit: { label: "保存", action_id: "save_year" } });
		blocks.push({ type: "context", text: "開催年を変更したら、その年のカテゴリとステージを登録してください。変更前の年のデータは、実行委員は編集できなくなります。" });
	} else {
		blocks.push({ type: "fields", fields: [{ label: "開催年", value: `${year}年` }] });
		blocks.push({ type: "context", text: "開催年の変更は管理者のみ行えます。" });
	}
	return toast ? { blocks, toast } : { blocks };
}

const interaction = z.object({ type: z.string(), page: z.string().optional(), action_id: z.string().optional(), values: z.record(z.string(), z.unknown()).optional() });

async function adminRoute(ctx: RouteContext) {
	const input = interaction.parse(ctx.input ?? {});
	if (input.type === "form_submit" && input.action_id === "save_year") {
		if (!isAdmin(ctx.user)) return yearPage(ctx, { message: "開催年の変更は管理者のみ行えます", type: "error" });
		const parsed = yearInput.safeParse({ year: Number(input.values?.year) });
		if (!parsed.success || parsed.data.year === undefined) return yearPage(ctx, { message: `${FIRST_YEAR}年以降の年を入力してください`, type: "error" });
		await ctx.settings.set("currentYear", parsed.data.year);
		return yearPage(ctx, { message: `開催年を${parsed.data.year}年に変更しました`, type: "success" });
	}
	return input.page === "/year" ? yearPage(ctx) : pastPage(ctx);
}

export function createPlugin() {
	return definePlugin({
		id: "admin-guard",
		version: "0.1.0",
		capabilities: ["content:write", "hooks.content-policy:register"],
		routes: {
			admin: { permission: "content:read", handler: adminRoute },
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
					description: "開催年を読む。year を渡すと、開催年をその年に変える。実行委員が扱えるデータ、一覧に出るデータ、新しく作るデータの年がこの年になる",
					route: "current-year",
					input: yearInput,
					destructive: true,
				},
			},
		},
		admin: {
			// settingsSchema（プラグインの設定の画面）にも置く方法は採らない。開催年を変える画面が2つになり、プラグインの一覧の奥にあって見つけにくいため
			pages: [
				{ path: "/year", label: "開催年", icon: "calendar", group: YEAR_GROUP },
				{ path: "/past", label: "過去の開催", icon: "history" },
			],
		},
		hooks: {
			"content:beforeSave": async (event, ctx) => {
				if (!YEARLY.has(event.collection)) return;
				const year = await currentYear();
				// 年の項目の既定値（コンテンツの種類の設定）で入れる方法は採らない。開催年を変えるたびに、全部のコレクションの既定値も直すことになるため
				const content = event.isNew && isEmpty(event.content.year) ? { ...event.content, year } : event.content;
				if (!event.isNew && "year" in content && isEmpty(content.year)) throw new ContentSaveRejectedError("年を入力してください");
				if (isAdmin(event.actor)) return content;
				if (ADMIN_ONLY.has(event.collection)) throw new ContentSaveRejectedError(ADMIN_ONLY_MESSAGE);
				// 違う年を黙って開催年に直す方法は採らない。保存した後に年が変わり、入れた人が気づけないため
				const stored = !event.isNew && event.id ? await ctx.content!.get(event.collection, event.id) : null;
				if (stored && Number(stored.data.year) !== year) throw new ContentSaveRejectedError(PAST_MESSAGE);
				if ("year" in content && Number(content.year) !== year) throw new ContentSaveRejectedError(`開催年（${year}年）のデータのみ登録できます`);
				return content;
			},
			"content:beforePublish": guardPublish,
			"content:beforeUnpublish": guardPublish,
			"content:beforeSchedule": guardPublish,
		},
	});
}
