---
name: pmj-kotasiz-mimari-2026-08
description: YouTube kotasını sıfıra indiren mimari — search.list koddan silindi, havuz 11.017 şarkı; kalan iş gerçek cihaz testi
metadata:
  type: project
---

22 Ağu 2026'da başlanan iş: PMJ'yi YouTube Data API kotasına hiç ihtiyaç duymayan
hale getirmek, böylece kota artışı başvurusunun (bkz. [[pmj-youtube-quota-2026-07]])
getirdiği uyum denetimi riskinden tümüyle kaçınmak.

**Dayanak:** IFrame Player kota yakmıyor — çalmak bedava. Kotayı yakan tek pahalı
çağrı `search.list` (100 birim). `songs` tablosu TÜM mekanlarda ortak olduğu için
"şu yazı = şu video" eşleşmesi bir kez kurulunca herkese açılıyor.

**Bitti (1. aşama):**
- `lib/song-match.ts` — saf eşleştirme katmanı. İki ayrı karar: ELEME (bu video o
  şarkı mı) ve SEÇME (karaoke/hızlandırılmış/canlı sürümler arasından hangisi).
  `lib/song-match.test.ts` ile test edilir. `fold()` artık burada, similar.ts
  yeniden dışa aktarıyor.
- `scripts/seed-catalog.ts` + `npm run seed:catalog` — playlist'lerden ortak havuzu
  tohumlar. ~50 şarkı = 2 birim, search.list HİÇ kullanılmaz. Bütçe koruması var,
  yarıda kalırsa kaldığı yerden sürer. Kaynak listesi `scripts/seed-playlists.txt`
  (KULLANICI HENÜZ DOLDURMADI — dosya şu an sadece talimat).
- `lib/youtube-parse.ts` — saf çözümleyiciler; betik ile uygulama aynı kodu
  kullansın diye ayrıldı (node alias çözemediği için import'suz olmalı).
- resolveSuggestion / resolveMatchingSuggestions artık ilk eşleşeni değil en iyi
  sürümü seçiyor.

**Yakalanan hata:** LIKE sorgusunda `toLocaleLowerCase("tr")` Türkçe "İ"yi "i"
yapıyor, Postgres ise "i̇" (i + birleşik nokta) yapıyor — ilike hiç tutmuyordu.
Artık metin küçültülmüyor + başlık tutmazsa sanatçıdan ikinci sorgu atılıyor.
Gerçek havuzda isabet 11/12'den 36/36'ya çıktı.

**Bitti (2-4. aşama, aynı gün):**
- `search.list` KODDAN TAMAMEN SİLİNDİ (`lib/youtube.ts`). Geri koymak isteyen
  olursa dosyadaki yorum sebebini anlatıyor.
- `findInPool` (0 birim) + `resolveVideoLink` (yapıştırılan bağlantı, videos.list
  = 1 birim, kota dolarsa oEmbed'e düşer, süre 0 kalır).
- Bildirim ikiye ayrıldı: havuzda tanınıyorsa "Onayla" düğmesi (tek tuş, eski
  davranış), tanınmıyorsa düğme YOK — admin bildirime dokunup panelde yapıştırır.
  Ayrım talep düşer düşmez `findInPool` ile yapılıyor.
- Panel istekler sayfasında sarı yapıştırma kartı: "YouTube'da aç" + URL alanı.
- `/api/search` artık havuz + yapıştırılan bağlantı; admin arama kutusuna link
  yapıştırabiliyor.
- Şarkı detay sayfası `lib/track-lookup.ts` (songs → oEmbed), Data API'ye gitmiyor.
- Cron tazeleme partisi havuz boyutuna göre ölçekleniyor (500–5000).
- `tsconfig.json`'a `allowImportingTsExtensions` eklendi (node ile .ts koşmak için).

**GERÇEK GÜNLÜK TAVAN (sıfır DEĞİL, bilinçli):** tazeleme ≤100 + playlist
autosync ≤1000 = 1100 birim; tipik gün ~30. Autosync ve uyum cron'u KALDIRILMADI:
autosync mekanların listelerini güncel tutuyor (~20 birim/gün), refresh cron'u ise
Developer Policy III.E.4'ün 30 günlük tazeleme yükümlülüğü. Kullanıcı isterse
autosync düğmeye çevrilebilir.

**Not:** Bu iş yalnızca kota sorununu çözüyor; ticari mekân lisansı / jetonla
erişim meselesi ayrı ve çözülmedi.
