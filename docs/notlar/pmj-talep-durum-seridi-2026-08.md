---
name: pmj-talep-durum-seridi-2026-08
description: Talep onayı (yeşil) ve reddi (kırmızı) panelin her sayfasında şeritle görünür; müşteri İsteklerim sayfası profil menüsünden erişilir (16 Ağu 2026)
metadata: 
  node_type: memory
  type: project
  originSessionId: 24526773-70d8-41df-a63d-7e63a0d80b46
  modified: 2026-08-16T18:08:26.618Z
---

`components/venue/RequestStatusBar.tsx` panel kabuğunda (VenueLayoutClient), alt
gezinmenin üstünde: bekleyen talepte sarı geri sayım, onayda yeşile dönüp
şarkının sayfasına ("Sıraya Ekle") götürür. Sebep: onay 10 dk'lık pencere açıyor
ama herkes PWA kurup bildirime izin vermiyordu — push tek kanal kalınca onay
kaçıyordu.

Tazeleme üç kanaldan: realtime + aktif satır varken 15 sn yoklama + sekmeye
dönüşte anında sorgu (yoklama yalnızca gösterilecek satır varken ve sekme
görünürken döner). BrowseClient talep gönderince `pmj-suggestion-sent` window
olayı yayıyor, şerit beklemeden beliriyor.

Ayrıca: `/venue/[slug]/requests` sayfası panelde **hiçbir yerden bağlantılı
değildi** — profil menüsüne "İsteklerim" girişi eklendi. Alt gezinmede istek
sekmesi yok (Sıra / Şarkı Seç / Jeton), o yüzden rozet oraya konulamıyor.

Migration yok. Commit 34ca0c8 prod'da.

**Red durumu (5 Eki 2026):** önceden reddedilen talep şeritten sessizce
kayboluyordu. Artık şerit kırmızıya döner ("Talebin reddedildi" + "Başka Şarkı
Ara"); basınca gözat sayfasında arama açılır (`?search=1` ya da sayfadaysa
`pmj-open-search` olayı). Red şeridi `resolved_at`'ten 15 dk sonra ya da ✕ ile
kapanır (kapatılanlar localStorage `pmj-dismissed-rejections`). Öncelik:
onaylı > bekleyen > reddedilen. Red push'u zaten vardı, artık dokununca aynı
aramaya götürüyor (`url` eklendi).

Açık kalan fikir: çaldırma penceresini onay anında değil, müşteri uygulamayı
açınca başlatmak (tavanlı) — `song_requests.seen_at` kolonu gerektirir, ürün
kararı verilmedi.

İlgili: [[pmj-talep-onay-akisi-2026-08]], [[pmj-dis-katalog-arama-2026-08]],
[[pmj-realtime-publication-2026-08]]
