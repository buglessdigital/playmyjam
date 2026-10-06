// iTunes türlerini müşteriye gösterilecek tür AİLELERİNE indirger (Mekanlar haritası).
//
// iTunes aynı müziği çok parçalı adlandırıyor: elektronik bir mekanın çalma
// geçmişi "Dance %30, Electronic %25, House %20" diye bölünür ve hiçbiri öne
// çıkamaz. Kartta "en çok çalan tür" anlamlı olsun diye aile düzeyinde sayılır.
// Ailenin ekrandaki adı sözlükte (venueMap.genres.<anahtar>); burada olmayan
// tür ham adıyla kendi başına sayılır.

export const GENRE_FAMILIES = [
  "electronic",
  "pop",
  "turkishPop",
  "hiphop",
  "rock",
  "arabesk",
  "folk",
  "tsm",
  "jazz",
  "rnb",
  "latin",
  "reggae",
  "blues",
  "classical",
  "soundtrack",
  "singer",
  "world",
] as const;

export type GenreFamily = (typeof GENRE_FAMILIES)[number];

// Küçük harfli iTunes adı → aile. iTunes TR mağazası adları karışık dilde
// veriyor ("Arabesque", "Halk", "Turkish Rock"); ikisi de burada.
const FAMILY_OF: Record<string, GenreFamily> = {
  electronic: "electronic",
  electronica: "electronic",
  dance: "electronic",
  house: "electronic",
  "deep house": "electronic",
  techno: "electronic",
  trance: "electronic",
  ambient: "electronic",
  downtempo: "electronic",
  "chill out": "electronic",
  chillout: "electronic",
  lounge: "electronic",
  "drum & bass": "electronic",
  dubstep: "electronic",
  "melodic house & techno": "electronic",
  "afro house": "electronic",

  pop: "pop",
  "pop in spanish": "pop",
  "k-pop": "pop",
  "indie pop": "pop",
  "adult contemporary": "pop",
  "türkçe pop": "turkishPop",
  "turkish pop": "turkishPop",

  "hip-hop/rap": "hiphop",
  "hip-hop": "hiphop",
  rap: "hiphop",
  "turkish hip-hop/rap": "hiphop",
  "türkçe rap": "hiphop",
  "alternative rap": "hiphop",
  "underground rap": "hiphop",
  trap: "hiphop",

  rock: "rock",
  "turkish rock": "rock",
  "türkçe rock": "rock",
  "hard rock": "rock",
  alternative: "rock",
  alternatif: "rock",
  "indie rock": "rock",
  "alternative rock": "rock",
  metal: "rock",
  "heavy metal": "rock",
  punk: "rock",
  "soft rock": "rock",
  "pop/rock": "rock",

  arabesque: "arabesk",
  arabesk: "arabesk",
  fantezi: "arabesk",

  halk: "folk",
  "turkish folk": "folk",
  "türk halk müziği": "folk",
  folk: "folk",

  "türk sanat müziği": "tsm",
  "turkish classical": "tsm",
  fasıl: "tsm",

  jazz: "jazz",
  "vocal jazz": "jazz",
  "smooth jazz": "jazz",
  "contemporary jazz": "jazz",
  "nu jazz": "jazz",
  "acid jazz": "jazz",

  "r&b/soul": "rnb",
  "r&b": "rnb",
  soul: "rnb",
  funk: "rnb",
  disco: "rnb",
  "neo-soul": "rnb",

  latin: "latin",
  "latin urban": "latin",
  reggaeton: "latin",
  salsa: "latin",
  "música tropical": "latin",

  reggae: "reggae",
  dancehall: "reggae",
  blues: "blues",

  classical: "classical",
  klasik: "classical",

  soundtrack: "soundtrack",
  "film müziği": "soundtrack",

  "singer/songwriter": "singer",

  worldwide: "world",
  world: "world",
  "dünya müziği": "world",
};

/** Ham iTunes türü → aile anahtarı; bilinmiyorsa "raw:<ham ad>". */
export function genreFamily(raw: string): GenreFamily | `raw:${string}` {
  const key = raw.trim().toLocaleLowerCase("tr");
  return FAMILY_OF[key] ?? FAMILY_OF[raw.trim().toLowerCase()] ?? `raw:${raw.trim()}`;
}

export type GenreShare = { key: string; share: number };

/**
 * Sanatçı başına çalma sayısı + sanatçının türü → tür payları (en büyükten).
 * Türü bilinmeyen sanatçılar paydaya girmez: payı "türünü bildiğimiz
 * çalmaların" içinde hesaplanır. `coverage` o bilinen kısmın tüm çalmalara oranı.
 */
export function genreShares(
  artists: { plays: number; genre: string | null | undefined }[],
  limit = 3
): { shares: GenreShare[]; coverage: number } {
  const totals = new Map<string, number>();
  let known = 0;
  let all = 0;
  for (const a of artists) {
    all += a.plays;
    if (!a.genre) continue;
    known += a.plays;
    const fam = genreFamily(a.genre);
    totals.set(fam, (totals.get(fam) ?? 0) + a.plays);
  }
  if (known === 0) return { shares: [], coverage: 0 };

  const shares = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, plays]) => ({ key, share: plays / known }));
  return { shares, coverage: known / all };
}
