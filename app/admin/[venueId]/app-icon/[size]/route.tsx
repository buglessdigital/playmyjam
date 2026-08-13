import { ImageResponse } from "next/og";
import { getVenueBranding } from "@/lib/venue-cache";

// Mekanın kurulu panel uygulaması için ikon. Mekan logosu her boyutta/oranda
// olabildiği için (ve WebP/GIF'i satori güvenilir çizemediği için) logo doğrudan
// manifest'e verilmez: burada marka zemininin ortasına, kenar boşluklu ve kare
// olarak PNG'ye gömülür. Logo yoksa/uygun değilse mekan adının baş harfi çizilir.

const SIZES: Record<string, number> = { "192.png": 192, "512.png": 512 };
const EMBEDDABLE = /^image\/(png|jpeg)$/;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Satori uzaktaki görseli kendi indirseydi hata render sırasında patlardı;
// baytları önden çekip veri URL'ine çevirmek ikonun her koşulda dönmesini sağlar.
async function embedLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!EMBEDDABLE.test(type)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_LOGO_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ venueId: string; size: string }> }
) {
  const { venueId, size } = await params;
  const px = SIZES[size];
  if (!px) return new Response("Not found", { status: 404 });

  const venue = await getVenueBranding(venueId);
  if (!venue) return new Response("Not found", { status: 404 });

  const logo = await embedLogo(venue.logo_url);
  // Maskable ikonlarda Android dış %20'yi kırpabilir: içerik hep ortadaki %60'ta.
  const inner = Math.round(px * 0.6);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0a18",
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            width={inner}
            height={inner}
            alt=""
            style={{ objectFit: "contain", borderRadius: Math.round(inner * 0.18) }}
          />
        ) : (
          <div
            style={{
              width: inner,
              height: inner,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: Math.round(inner * 0.28),
              background: "#e91e8c",
              color: "white",
              fontSize: Math.round(inner * 0.55),
              fontWeight: 700,
            }}
          >
            {(venue.name.trim()[0] ?? "P").toLocaleUpperCase("tr-TR")}
          </div>
        )}
      </div>
    ),
    {
      width: px,
      height: px,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      },
    }
  );
}
