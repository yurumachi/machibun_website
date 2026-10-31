import { readFile } from "node:fs/promises";

// ブランドの色（tokens.css の --brand-*）。SVG の描画（librsvg）が `in oklch` を知らないので、ここで oklch の中間色を計算して並べる
export const BRAND = { main: "#1a1b20", g1: "#c7c7c7", g2: "#e7e7e7", g3: "#58e6ff", g4: "#fb65e7" };

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toLch(hex: string): [number, number, number] {
	const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const C = Math.hypot(A, B);
	// 灰色は色相を持たない（CSS の powerless hue）。相手の色相で補間する
	return [L, C, C < 0.02 ? NaN : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function toHex([L, C, h]: [number, number, number]) {
	const A = C * Math.cos((h * Math.PI) / 180);
	const B = C * Math.sin((h * Math.PI) / 180);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
	return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255).toString(16).padStart(2, "0")).join("");
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
	const h1 = Number.isNaN(a[2]) ? (Number.isNaN(b[2]) ? 0 : b[2]) : a[2];
	const h2 = Number.isNaN(b[2]) ? h1 : b[2];
	const d = ((h2 - h1 + 540) % 360) - 180;
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h1 + d * t];
}

/** CSS の `linear-gradient(in oklch, …)` の色の区切りを、SVG の `<stop>` に直す */
export function oklchStops(stops: [string, number][]) {
	const out: string[] = [];
	for (let i = 0; i < stops.length - 1; i++) {
		const [a, pa] = stops[i], [b, pb] = stops[i + 1];
		const n = Math.max(2, Math.round((pb - pa) * 20));
		for (let j = 0; j < n; j++) out.push(`<stop offset="${(pa + ((pb - pa) * j) / n).toFixed(3)}" stop-color="${toHex(mix(toLch(a), toLch(b), j / n))}"/>`);
	}
	const [last, pos] = stops[stops.length - 1];
	return [...out, `<stop offset="${pos}" stop-color="${last}"/>`].join("");
}

// ロゴの path の並び: ま・ち・ナ・か・ぶ・ん・か・さ・い
const logoPaths = async () => [...(await readFile("public/assets/logo.svg", "utf8")).matchAll(/<path[^>]*d="([^"]*)"/g)].map((m) => m[1]);

export const logoInner = async () => (await readFile("public/assets/logo.svg", "utf8")).replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");

function bbox(d: string) {
	const n = d.match(/-?\d+\.?\d*/g)!.map(Number);
	const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
	return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** 「まち／ぶん」を 2×2 に並べ、--gradient-brand の角丸の四角に載せる。round を false にすると角を丸めない */
export async function faviconSvg(round = true) {
	const ps = await logoPaths();
	const cell = 104, side = (cell * 2) / 0.74, o = cell - side / 2;
	const glyphs = [[0, 0, 0], [1, 1, 0], [4, 0, 1], [5, 1, 1]].map(([i, cx, cy]) => {
		const c = bbox(ps[i]);
		return `<path transform="translate(${(cx * cell + cell / 2 - c.x).toFixed(2)} ${(cy * cell + cell / 2 - c.y).toFixed(2)})" d="${ps[i]}"/>`;
	});
	const grad = oklchStops([[BRAND.g1, 0], [BRAND.g2, 0.15], [BRAND.g3, 0.3], [BRAND.g4, 1]]);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${side} ${side}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${grad}</linearGradient></defs><rect x="${o}" y="${o}" width="${side}" height="${side}"${round ? ` rx="${side * 0.22}"` : ""} fill="url(#g)"/><g fill="${BRAND.main}">${glyphs.join("")}</g></svg>`;
}
