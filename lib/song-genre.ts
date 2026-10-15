import { supabaseAdmin } from "@/lib/supabase/admin";
import { fold, leadArtist, pickBestMatch } from "@/lib/song-match";
import { artistKey, fillArtistGenres, readArtistGenres } from "@/lib/artist-genre";

// Şarkı → tür (Mekanlar haritası, bkz. 0079 song_genres).
//
// iTunes'ta "sanatçı + şarkı adı" aranır, sonuçlardan şarkının kendisi
// pickBestMatch ile seçilir (talep eşleştirmesindeki kural: şarkı adının
// tamamı ve sanatçı geçmeli, remix/canlı gibi sürümler ayrışır). Böylece
// aynı sanatçının farklı türdeki şarkıları ayrı sayılır: Coi Leray "Players"
// Hip-Hop/Rap, "Players (David Guetta Remix)" Dance.
//
// Şarkı iTunes'ta yoksa sanatçının türüne düşülür (lib/artist-genre.ts,
// source = 'artist') — çalmayı hiç saymamaktan daha doğru bir tahmin.

const ITUNES = "https://itunes.apple.com/search";
const TIMEOUT_MS = 2500;

export type SongForGenre = { id: string; title: string; artist: string };

type ItunesSong = { trackName?: string; artistName?: string; primaryGenreName?: string };

/** null = bulunamadı, undefined = ağ/sınır hatası (kaydedilmez, sonra yeniden) */
async function fetchSongGenre(song: SongForGenre): Promise<string | null | undefined> {
  const params = new URLSearchParams({
    term: `${leadArtist(song.artist)} ${song.title}`,
    entity: "song",
    country: "TR",
    limit: "10",
  });
  try {
    const res = await fetch(`${ITUNES}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "PlayMyJam/1.0 (+https://playmyjam.com.tr)" },
      cache: "no-store",
    });
    // 403/429: iTunes'un dakikalık sınırı
    if (!res.ok) return undefined;
    const json = (await res.json()) as { results?: ItunesSong[] };
    // Sanatçı iTunes'un SANATÇI alanında geçmeli: pickBestMatch başlıkta
    // geçmesini de kabul ediyor, o zaman "Sprinter (Dave x Central Cee Type
    // Beat)" gibi başkasının kaydı Dave'in şarkısı sayılıyordu
    const wantArtist = fold(leadArtist(song.artist)).split(" ").filter((t) => t.length > 1);
    const rows = (json.results ?? [])
      .filter((r) => r.trackName && r.artistName && r.primaryGenreName)
      .filter((r) => {
        const have = fold(r.artistName!);
        return wantArtist.every((t) => have.includes(t));
      })
      .map((r) => ({ title: r.trackName!, artist: r.artistName!, genre: r.primaryGenreName! }));
    const best = pickBestMatch({ suggested_title: song.title, suggested_artist: song.artist }, rows);
    return best?.genre ?? null;
  } catch {
    return undefined;
  }
}

async function artistGenre(artist: string): Promise<string | null | undefined> {
  const key = artistKey(artist);
  const { genres, stale } = await readArtistGenres([artist]);
  if (stale.length === 0) return genres.get(key) ?? null;
  const learned = await fillArtistGenres([artist]);
  return learned.has(key) ? learned.get(key)! : undefined;
}

export type SongGenreResult = { genre: string | null; source: "song" | "artist" | null };

/**
 * Tek şarkının türünü öğrenip song_genres'e yazar. iTunes sınıra takılırsa
 * undefined döner ve hiçbir şey yazılmaz.
 */
export async function learnSongGenre(song: SongForGenre): Promise<SongGenreResult | undefined> {
  const own = await fetchSongGenre(song);
  if (own === undefined) return undefined;

  let result: SongGenreResult;
  if (own) {
    result = { genre: own, source: "song" };
  } else {
    const fallback = await artistGenre(song.artist);
    if (fallback === undefined) return undefined;
    result = { genre: fallback, source: fallback ? "artist" : null };
  }

  await supabaseAdmin.from("song_genres").upsert(
    { song_id: song.id, genre: result.genre, source: result.source, looked_up_at: new Date().toISOString() },
    { onConflict: "song_id" }
  );
  return result;
}

/**
 * Şarkıların türlerini paralel öğrenir. iTunes'u yormamak için çağıran
 * tarafta sayı sınırlı tutulmalı. Dönen harita yalnız bu turda öğrenilenleri
 * (song_id → tür) içerir.
 */
export async function fillSongGenres(songs: SongForGenre[]): Promise<Map<string, string | null>> {
  const learned = new Map<string, string | null>();
  const results = await Promise.all(songs.map(async (s) => [s.id, await learnSongGenre(s)] as const));
  for (const [id, r] of results) if (r) learned.set(id, r.genre);
  return learned;
}

const CRON_SINCE_DAYS = 30;
const CRON_GAP_MS = 3_000;
/** Arka arkaya bu kadar sınır hatası gelirse tur biter (iTunes bizi kesti) */
const CRON_MAX_LIMITED = 3;

/**
 * Cron turu: haritadaki mekanlarda son 30 günde çalınmış, türü bilinmeyen
 * şarkıları en çok çalınandan başlayarak sırayla doldurur. iTunes dakikada
 * ~20 istek kabul ediyor; şarkı başına 1-2 istek, aralarında 3 sn.
 */
export async function fillMissingSongGenres(deadlineMs: number) {
  const since = new Date(Date.now() - CRON_SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("songs_missing_genre", { p_since: since, p_limit: 200 });
  if (error) throw new Error(`eksik türler okunamadı: ${error.message}`);
  const songs = (data ?? []) as SongForGenre[];

  let found = 0;
  let fromArtist = 0;
  let notFound = 0;
  let limited = 0;
  let limitedStreak = 0;
  for (const song of songs) {
    if (Date.now() > deadlineMs) break;
    const r = await learnSongGenre(song);
    if (!r) {
      limited++;
      if (++limitedStreak >= CRON_MAX_LIMITED) break;
    } else {
      limitedStreak = 0;
      if (r.source === "song") found++;
      else if (r.source === "artist") fromArtist++;
      else notFound++;
    }
    await new Promise((resolve) => setTimeout(resolve, CRON_GAP_MS));
  }
  return { candidates: songs.length, found, fromArtist, notFound, limited };
}
