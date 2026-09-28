---
name: pmj-mekan-sayfasi-2026-09
description: "Plaket arka yüzü \"mekan sayfası\" (/m/<kod>) — 0052 ŞART, hizmet insiyatife bağlı, tasarım bilerek açık zeminli"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3cfa650c-4211-4b7a-9606-98ef305b6ee5
  modified: 2026-09-20T10:48:49.831Z
---

19 Eyl 2026'da kurulan **mekan sayfası** hizmeti: QR plaketinin ÖN yüzü eskisi gibi
doğrudan PlayMyJam'e gider, **ARKA** yüzüne isteyen mekan için ikinci bir karekod
basılır ve `/<mekan-slug>/bilgi` adresine iner (ör. playmyjam.com.tr/taner/bilgi). Sayfada menü, Instagram, Google yorum, Wi-Fi
şifresi, konum, telefon, WhatsApp, rezervasyon, web sitesi ve serbest bağlantılar
görünür; hangilerinin görüneceğine mekan kendi panelinden karar verir.

**Kararlar (tartışıldı, böyle kaldı):**
- Landing page'de PlayMyJam düğmesi YOK — kullanıcı bilerek istedi. Yalnızca altta
  küçük bir "PlayMyJam ile" imzası var.
- Hizmet insiyatife bağlı: `venues.hub_enabled`. Mekan kendi açamaz; super admin
  anlaşma sırasında açar (sözleşme modalı, yeni mekan formu, mekan düzenleme).
  Kapalıysa arka yüz karekodu HİÇ BASILMAZ, iki yüz de PMJ olur, `/m/<kod>` 404 döner.
- Adres slug tabanlı ve OKUNUR. Önce `/m/<kod>` yapılmıştı; kullanıcı okunur
  adres isteyince kaldırıldı. Slug zaten değiştirilemiyor, plaket bozulmaz.
  `venues.hub_code` kolonu 0052'de açıldı ama ARTIK KULLANILMIYOR (kod tarafında
  hiçbir yerde okunmuyor); istenirse ayrı bir migration ile düşürülebilir.
- Kök seviyede `app/[venueSlug]/bilgi` duruyor. Statik rotalar dinamikten önce
  eşleştiği için /hakkimizda, /mekanlar gibi sayfalar etkilenmiyor.
- Sayaçlar kimliksiz: yalnızca günlük toplam (`venue_hub_views`,
  `venue_hub_link_clicks`, `hub_track` RPC). Panelde "son 30 günde N tıklama".
  Bu aynı zamanda [[pmj-kesif-motoru-fikri]] için kararlaştırılan QR olayı kancası.
- Panel menüsündeki "Mekan Sayfası" satırı hizmet KAPALI mekanlarda da görünür —
  ekran ne olduğunu anlatıp satış yapıyor.

**Tasarım — çok tur döndü, REDDEDİLENLERİ tekrar önerme:**
- Salt yazıdan oluşan ince liste → "çok boş görünüyor".
- Koyu (siyah) başlık bloğu → "hoşuma gitmedi".
- Yuvarlak köşeli kartlar + renkli simge rozetleri → "yapay zeka tasarımı
  olduğu çok belli ediyor". Simge seti komple silindi.

**Şu anki hal:** açık tema + PMJ paleti (pembe #e91e8c, mor #8b5cf6, zemin
#faf7fc); sağ üstte açık/koyu tema düğmesi (tercih localStorage'da, boyamadan
önce çalışan bir betikle titreme engellendi); sol üstte PMJ imzası; ortada büyük
mekan logosu + adı + cümlesi; altında kutusuz, ince çizgilerle ayrılmış, solunda
serif sıra numarası olan tipografik dizin. Başlık fontu Fraunces.

**Şart:** `supabase/migrations/0052_venue_hub.sql` (kullanıcı 19 Eyl'de uyguladı).
**Canlıda:** 21 Eyl 2026, commit 0ff9636 (kelime bazlı arama ile birlikte) prod deploy. docs/youtube-compliance-reply-*.md bilerek commitlenmedi (demo şifresi içeriyor).

**Tuzaklar (yaşandı):**
- Toplu upsert'te satırların BİRİNDE id olup diğerinde olmaması PostgREST'te
  tüm kaydı düşürüyor ("Satırlar kaydedilemedi"). Yeni satıra da sunucuda
  crypto.randomUUID() ile kimlik veriliyor.
- `redirect()` çağıran bir prerender rotası cacheComponents altında build'de
  "Bail out to client-side rendering" hataları üretiyordu.
- Menü PDF'i `venue-menus` public bucket'ına yükleniyor; bucket kod tarafından
  açılıyor (logo akışıyla aynı), ayrı SQL adımı yok.

Google yorumu konusunda mekana panelde uyarı gösteriliyor: yorum karşılığı ödül ve
"review gating" Google'ın kurallarına aykırı.
