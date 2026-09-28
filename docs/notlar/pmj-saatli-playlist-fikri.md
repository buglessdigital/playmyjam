---
name: pmj-saatli-playlist-fikri
description: "Saate göre değişen mekan playlist'i özelliği — ERTELENDİ, mekanlardan talep gelirse yapılacak; tasarım kararları hazır"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d147abd-9c5a-4acd-b17d-a819e1bd403e
  modified: 2026-07-27T13:40:11.633Z
---

Mekan admin panelinde "farklı saatlerde farklı playlist" özelliği (aktif slot'a göre müşteri panelindeki seçilebilir şarkı havuzu değişir) 27 Tem 2026'da değerlendirildi. **Şimdilik YAPILMAYACAK** — mekanlardan somut talep gelirse hayata geçirilecek.

**Why:** Fikir mimariye uyuyor ve gerçek değer taşıyor, ama şu an öncelik değil; talep gelmeden efor harcanmayacak.

**How to apply:** Talep geldiğinde sıfırdan analiz yapma, aşağıdaki kararlarla başla (analiz 2026-07-27'de yapıldı, dosyalar o gün doğrulandı — güncelliğini teyit et):

- Köklü değişiklik gerektirmiyor. Havuzu okuyan sadece 3 yer var: `lib/venue-cache.ts` (`getVenueSongCatalog`), `app/venue/[venueId]/browse/BrowseClient.tsx` realtime refetch, `lib/queue-fill.ts` (`fillQueueToTen`). `venue_songs.in_venue_list` zaten aktif/pasif mantığı sağlıyor; özellik bunun saate bağlı genelleştirilmesi.
- Şema: tek migration — `venue_playlists` (venue_id, ad, başlangıç/bitiş saati, haftanın günleri) + `venue_songs.playlist_id` (nullable = genel havuz).
- **Cache kararı:** `getVenueSongCatalog` `"use cache"` + `cacheLife("minutes")`. Per-slot cache key KULLANMA. Tüm playlist'leri saat bilgisiyle birlikte cache'le, aktif slot'u client'ta seç ve sınırda `setTimeout` ile değiştir — sunucu cache mimarisi hiç değişmez.
- **Kuyruk kuralı:** kuyruğa girmiş şarkı dokunulmaz (müşteri jeton ödedi). Saat kısıtı sadece yeni ekleme + otomatik doldurma için.
- Slot'a denk gelmeyen saatlerde genel havuza düş; gece yarısını aşan slot (23:00–04:00) için wrap mantığı şart.
- Playlist'ler genel havuzun YERİNE değil, ÜSTÜNE katman olsun (opsiyonel "sadece bu liste" modu) — aktif havuz küçülürse jeton harcaması düşer.
- Efor: backend yarım gün, admin UI 1–2 gün (asıl maliyet burada), sınır durumları yarım gün.

İlgili: [[pmj-perf-rework-2026-07]], [[next16-updatetag-route-handlers]]
