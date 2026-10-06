---
name: pmj-mekan-haritasi-2026-10
description: Müşteri panelinde "Mekanlar" haritası (alt menüde ŞARKI SEÇ ile JETON AL arası); konum super admin'de Google Maps linkinden; tür iTunes'tan; 0073 ŞART
metadata:
  type: project
---

6 Eki 2026: müşteri paneline 4. sekme **MEKANLAR** (`/venue/<slug>/map`, misafire açık —
proxy `PUBLIC_VENUE_SEGMENTS`). PMJ tonlarına boyanmış harita; mekana dokununca alttan
kart: şu an çalan, en çok çalan tür, en çok çalınan 10 şarkı (son 90 gün), sıradaki 10
şarkı, yol tarifi. Kart yukarı kaydırılınca tam ekran, aşağı kaydırınca/haritaya
dokununca kapanır.

- **Veri (0073):** `venues.maps_url/latitude/longitude`; `artist_genres` (sanatçı→tür
  önbelleği); `venue_top_played(venue, since)` RPC'si (geçmiş = `queue.status='played'`,
  ayrı sayaç yok; `venue_songs.play_count` kullanılmıyor, hep 0'a yakın).
- **Koordinatı olmayan mekan haritada yok** — test mekanları (taner, berkay, ogulcan) bu
  yüzden boş bırakılır. Konum super admin → mekan düzenle → "Harita Konumu".
- **Link çözme** `lib/maps-link.ts`: kısa linkin yönlendirme zinciri izlenir, `!3d!4d` (iğne)
  > `@lat,lng` (harita merkezi) > `?q=`. Sayfa GÖVDESİNE bakılmaz: oradaki merkez Google'ın
  sunucu IP'sine göre varsayılanı (Galata linki havalimanını verdi). Çıkmazsa elle enlem/boylam.
  Yalnız Google alan adlarına istek (SSRF). Sunucu fra1 → çerez onayı çerezi gönderiliyor.
  **Tarayıcı User-Agent GÖNDERME:** kısa link tarayıcıya 302 yerine JS ara sayfası (200) veriyor.
- **Tür** `lib/artist-genre.ts`: iTunes `entity=song&attribute=artistTerm` ile sanatçının
  şarkılarının en sık `primaryGenreName`'i (sanatçı aramasından isabetli). Aileler
  `lib/genres.ts` (Dance/House/Electronic → Elektronik). Kart açılırken bilinen pay <%50
  ise 8 sanatçı beklenir, kalanı `after()` ile; NULL = bulunamadı, 30 günde bir yeniden.
- **Harita** maplibre-gl 6 + OpenFreeMap (anahtarsız, ticari serbest), stil istemcide
  boyanıyor (`lib/map-style.ts`). **Tuzak:** maplibre worker'ı kendi modülünün yanında
  arar, bundler kırar → `predev`/`prebuild` worker'ı `public/vendor/maplibre/`'e kopyalar
  (gitignore'da), `setWorkerUrl` oraya bakar. `npx next build` doğrudan çağrılırsa
  (e2e) kopya yapılmaz; harita orada çizilmez. Ayrıca maplibre CSS'i kapsayıcıyı
  `position: relative` yapıyor — boyutu dış kutu taşımalı.
- Kart API'si `/api/venue-map/[slug]` CDN'de 20 sn; iğne listesi kabukta `"use cache"` +
  `venues-list` tag'i. Aynı mekanın kartı örnek içinde 5 sn paylaşılır, aynı sanatçının
  iTunes araması tek uçuş — olmadan 100 kişilik soğuk sürüde kart 2,6-3,9 sn sürüyordu.
- **Yük testi** `npm run load:map -- --base <url>` (staging verisi kurar, `--cleanup` siler).
  6 Eki 2026, yerel `next start` + staging, CDN'siz (üst sınır): 100 kişi 0 hata, soğuk sürü
  kartı ~0,6 sn, akışta p50 ~4 ms / p95 ~230 ms; 500 kişi 150 istek/sn 0 hata. RPC 20 bin
  çalmada ~25 ms (ağ hariç).

**Why:** Müşteri başka PlayMyJam mekanlarını ve müzik zevklerini görsün (keşif motoru
fikrinin ilk adımı, bkz. [[pmj-kesif-motoru-fikri]]).
**How to apply:** 0073 koddan önce prod'a; tersi de kırmaz (harita boş, düzenleme ekranı
konum kolonları olmadan açılır). Yeni mekan eklenince konumu girilmezse haritada çıkmaz.
