// KUYRUĞUN DEĞİŞMEZ KURALI (sıralı listeler için)
//
//   Otomatik kuyruk, çalan listenin BU TURDA en son çalınan şarkısından İLERİ
//   doğru okunur. Listenin başına ancak sıra listenin sonuna geldiğinde dönülür.
//
// Neden ayrı bir dosya: bu kural, otomatik satır yazan tek boğazın
// (pickFromRotation) içinde uygulanır ve saf bir fonksiyon olduğu için
// testlenebilir. Kuyruğu silen/yeniden kuran bir kod yolu eklendiğinde kural
// yine geçerlidir — sıra artık "hangi şarkılar tüketilmiş" defterinin
// eksiksizliğine DEĞİL, fiilen ne çaldığına bağlı.
//
// Kapatılan hata (15 Ağu 2026, Mezzanine 20:14): kuyruk liste sonuna kadar
// yazıldığı için liste her dolumda "turunu bitirdi" sayılıyor ve başa sarma
// kuyruk hâlâ doluyken yapılıyordu; sonraki turun ilk şarkıları kuyruğa girip
// "tüketildi" işaretleniyordu. Bu noktadan sonra defter "bu turda çaldı" ile
// "sonraki tur için sıraya girdi"yi ayırt edemiyor: kuyruk sıfırlanınca
// (ray sırası, liste düzenleme, listeyi sıradan çıkarma…) bekleyenlerin
// tüketimi geri alınıyor, geriye birkaç şarkı kalıyor ve liste kendini turun
// BAŞINDA sanıyordu. Sahnede listenin #14'ü çalarken sıradaki şarkı listenin
// #0'ı oluyordu. Sıra artık defterden değil, çalma geçmişinden hesaplanıyor.

/**
 * Listenin bu turda kaldığı yer: `recentPlayed` (yeniden eskiye doğru sıralı
 * çalma geçmişi) içindeki İLK şarkı hangisi hem listenin üyesiyse hem de bu
 * turda tüketilmiş sayılıyorsa, ondan SONRAKİ sıra numarası.
 *
 * İki koşul birden aranır çünkü tek başına hiçbiri yetmez:
 *   * yalnız çalma geçmişi: raydan düşüp elle geri alınan liste baştan çalmalı,
 *     ama dün çaldığı yerden devam ederdi (tüketim defteri o sırada silinmiştir);
 *   * yalnız tüketim defteri: hatanın kendisi buydu — defter bir turun ortasında
 *     eksilebiliyor.
 *
 * Hiçbiri tutmazsa 0: liste baştan çalar (yeni liste, yeni tur, ya da geçmişteki
 * şarkıların hepsi listeden çıkarılmış).
 */
export function resumeIndexOf(
  memberIds: readonly string[],
  recentPlayed: readonly string[],
  consumed: ReadonlySet<string>
): number {
  if (memberIds.length === 0) return 0;
  for (const songId of recentPlayed) {
    if (!consumed.has(songId)) continue;
    const index = memberIds.indexOf(songId);
    if (index >= 0) return (index + 1) % memberIds.length;
  }
  return 0;
}

/**
 * Liste sırasını "kaldığı yerden" başlatır: kalan şarkılar önce, turun başına
 * sarkanlar sonra. Aday taraması bu diziyi baştan okuduğu için turun başındaki
 * bir şarkı ASLA kalanların önüne geçemez — hata sınıfı burada kapanıyor.
 */
export function orderFromResume(
  memberIds: readonly string[],
  recentPlayed: readonly string[],
  consumed: ReadonlySet<string>
): string[] {
  const start = resumeIndexOf(memberIds, recentPlayed, consumed);
  return start === 0
    ? [...memberIds]
    : [...memberIds.slice(start), ...memberIds.slice(0, start)];
}
