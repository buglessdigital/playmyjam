// Müşterinin "listede yok" sonuçlarının sıralaması (/api/discover): ortak havuz
// ile Apple Music + Deezer sonuçları TEK alaka ölçüsüyle dizilir.
//
// Eskiden havuzun 15 sonucu her zaman dış sonuçların önündeydi ve havuz izlenme
// sırasıyla geliyordu. "bang" aramasında 15 yerin yarısını kanal adında "bang"
// geçen videolar (BANGTANTV dans provaları, "Bang Music" kanalının Punjabi
// derlemeleri) kaplıyor, "Bang! — AJR" gibi gerçek sonuçlar aşağıda kalıyordu.
//
// Kademeler (yüksek önce; aynı kademede havuz önce, çünkü havuzdaki şarkıyı
// mekan tek dokunuşla onaylar — sonra her kaynağın kendi sırası):
//   4  sorgu sanatçının adı ya da "sanatçı şarkı" / "şarkı sanatçı"nın kendisi
//   3  her kelime tam kelime olarak geçiyor (başlıkta, ya da sanatçı adı
//      eksiksiz yazılmış)
//   2  her kelime tam kelime ama bir kısmı yalnız sanatçı adının PARÇASINDA
//      ("bang" → "Bang Music")
//   1  son kelime yazılmakta: bir kelimenin başı olarak geçiyor ("bangı" → Bangır)
//   0  kelime başka bir kelimenin ortasında ya da içinde ("bang" → "BANGTANTV")
// Dans provası, koreografi, tepki videosu gibi şarkı olmayan videolar bir
// kademe aşağı iner.
//
// Saf mantık: lib/discover-rank.test.ts `npm test` ile koşar.
import { fold } from "./song-match.ts";

export type RankInput = { title: string; artist: string; inPool?: boolean };

/** "Blinding Lights (Live On The 2020 MTV VMAs)" → "Blinding Lights" */
export function baseTitle(title: string): string {
  return title.replace(/\s*[([].*$/, "").trim() || title;
}

/** "The Weeknd ft. ROSALÍA" → "The Weeknd" */
export function leadArtist(artist: string): string {
  return artist.split(/,|&|\s(?:ft|feat|featuring)\.?\s/i)[0].trim();
}

const NOT_A_SONG =
  /\b(dance practice|choreography|reaction|tutorial|karaoke|full album|compilation|playlist|bomb|behind the scenes|fancam|songs \d{4}|jukebox)\b/;

export function relevance(query: string, song: { title: string; artist: string }): number {
  const q = fold(query);
  const qWords = q.split(" ").filter(Boolean);
  if (qWords.length === 0) return 0;

  const fullTitle = fold(song.title);
  const title = fold(baseTitle(song.title));
  const artist = fold(leadArtist(song.artist));
  const allArtist = fold(song.artist);
  const titleWords = new Set(fullTitle.split(" "));
  const artistWords = new Set(allArtist.split(" "));
  const leadWords = artist.split(" ").filter(Boolean);

  let score: number;
  if (
    artist === q ||
    (artist && (q === `${artist} ${title}` || q === `${title} ${artist}`))
  ) {
    score = 4;
  } else if (qWords.every((w) => titleWords.has(w) || artistWords.has(w))) {
    // Yalnız sanatçıda tutan kelime var mı, ve sanatçı adı eksiksiz mi yazılmış?
    const viaArtistOnly = qWords.some((w) => !titleWords.has(w));
    const artistNamed = leadWords.length > 0 && leadWords.every((w) => qWords.includes(w));
    score = !viaArtistOnly || artistNamed ? 3 : 2;
  } else {
    const words = [...titleWords, ...artistWords];
    const head = qWords.slice(0, -1);
    const last = qWords[qWords.length - 1];
    const typing =
      head.every((w) => titleWords.has(w) || artistWords.has(w)) &&
      words.some((w) => w.startsWith(last));
    score = typing ? 1 : 0;
  }

  // Sorgu bu kelimeyi içermiyorsa ceza: "bts dance practice" arayan bulsun
  const noise = fullTitle.match(NOT_A_SONG);
  if (noise && !q.includes(noise[0])) score -= 1;
  return score;
}

/**
 * Havuz + dış sonuçları birlikte sıralar. Girdi dizileri kendi sıralarında
 * gelir (havuz izlenmeye, dış kaynaklar RRF'ye göre); sıralama kararlıdır.
 * Daha iyi eşleşme varsa 0 ve altı kademedeki havuz sonuçları atılır —
 * kanal adının içinde geçen harf dizisi kimsenin aradığı şey değil.
 */
export function rankDiscover<T extends RankInput>(query: string, pool: T[], external: T[]): T[] {
  const scored = [
    ...pool.map((item, i) => ({ item, score: relevance(query, item), src: 0, i })),
    ...external.map((item, i) => ({ item, score: relevance(query, item), src: 1, i })),
  ];
  const hasGood = scored.some((s) => s.score > 0);
  return scored
    .filter((s) => !hasGood || s.score > 0 || s.src === 1)
    .sort((a, b) => b.score - a.score || a.src - b.src || a.i - b.i)
    .map((s) => s.item);
}
