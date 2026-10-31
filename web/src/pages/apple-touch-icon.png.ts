import sharp from "sharp";
import { faviconSvg } from "../lib/brand-art";

// PNG を commit する方法は採らない。favicon を直したときに作り直し忘れるため
// 角を丸めたまま渡す形も採らない。iOS が自分で角を丸め、透明な角を黒く塗るため
export async function GET() {
	const png = await sharp(Buffer.from(await faviconSvg(false))).resize(180, 180).png().toBuffer();
	return new Response(png, { headers: { "Content-Type": "image/png" } });
}
