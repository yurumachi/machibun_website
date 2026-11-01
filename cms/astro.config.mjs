import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";
import { d1 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			// R2 は採らない。このアカウントで R2 を有効にすると支払い方法の登録が要るため（ADR 0004）
			storage: {
				entrypoint: fileURLToPath(new URL("./src/storage/kv.ts", import.meta.url)),
				config: { binding: "MEDIA" },
			},
			plugins: [
				{
					id: "rebuild-web",
					version: "0.1.0",
					entrypoint: fileURLToPath(new URL("./src/plugins/rebuild-web.ts", import.meta.url)),
				},
				{
					id: "admin-guard",
					version: "0.1.0",
					entrypoint: fileURLToPath(new URL("./src/plugins/admin-guard.ts", import.meta.url)),
				},
			],
		}),
	],
	devToolbar: { enabled: false },
});
