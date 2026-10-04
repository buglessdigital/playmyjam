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

// SIRA DELİK KALMAZ (5 Eki 2026, Biralem): sıralı listenin taraması, kuyrukta
// BEKLEYEN bir şarkıya rastlayınca onu atlayıp ilerisinden almaya devam
// ETMEZ — durur.
//
// Kapatılan hata: kuyruk liste sonuna kadar yazıldığı için yeni tur, eski turun
// şarkıları hâlâ kuyruktayken başlıyor. Eski tarama kuyruktakileri atlayıp
// "boşta" olanları hemen alıyordu: bir turda herhangi bir sebeple eksik kalan
// şarkı (Move) sonraki turda kendi yerine değil, sıranın ÇOK ÖNÜNE yazılıyor,
// orada tüketiliyor, kendi yerinde (Ara Beni Lütfen → Move → Yamore) yine
// çıkmıyordu. Hata her turda kendini yeniden üretiyordu.
//
// Üç tür engel ayrılır:
//   * inFlight — aynı listenin otomatik satırı olarak kuyrukta ya da sahnede.
//     Tarama DURUR; şarkı çalıp boşalınca sıradaki dolum oradan devam eder.
//   * held     — elle eklenen ya da müşteri satırı olarak kuyrukta. Şarkı o
//     satırla zaten çalacak: bu turda tüketilmiş sayılır ve tarama devam eder
//     (0035'in müşteri kuralı / consumeAutoDuplicates ile aynı mantık). Atlanıp
//     beklemede bırakılsaydı boşaldığında sıranın önüne sıçrardı.
//   * skip     — geçici olarak alınmayan (30 dk kilidi). Atlanır, tüketilmez.

export type SequentialVerdict = "pick" | "inFlight" | "held" | "skip";

export function scanSequential(
  scanOrder: readonly string[],
  verdictOf: (songId: string) => SequentialVerdict,
  capacity: number
): { picks: string[]; consumedHeld: string[]; blocked: boolean } {
  const picks: string[] = [];
  const consumedHeld: string[] = [];
  for (const id of scanOrder) {
    if (picks.length >= capacity) break;
    const verdict = verdictOf(id);
    if (verdict === "inFlight") return { picks, consumedHeld, blocked: true };
    if (verdict === "held") consumedHeld.push(id);
    else if (verdict === "pick") picks.push(id);
  }
  return { picks, consumedHeld, blocked: false };
}
