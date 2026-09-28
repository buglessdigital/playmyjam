---
name: pmj-kesif-motoru-fikri
description: Müzik zevkine göre mekan keşfi fikri — ERTELENDİ; hangi kancaların şimdi kurulması gerektiği ve hangi eşiklerde başlanacağı kararlaştırıldı
metadata: 
  node_type: memory
  type: project
  originSessionId: b53e15d0-8454-4f91-ba7c-b9a7db22f052
  modified: 2026-07-30T11:37:42.618Z
---

30 Tem 2026'da tartışıldı, **şimdilik harekete geçilmeyecek**. Fikir: kullanıcı PMJ'de müzik zevkini belirtir (veya istek geçmişinden çıkarılır), seçtiği konumda zevkine en yakın mekanları görür → mekana yeni müşteri, kullanıcıya yeni mekan. Ayrıca login'siz herkese açık katman: mekanlar, çalma listeleri, şu an çalan + sıradaki 10 şarkı.

**Bağlam (tartışma sırasında netleşen):** Sabit komisyon YOK — mekana o mekanda harcanan jetonun yüzdesi veriliyor (bkz. [[pmj-token-rework-2026-07]]). Ayda ~2000 TL sadece kullanıcının ortalama tahmini. Henüz **canlıya geçmiş tek mekan yok**, pazarlama süreçleri yürüyor.

**Why:** Keşif motoru komisyonun alternatifi değil, çarpanı — mekana anlatılacak cümle "yeni ödeme eklemiyoruz, zaten aldığın komisyonu büyütüyoruz". Ayrıca komisyon yeni mekanla konuşurken 0 TL olduğu için bir *kazanma* teşviki değil; keşif tam o boşluğu dolduruyor. Gerçek darboğaz mekan kazanmak değil mekanı aktifleştirmek (yüzdelik yapıda mekanın batık maliyeti yok, imzalayıp hiçbir şey yapmıyor).

**How to apply:** Fikri yazmaya başlamadan önce şu eşikler:
- İlk mekanda 4 sayı ölçülmeden keşfe başlanmaz: gece başına istek yapan kişi oranı, ücretsiz istekten jeton satın almaya geçiş oranı, kuyruk suistimali/personel şikâyeti, ikinci gece dönüş.
- Keşif tek koridorda ~30-50 mekan yoğunluğu ister. Şehir şehir değil sokak sokak; ilk hedef Alsancak tipi tek koridor (elde izmir_mekan_listesi.xlsx var).

Şimdi kurulması gereken, sonradan retrofit'i acı veren kancalar:
- Anonim cihaz kimliği + giriş sonrası hesaba birleşme (en kritik; bkz. [[pmj-auth-rework-2026-07]])
- Çalma geçmişini asla budamamak (mekan × şarkı × zaman damgası = öneri motorunun eğitim verisi)
- QR okutma / mekan ziyaretini birinci sınıf olay olarak loglamak (atıf hunisinin tek kanıtı, geçmişe dönük üretilemez)
- KVKK metnine profilleme maddesi (yasal sayfalar yazılırken; sonra eklenirse yeniden rıza gerekir)

Tasarım kararları (uygulanacağı zaman):
- Keşfin girişi ayrı sekme DEĞİL, **şarkı isteği sonrası an**: "bu şarkıyı çalan diğer mekanlar", "zevkine yakın 3 mekan". En sıcak lead, bedava trafik.
- Mekan profili beyandan değil **gerçek çalma geçmişinden** türetilir (savunulabilir tek varlık). Eşleştirme embedding değil sanatçı co-occurrence ile başlar — dış metadata gerekmez. Soğuk başlangıç kaba etiketle (arabesk/rock/hiphop/pop/türkü/elektronik/karma), mekan beyan eder sen geçmişle doğrularsın.
- Spotify/Apple Music içe aktarma YOK — temiz kesimle çıkarıldı, geri sokulmayacak (bkz. [[pmj-youtube-migration-2026-07]]).
- Mekan profili gün-dilimi × hafta içi/sonu kesilir ([[pmj-saatli-playlist-fikri]]'nin ucuz hali: planlanmış liste değil, geçmişten türetilmiş zaman farkındalıklı profil).
- Canlılık sinyali (o an aktif kullanıcı / saatteki istek) kova halinde gösterilir, eşik altında hiç gösterilmez — yoksa "içeride 1 kişi var" sızar.
- Atıf hunisi: keşif gösterimi → mekan detayı → yol tarifi → 14 gün içinde o mekanın QR'ı = atfedilmiş ziyaret. Mekan paneli: "bu ay 34 kişi geldi, 12'si ilk kez".
- Ücretsiz kademe (listede var + çalma listesi + şu an çalıyor) sıfır marjinal maliyet → yoğunluk bedavaya toplanır.
- Organik eşleşme sırası **asla** parayla değiştirilmez; sponsorluk ayrı ve etiketli slot olarak satılır.
- Herkese açık akışta kimin hangi şarkıyı istediği asla görünmez, sadece toplu veri.
- Yüzdelik komisyon oranı hacimle kademeli artırılabilir / aktif tanıtan mekana bonus oran — bugün sıfır maliyet, mekanın gördüğü tavanı yükseltir.
