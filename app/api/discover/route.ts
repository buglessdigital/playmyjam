import { NextRequest, NextResponse } from "next/server";
import { discoverTracks } from "@/lib/discover";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Müşteri aramasında mekan listesinden hiç sonuç çıkmadığında çağrılır.
// Dönen kayıtlar ÇALINAMAZ (video id yok) — yalnızca "şunu istiyorum" demek
// için gösterilir, seçim serbest metin talebe dönüşür (bkz. SearchView).
//
// Kaynaklar anahtarsız ve günlük kotasız olduğu için buradaki sınır kota
// değil, kötüye kullanım savunması. Yanıt ayrıca CDN'de tutulur: aynı sorgu
// hangi mekandan gelirse gelsin dış servise ikinci kez gitmez.
const DISCOVER_LIMIT = 40;
const DISCOVER_WINDOW_SECONDS = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ tracks: [] });
  }

  const { allowed, retryAfter } = await consumeRateLimit(
    `discover:${clientIp(req)}`,
    DISCOVER_LIMIT,
    DISCOVER_WINDOW_SECONDS
  );
  if (!allowed) {
    return tooManyRequests(retryAfter, "Çok hızlı arama yapıyorsun, biraz yavaşla.");
  }

  const tracks = await discoverTracks(q);

  return NextResponse.json(
    { tracks },
    {
      headers: {
        // Sorgu dizesi CDN anahtarının parçası: popüler aramalar tek seferde
        // ısınır, sonrasında istek fonksiyona hiç ulaşmaz. Boş sonuç kısa
        // tutulur — kaynaklar o an yanıt vermemiş olabilir, gün boyu
        // "bulunamadı" diye çakılı kalmasın.
        "Cache-Control": tracks.length
          ? "public, s-maxage=86400, stale-while-revalidate=604800"
          : "public, s-maxage=60",
      },
    }
  );
}
