// PostgREST bir yanıtta en fazla `max-rows` (Supabase varsayılanı 1000) satır
// döndürür ve fazlasını SESSİZCE keser — hata yoktur, dizi kısa gelir. Mekan
// büyüdükçe (çok playlist / büyük katalog) bu tavan gerçek veri kaybı gibi
// görünür: içe aktarılan playlist panelde eksik görünür, otomatik çalma havuzu
// kırpılır, müşteri katalogun tamamını göremez.
//
// Bu yardımcı sorguyu 1000'erlik sayfalarla döndürüp birleştirir. Sayfalama
// yalnızca sıralaması DETERMİNİST sorgularda güvenlidir — çağıran taraf mutlaka
// bir eşsizlik kıran (song_id, id gibi) sütunla biten bir .order() zinciri
// vermelidir, yoksa sayfa sınırlarında satır tekrarlanır ya da kaybolur.

const PAGE_SIZE = 1000;

// Supabase builder'ının ürettiği satır tipi ile çağıranın beklediği tip gömülü
// ilişkilerde (songs(...) gibi) ayrışabildiği için sayfa sonucu gevşek tutulur;
// birleştirilmiş dizi çağıranın verdiği T ile tiplenir.
type PageResult = { data: unknown[] | null; error: { message: string } | null };

/**
 * `page(from, to)` her çağrıldığında aynı sorguyu farklı .range() ile kurmalıdır.
 * Supabase istemcileri tek kullanımlık olduğu için sorgu her sayfada yeniden
 * kurulur; bu yüzden hazır builder değil, fabrika alır.
 *
 * Hata durumunda o ana kadar toplananlarla birlikte hata döner (Supabase'in
 * { data, error } biçimi korunur), böylece mevcut çağrı yerleri değişmeden çalışır.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };

    const rows = (data ?? []) as T[];
    all.push(...rows);
    // Tam sayfa gelmediyse kaynak bitmiştir — fazladan istek atılmaz, yani
    // 1000'in altındaki mekanlar için maliyet eskisiyle birebir aynıdır.
    if (rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}
