---
name: pmj-mekan-haritasi-2026-10
description: Müşteri panelinde "Mekanlar" haritası (alt menüde ŞARKI SEÇ ile JETON AL arası); konum super admin'de Google Maps linkinden; tür 15 Eki'den beri ŞARKI bazında (son 30 gün, her çalma 1); 0073+0079 ŞART
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
- **Tür (15 Eki 2026'dan beri, 0079):** son **30 günün her çalması** kendi ŞARKISININ
  türüne 1 sayılır — 300 pop + 300 rock çalma = %50-%50, pop'takiler tek şarkı olsa
  bile ("en çok çalınan şarkılar" 90 günde kaldı; kartta `genreDays`). Kullanıcı
  sanatçı bazlı eski yöntemi reddetti (pop sanatçısının rock şarkısı pop sayılıyordu,
  ilk 30 sanatçı dışı hiç sayılmıyordu). `song_genres` (songs'a kolon EKLENMEDİ),
  `venue_genre_plays` RPC'si ham türe göre toplar. `lib/song-genre.ts`: iTunes'ta
  "sanatçı + ad", `pickBestMatch` + sanatçının iTunes SANATÇI alanında geçmesi şart
  (yoksa "X Type Beat" kayıtları eşleşiyordu). Şarkı bulunamazsa sanatçının türüne
  düşülür (`artist_genres`, `source='artist'`). Prod örnekleminde 30/40 şarkı doğrudan
  bulundu. Mekan başına ayda ~100-250 farklı şarkı → asıl dolum `/api/cron/song-genres`
  (10 dk'da bir, 3 sn aralık, 240 sn, 3 ardışık sınır hatasında durur); kart açılırken
  bilinen pay <%50 ise 8 şarkı beklenir, 12'si `after()` ile. Aileler `lib/genres.ts`
  (Dance/House/Electronic → Elektronik). NULL = bulunamadı, 30 günde bir yeniden.
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
konum kolonları olmadan açılır). 0079 da koddan önce; yoksa yalnız tür alanı boş kalır.
0079 staging'e 15 Eki'de Supabase bağlayıcısıyla uygulandı (bu ağda 5432 kapalı). Yeni mekan eklenince konumu girilmezse haritada çıkmaz.
