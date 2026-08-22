// Serbest metin talebini ("sanatçı + şarkı adı") ortak havuzdaki gerçek bir
// YouTube videosuna bağlayan saf eşleştirme katmanı.
//
// Neden ayrı dosya: burası hem öneri eşleştirmede (lib/suggestions.ts) hem talep
// onayında (lib/request-approval.ts) hem de tohumlama betiğinde çalışıyor;
// hiçbir şey import etmediği için `npm test` altında doğrudan koşturulabiliyor.
//
// İki ayrı karar var, karıştırılmamalı:
//   1) ELEME  — bu video o şarkı MI? (matchScore null dönerse hayır)
//   2) SEÇME  — aynı şarkının onlarca sürümü içinden hangisi? (yüksek puan)
// Ortak havuz büyüdükçe (bkz. scripts/seed-catalog.ts) 2. soru 1.'den daha
// önemli hale geliyor: "Kuzu Kuzu" havuzda var ama karaoke sürümü çalmamalı.

// Türkçe karakterleri ASCII'ye indirger, noktalama atar: "Dünyanın Sonuna" → "dunyanin sonuna".
// ı/İ NFD ile ayrışmadığı için önce elle eşlenir.
export function fold(text: string): string {
  return text
    .replace(/[İI]/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// YouTube başlıklarında hemen her şarkıda geçen, eşleşmeye katkısı olmayan kelimeler.
// Bunlar ELEMEDEN düşer ("Kuzu Kuzu (Official Video)" ile "Kuzu Kuzu" eşleşsin diye)
// ama bir kısmı aşağıda SEÇME aşamasında ceza olarak geri gelir.
const NOISE = new Set([
  "official", "video", "audio", "lyrics", "lyric", "visualizer", "klip", "sozleri", "sozler",
  "feat", "ft", "prod", "remix", "mix", "version", "versiyon", "live", "canli", "cover",
  "music", "full", "album", "original", "radio", "edit", "extended", "remastered",
  "hd", "hq", "4k", "the", "and", "ile",
]);

function tokens(text: string): string[] {
  return fold(text)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

// "Tarkan feat. Sezen Aksu" / "Sezen Aksu & Tarkan" / "Artist x Other" → ilk sanatçı.
// Apple/Deezer sanatçı alanında düet ikinci adı verirken YouTube başlığı çoğu zaman
// vermiyor; ikinci ad zorunlu tutulursa eşleşme boşuna kaçıyor.
const ARTIST_SPLIT = /\s*(?:,|&|\/|\bfeat\b\.?|\bft\b\.?|\bfeaturing\b|\bwith\b|\bx\b|\bvs\b\.?)\s*/i;

export function leadArtist(artist: string): string {
  const first = artist.split(ARTIST_SPLIT)[0]?.trim();
  return first || artist.trim();
}

/**
 * Aynı şarkının "asıl kayıt olmayan" sürümlerini geriye iten işaretler.
 * İşaret talepte de geçiyorsa yön tersine döner: müşteri açıkça "... remix"
 * istediyse remix ÖNE geçer, düz kayıt geriye düşer.
 */
const VARIANT_MARKERS: Array<{ re: RegExp; penalty: number }> = [
  { re: /\b(karaoke|instrumental|enstrumantal|playback|minus)\b/, penalty: 500 },
  { re: /\b(sped|speed|hizlandirilmis|nightcore|slowed|reverb|8d)\b/, penalty: 400 },
  { re: /\b(cover|tribute|akustik|acoustic|piano|gitar|guitar|violin|keman)\b/, penalty: 200 },
  { re: /\b(canli|live|konser|concert|sahne|session)\b/, penalty: 150 },
  { re: /\b(remix|mashup|bootleg|dj)\b/, penalty: 120 },
  { re: /\b(reaction|tepki|tutorial|dersi|nasil)\b/, penalty: 600 },
];

export type MatchTarget = {
  title: string;
  artist: string;
  channel_title?: string | null;
  view_count?: number | null;
  duration_ms?: number | null;
};

export type MatchQuery = {
  suggested_title: string | null;
  suggested_artist: string | null;
};

/**
 * Talep bu videoyla eşleşiyor mu, eşleşiyorsa ne kadar iyi bir seçim?
 * null  → hiç eşleşmiyor (ELEME)
 * sayı  → ne kadar büyükse o kadar iyi sürüm (SEÇME)
 */
export function matchScore(query: MatchQuery, song: MatchTarget): number | null {
  const titleTokens = tokens(query.suggested_title ?? "");
  const artistTokens = tokens(leadArtist(query.suggested_artist ?? ""));
  if (titleTokens.length === 0 || artistTokens.length === 0) return null;

  const haystackText = fold(`${song.title} ${song.artist} ${song.channel_title ?? ""}`);
  const haystack = new Set(
    haystackText.split(" ").filter((t) => t.length > 1 && !NOISE.has(t))
  );

  // Şarkı adının TAMAMI geçmeli — burada gevşemek yanlış şarkı çaldırır
  if (!titleTokens.every((t) => haystack.has(t))) return null;

  // Sanatçıda kelime sınırı aranmaz: "TarkanVEVO", "sezenaksuofficial" gibi
  // kanal adları tek kelime halinde geliyor, alt dize kontrolü bunları yakalar
  const artistHit = artistTokens.every(
    (t) => haystack.has(t) || haystackText.includes(t)
  );
  if (!artistHit) return null;

  let score = 1000;

  const requestText = fold(`${query.suggested_title ?? ""} ${query.suggested_artist ?? ""}`);
  const songTitleText = fold(song.title);
  for (const { re, penalty } of VARIANT_MARKERS) {
    const inSong = re.test(songTitleText);
    const inRequest = re.test(requestText);
    if (inSong && !inRequest) score -= penalty; // istenmeyen sürüm
    else if (inSong && inRequest) score += 400; // tam istenen sürüm
    else if (!inSong && inRequest) score -= 250; // istenen sürüm değil
  }

  // "X - Topic" kanalları YouTube'un otomatik yüklediği RESMİ ses kayıtlarıdır:
  // havuzda bunlardan biri varsa neredeyse her zaman doğru seçim odur
  if (/-\s*topic$/i.test(song.channel_title ?? "")) score += 300;

  // Sanatçının kendi kanalı (VEVO dahil) ikinci en güçlü sinyal
  const channelText = fold(song.channel_title ?? "");
  if (channelText && artistTokens.every((t) => channelText.includes(t))) score += 150;

  // İzlenme: doygunlaşan katkı, tek başına sürüm seçimini ele geçirmesin
  const views = Number(song.view_count ?? 0);
  if (views > 0) score += Math.min(Math.log10(views + 1), 9) * 12;

  // Süre aklı: 45 sn altı kesit, 10 dk üstü karışım/albüm olma eğiliminde
  const dur = Number(song.duration_ms ?? 0);
  if (dur > 0 && (dur < 45_000 || dur > 600_000)) score -= 250;

  // Fazladan kelime taşıyan başlık ("Kuzu Kuzu Şarkısı Çocuklar İçin") daha zayıf eşleşme
  const extra = [...haystack].length - titleTokens.length - artistTokens.length;
  if (extra > 0) score -= Math.min(extra, 6) * 8;

  return score;
}

/** Eski çağrı yeri uyumu: yalnızca "eşleşiyor mu" sorusu. */
export function suggestionMatchesSong(query: MatchQuery, song: MatchTarget): boolean {
  return matchScore(query, song) !== null;
}

/**
 * Aday listesinden EN İYİ sürümü seçer. Havuz büyüdükçe kritik olan fonksiyon
 * budur — eşleşen ilk satırı almak karaoke/hızlandırılmış sürüm çaldırır.
 */
export function pickBestMatch<T extends MatchTarget>(query: MatchQuery, songs: T[]): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;

  for (const song of songs) {
    const score = matchScore(query, song);
    if (score === null) continue;
    if (score > bestScore) {
      best = song;
      bestScore = score;
    }
  }

  return best;
}
