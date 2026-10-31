import { ContentSaveRejectedError, definePlugin, getPluginSetting, type ActorInfo } from "emdash";

// ADR 0008。@emdash-cms/auth の Role を読む方法は採らない。cms の依存に足すことになるため
export const ADMIN = 50;
export const ADMIN_ONLY = new Set(["categories", "stages"]);
export const YEARLY = new Set(["exhibitors", "performers", "slots", "stages", "categories", "sponsors", "notices"]);
const FIRST_YEAR = 2026;

export const currentYear = async () => (await getPluginSetting<number>("admin-guard", "currentYear")) ?? FIRST_YEAR;

const isAdmin = (actor?: ActorInfo) => (actor?.role ?? 0) >= ADMIN;
const ADMIN_ONLY_MESSAGE = "カテゴリとステージは、管理者だけが変えられます";
export const PAST_MESSAGE ="前の年の中身は、参考として残すので変えられません";

const yearOf = (content: Record<string, unknown>) => Number((content.data as Record<string, unknown> | undefined)?.year ?? content.year);

async function guardPublish(event: { collection: string; content: Record<string, unknown>; actor?: ActorInfo }) {
	if (isAdmin(event.actor) || !YEARLY.has(event.collection)) return;
	if (ADMIN_ONLY.has(event.collection)) return { cancel: true as const, reason: ADMIN_ONLY_MESSAGE };
	if (yearOf(event.content) !== (await currentYear())) return { cancel: true as const, reason: PAST_MESSAGE };
}

export function createPlugin() {
	return definePlugin({
		id: "admin-guard",
		version: "0.1.0",
		capabilities: ["content:write", "hooks.content-policy:register"],
		admin: {
			settingsSchema: {
				currentYear: { type: "number", label: "今の年", description: "実行委員が扱える中身の年。カテゴリ・ステージの候補もこの年だけになる", default: FIRST_YEAR, min: FIRST_YEAR },
			},
		},
		hooks: {
			"content:beforeSave": async (event, ctx) => {
				if (isAdmin(event.actor) || !YEARLY.has(event.collection)) return;
				if (ADMIN_ONLY.has(event.collection)) throw new ContentSaveRejectedError(ADMIN_ONLY_MESSAGE);
				const year = await currentYear();
				// 違う年を黙って今の年に直す方法は採らない。保存した後に年が変わり、入れた人が気づけないため
				const stored = !event.isNew && event.id ? await ctx.content!.get(event.collection, event.id) : null;
				if (stored && Number(stored.data.year) !== year) throw new ContentSaveRejectedError(PAST_MESSAGE);
				if ("year" in event.content && Number(event.content.year) !== year) throw new ContentSaveRejectedError(`年は ${year} にしてください。ほかの年は管理者だけが扱えます`);
			},
			"content:beforePublish": guardPublish,
			"content:beforeUnpublish": guardPublish,
			"content:beforeSchedule": guardPublish,
		},
	});
}
