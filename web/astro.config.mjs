import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// vite の loadEnv は採らない。web の依存に vite を足すことになるため
if (existsSync(".env")) process.loadEnvFile(".env");

const PREVIEW_BADGE = `<div style="position:fixed;inset:0;z-index:2147483647;pointer-events:none;border:4px solid #b45309"><span style="position:absolute;top:0;left:50%;transform:translateX(-50%);padding:0 10px;background:#b45309;color:#fff;font:700 14px/1.5 sans-serif;border-radius:0 0 6px 6px">Preview（確認用）</span></div>`;

// レイアウト（Base.astro）に書く方法は採らない。確認用の目印はページの中身ではないため
// 配るときに Worker で差し込む方法も採らない。本番でも毎回 Worker が動き、静的なファイルだけで配れなくなるため（ADR 0006）
const previewBadge = {
	name: "preview-badge",
	hooks: {
		"astro:build:done": ({ dir }) => {
			for (const file of readdirSync(dir, { recursive: true })) {
				if (!file.endsWith(".html")) continue;
				const path = new URL(file, dir);
				writeFileSync(path, readFileSync(path, "utf8").replace("</body>", `${PREVIEW_BADGE}</body>`));
			}
		},
	},
};

export default defineConfig({
	// Preview のビルドで Preview の URL にする方法は採らない。Preview は noindex なので、共有や検索の URL は本番だけを指せばよいため
	site: "https://machibun2026.yurumachi-yuruyuru.workers.dev",
	output: "static",
	image: {
		// どのホストの写真でも縮める設定は採らない。CMS 以外の URL を取りに行かないため
		domains: [new URL(process.env.CMS_URL).hostname],
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [sitemap({ filter: (page) => !page.endsWith("/404/") }), ...(process.env.WORKERS_CI_BRANCH === "preview" ? [previewBadge] : [])],
	devToolbar: { enabled: false },
});
