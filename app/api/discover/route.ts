import { NextRequest, NextResponse } from "next/server";
import { discoverTracks, type DiscoverTrack } from "@/lib/discover";
import { searchPool } from "@/lib/pool-search";
import { searchTokens } from "@/lib/search-match";
import { fold } from "@/lib/song-match";
import { baseTitle, leadArtist, rankDiscover } from "@/lib/discover-rank";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Müşteri aramasında mekan listesinin altındaki "listede yok" sonuçları.
// Dönen kayıtlar ÇALINAMAZ — yalnızca "şunu istiyorum" demek için gösterilir,
// seçim serbest metin talebe dönüşür (bkz. SearchView).
//
// İki kaynak, sırayla:
//   1. Ortak havuz (songs) — talep onaylanınca şarkı havuzda bulunur, mekan
//      bildirimden tek dokunuşla onaylar. Bu yüzden ÖNCE bunlar gösterilir.
//   2. Apple Music + Deezer — havuzda olmayan şarkılar. Onayda YouTube'da
//      aranır (kota bittiyse mekan bağlantı yapıştırır).
// İkisi tek alaka ölçüsüyle birlikte sıralanır; aynı kademede havuz önce
// (bkz. lib/discover-rank.ts).
//
// Dış kaynaklar anahtarsız ve günlük kotasız olduğu için buradaki sınır kota
// değil, kötüye kullanım savunması. Yanıt ayrıca CDN'de tutulur: aynı sorgu
// hangi mekandan gelirse gelsin ikinci kez hesaplanmaz.
const DISCOVER_LIMIT = 40;
const DISCOVER_WINDOW_SECONDS = 60;
const POOL_LIMIT = 15;
// Sürüm ayıklamasından sonra POOL_LIMIT'e yetecek kadar aday
const POOL_FETCH = 40;
// Trigram indeksi 3 harften kısa parçalarda devre dışı kalıyor ("ad" 5 sn) —
// en az bir kelime bu uzunlukta değilse havuz yoklanmaz
const POOL_MIN_TOKEN = 3;

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

  const poolEligible = searchTokens(q).some((token) => token.length >= POOL_MIN_TOKEN);
  const [external, poolRows] = await Promise.all([
    discoverTracks(q),
    poolEligible ? searchPool(q, POOL_FETCH) : Promise.resolve([]),
  ]);

  // Müşteriye aynı şarkının canlı/remix/sözler/kamera arkası videoları ayrı
  // ayrı gösterilmez: parantezli ekler ve konuk sanatçı atılınca aynı kalan
  // kayıtlar teke iner — havuz izlenmeye göre sıralı, ilk kalan aslı olur.
  // (Panelin araması bu sürümleri kasten gösteriyor; ayıklama yalnız burada.)
  const seen = new Set<string>();
  const poolSongs = (poolRows ?? []).filter((s) => {
    const key = `${fold(baseTitle(s.title))}|${fold(leadArtist(s.artist))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Havuzun en alakalı 15'i seçilir (izlenme sırası aynı kademede korunur);
  // dış sonuçlarla birlikte son sıralama aşağıda (bkz. lib/discover-rank.ts)
  const ranked = rankDiscover(q, poolSongs, []);

  const pool: DiscoverTrack[] = ranked.slice(0, POOL_LIMIT).map((s) => ({
    key: `yt:${s.youtube_video_id}`,
    title: s.title,
    artist: s.artist,
    cover: s.album_cover_url ?? "",
    duration_ms: s.duration_ms ?? 0,
    inPool: true,
  }));

  // Havuzda karşılığı olan dış sonuç ikinci kez çıkmasın: başlık havuzdakinin
  // başlığında geçiyor + ana sanatçı tutuyorsa aynı şarkı (SearchView'daki
  // mekan listesi ayıklamasıyla aynı kural)
  const poolKeys = pool.map((p) => ({ title: fold(p.title), artist: fold(p.artist) }));
  const rest = external.filter((track) => {
    const title = fold(track.title);
    const artist = fold(track.artist.split(/[,&]/)[0] ?? "");
    if (!title) return true;
    return !poolKeys.some((p) => p.title.includes(title) && (!artist || p.artist.includes(artist) || (p.artist !== "" && artist.includes(p.artist))));
  });

  const tracks = rankDiscover(q, pool, rest);

  return NextResponse.json(
    { tracks },
    {
      headers: {
        // Sorgu dizesi CDN anahtarının parçası: popüler aramalar tek seferde
        // ısınır, sonrasında istek fonksiyona hiç ulaşmaz. Boş sonuç ve havuz
        // hatası kısa tutulur — kaynaklar o an yanıt vermemiş olabilir, gün
        // boyu "bulunamadı" (ya da havuzsuz liste) diye çakılı kalmasın.
        "Cache-Control":
          tracks.length && poolRows !== null
            ? "public, s-maxage=86400, stale-while-revalidate=604800"
            : "public, s-maxage=60",
      },
    }
  );
}
