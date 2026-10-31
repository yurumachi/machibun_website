import sharp from "sharp";
import { BRAND, logoInner, oklchStops } from "../lib/brand-art";

// blob の色は tokens.css の --blob-a〜c と同じ組み合わせ
const gradient = (id: string, stops: [string, number][], x1: number, y1: number, x2: number, y2: number) =>
	`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${oklchStops(stops)}</linearGradient>`;

export async function GET() {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
${gradient("a", [[BRAND.g3, 0], [BRAND.g4, 1]], 0, 0, 1, 1)}
${gradient("b", [[BRAND.g2, 0], [BRAND.g3, 0.6], [BRAND.g3, 1]], 1, 0, 0, 1)}
${gradient("c", [[BRAND.g4, 0], [BRAND.g1, 1]], 0, 1, 1, 0)}
<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect width="1200" height="630" fill="${BRAND.main}"/>
<g opacity="0.55" filter="url(#soft)">
<ellipse cx="250" cy="170" rx="260" ry="210" fill="url(#a)"/>
<ellipse cx="980" cy="140" rx="210" ry="170" fill="url(#b)"/>
<ellipse cx="900" cy="520" rx="300" ry="200" fill="url(#c)"/>
</g>
<svg x="290" y="175" width="620" height="280" viewBox="0 0 490 235">${await logoInner()}</svg>
</svg>`;
	return new Response(await sharp(Buffer.from(svg)).png().toBuffer(), { headers: { "Content-Type": "image/png" } });
}
