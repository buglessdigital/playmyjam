// Şarkı aramalarının ORTAK eşleşme kuralı: panelin "Sıraya Şarkı Ekle" araması
// (sunucu, ortak havuz), panelin katalog araması ve müşterinin arama ekranı.
//
// Eskiden üçü de yazılan metnin TAMAMINI tek parça olarak başlıkta ya da
// sanatçıda arıyordu. "sena sener" sanatçı adında bitişik geçtiği için
// buluyordu ama bir harf daha yazınca ("sena sener f") ne başlıkta ne
// sanatçıda o dizi olduğu için sonuçlar tamamen kayboluyordu — oysa "Feel
// (feat. Sena Sener)" tam aranan şarkıydı. "tarkan kuzu" gibi sanatçı + şarkı
// aramaları da hiç çalışmıyordu.
//
// Kural: sorgu kelimelere bölünür, HER kelime başlık + sanatçı birleşiminde
// bir yerde geçmelidir (sıra ve konum önemsiz). Türkçe harfler ve aksanlar
// eşit sayılır: "sener" "Şener"i, "ilk" "İlk"i bulur (bkz. fold).
//
// Saf mantık, dış bağımlılık yok: lib/search-match.test.ts `npm test` ile koşar.
import { fold } from "./song-match.ts";

/** Sorguyu karşılaştırılabilir kelimelere böler (boş sorgu → boş dizi). */
export function searchTokens(query: string): string[] {
  return fold(query).split(" ").filter(Boolean);
}

/** Bir şarkının aranan metni: alanlar katlanıp tek metne dizilir. */
export function searchHaystack(...fields: (string | null | undefined)[]): string {
  return fold(fields.filter(Boolean).join(" "));
}

// Şarkının katlanmış arama metni, nesne başına bir kez hesaplanır: tarayıcıdaki
// aramalar her tuşta binlerce şarkıyı tarıyor. Liste yeniden çekilince yeni
// nesneler gelir ve önbellek kendiliğinden tazelenir (WeakMap).
const haystacks = new WeakMap<object, string>();

/** searchHaystack(title, artist), şarkı nesnesi başına önbellekli. */
export function songHaystack(song: { title: string; artist?: string | null }): string {
  let text = haystacks.get(song);
  if (text === undefined) {
    text = searchHaystack(song.title, song.artist);
    haystacks.set(song, text);
  }
  return text;
}

/** Her kelime metinde geçiyor mu? Kelime yoksa her şey eşleşir. */
export function matchesTokens(tokens: string[], haystack: string): boolean {
  return tokens.every((token) => haystack.includes(token));
}

// Veritabanı tarafı: Postgres katlanmış metni bilmiyor, bu yüzden katlanmış
// kelimenin her harfi o harfin Türkçe/aksanlı karşılıklarını da kabul eden bir
// sınıfa açılır ve büyük/küçük harf duyarsız regex (~*) ile aranır. Büyük
// harfler ayrıca yazılır: Türkçe İ/ı'nın büyük-küçük eşlemesi veritabanının
// yerel ayarına güvenilemeyecek kadar tutarsız.
const LETTER_VARIANTS: Record<string, string> = {
  a: "aâàáäAÂÀÁÄ",
  c: "cçCÇ",
  e: "eéèêëEÉÈÊË",
  g: "gğGĞ",
  i: "iıîïíìIİÎÏÍÌ",
  n: "nñNÑ",
  o: "oöôóòOÖÔÓÒ",
  s: "sşSŞ",
  u: "uüûúùUÜÛÚÙ",
};

/**
 * searchTokens'tan gelen BİR kelimeyi Postgres regex desenine çevirir.
 * Girdi yalnızca [a-z0-9] içerdiği için (fold bunu garanti eder) kaçırılacak
 * özel karakter yoktur; çıktı da PostgREST or() sözdizimini bozan virgül ya
 * da parantez içermez.
 */
export function tokenPattern(token: string): string {
  return [...token].map((ch) => (LETTER_VARIANTS[ch] ? `[${LETTER_VARIANTS[ch]}]` : ch)).join("");
}

/**
 * Aynı şarkının birden fazla videosunu teke indirir (kanal aynı şarkıyı klip,
 * ses ve sözler olarak ayrı ayrı yükleyebiliyor — havuzda "Sevmemeliyiz"in beş
 * kopyası vardı). Girdi sırası korunur ve İLK görülen kalır: çağıran taraf
 * listeyi zaten tercih sırasına (izlenme) dizmiş olmalı.
 */
export function dedupeSongs<T extends { title: string; artist: string | null }>(songs: T[]): T[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = `${fold(song.title)}|${fold(song.artist ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
