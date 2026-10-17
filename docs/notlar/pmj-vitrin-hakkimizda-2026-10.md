---
name: pmj-vitrin-hakkimizda-2026-10
description: Ana sayfa Hakkımızda + telif güvencesi, hareketli "Nasıl çalışır", iki sekmeli SSS ve sadeleşen üst menü (17 Eki 2026) — içerik kuralları ve bakım tuzakları
metadata:
  type: project
---

17 Eki 2026'da ana sayfaya **Hakkımızda** bölümü (`/#hakkimizda`, menüde ilk sırada) eklendi; "Nasıl çalışır", SSS ve üst menü yenilendi.

**Telif bandı (Hakkımızda altı) — kullanıcı kararları:**
- Yalnız üç başlık + sözleşme maddesi (Ek-2 md. 2.2 / 3.1 / 2.4, `lib/contract-template.ts` → `musicUndertaking`). Madde numarası orada değişirse sözlükteki `home.about.c*Proof` da değişir.
- **YouTube ve çalma altyapısı burada ANLATILMAZ** — potansiyel rakiplere mekanizma gösterilmesin. SSS'deki telif cevabı da aynı çizgide.
- "Tamamen yasal" gibi kesin iddia yok; avukat görüşü sözlü olduğu için kanıt olarak gösterilmez ([[pmj-hukuki-gorus-2026-10]]).
- Tasarımda reddedilenler: pembe bant (altındaki pembe "Mekan sahibiysen" bloğuyla birleşiyor), ikonlu kartlar. Kabul edilen: "Nasıl çalışır" listesiyle aynı çizgi + tipografi dili.

**"Nasıl çalışır" (`components/landing/HowItWorks.tsx`):** sağdaki telefonda müşteri panelinin kendisi oynar.
- Gerçek bileşen (değişiklik kendiliğinden yansır): `SongRow`, `AddSongSheet`, `LangToggle`.
- **Kopyalanan işaretleme** (panel değişirse buradaki kopya elle güncellenir): `SearchView` başlığı, `QueueClient` sayfası, `BottomNav`.
- Şarkılar katalogda gerçekten var (video kimliğiyle), kapaklar resmi YouTube küçük resimleri — kullanıcının isteği.
- QR ekranındaki karekod gerçek (`https://playmyjam.com.tr`, jsQR ile doğrulandı), sabit dizi olarak gömülü — QR üretici bağımlılık eklenmedi.
- Otomatik ilerleme CSS animasyonu bitince (`onAnimationEnd`); bölüm görünmüyorken duraklar, azaltılmış harekette yalnız tıklamayla değişir.

**SSS:** Misafirler / Mekanlar sekmeleri. Ödeme + iade cevabı eski metinden (ödeme kuruluşu şartı); "paket" kelimesi çıkarıldı ([[pmj-token-rework-2026-07]]).

**Üst menü:** masaüstünde 4 bölüm bağlantısı + "Mekan sahipleri" açılır menüsü (Kaydet / Giriş / Mekanlar İçin); "Mekanlar İçin" ve "İletişim" yalnız mobil panelde ve sayfada. Tam menü `lg`'den itibaren.
