import { faviconSvg } from "../lib/brand-art";

export async function GET() {
	return new Response(await faviconSvg(), { headers: { "Content-Type": "image/svg+xml" } });
}
