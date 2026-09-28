---
name: pmj-playlist-autosync-2026-08
description: "YouTube playlist'lerinin günlük otomatik senkronu — 0029 migration ŞART, kota mantığı itemCount ön kontrolü"
metadata: 
  node_type: memory
  type: project
  originSessionId: 442f6979-0057-4162-b558-c1c83867f1a2
  modified: 2026-08-09T11:52:20.109Z
---

5 Ağu 2026'da eklendi: mekanın içe aktardığı YouTube playlist'ine sonradan eklenen
şarkılar günlük cron ile PMJ listesine de düşüyor. `playlist_sources` tablosu
(0029) kaynağı hatırlıyor; motor `lib/playlist-sync.ts`.

**Why:** Kota (günlük 10.000 birim) tasarımı belirledi. YouTube "bu listeye ne
eklendi" sorusunu desteklemiyor, sadece listenin tamamını veriyor. Bu yüzden
dört kademe: (1) `playlists.list` ile şarkı sayısı — 50 liste 1 birim, sayı
değişmediyse liste hiç açılmaz; (2) değişenler `playlistItems.list` ile okunur;
(3) fark `snapshot_video_ids` ile yerel alınır, 0 birim; (4) `videos.list`
yalnızca `songs`'ta hiç olmayan videolar için. Tipik gün ~20 birim.

`snapshot_video_ids` bilerek `playlist_songs`'tan ayrı: mekan bir şarkıyı elle
sildiğinde YouTube'da durmaya devam eder, fark playlist_songs'tan alınsaydı şarkı
her gün geri gelirdi. **Karar: YouTube'dan çıkarılan şarkı PMJ'den SİLİNMEZ**
(kullanıcı 5 Ağu'da böyle istedi) — sadece snapshot'tan düşer.

**How to apply:**
- 0029 migration Supabase SQL Editor'dan uygulanmalı, YOKSA panel ve cron 500 verir.
- Cron ayrı route değil: `/api/cron/youtube-refresh` içinde 3. aşama (Vercel plan
  başına cron limiti belirsizdi, tek route her planda çalışır). Pazar günleri
  `force: true` ile tam tarama — itemCount aynı gün 1 ekle + 1 sil'i göremiyor.
- `getPlaylistItems` KALDIRILDI; yerine `getPlaylistVideoIds` + `getVideoDetails`
  (ham kimlikler snapshot için lazım). `getPlaylistTitle` → `getPlaylistInfo`.
- **9 Ağu 2026 (0041, uygulandı):** senkron artık ayar değil, davranış. Panelden
  açma/kapama düğmesi ve içe aktarım modalındaki onay kutusu KALDIRILDI; import
  daima `auto_sync: true` yazıyor, PATCH'in `auto_sync` dalı silindi. Sebep:
  kota analizi — `UNIT_BUDGET=1000` sert tavanı yüzünden tüm senkron altyapısı
  günde en fazla ~1010 birim harcayabiliyor (10.000'in %10'u); asıl kota yiyici
  `search.list`, çağrı başına 100 birim.
- `auto_sync` kolonu KALDI ama anlamı değişti: kullanıcı anahtarı değil **ölü
  kaynak freni**. 10 hatada donar; artık düğme olmadığı için `playlist-sync.ts`
  başarılı her turda `auto_sync: true` yazıyor — "şimdi güncelle" tek canlandırma
  yolu. Rayda senkron ikonu YALNIZCA `last_error` varken (kırmızı) görünür.

İlgili: [[pmj-playlists-2026-08]], [[pmj-youtube-migration-2026-07]],
[[pmj-youtube-quota-2026-07]], [[next16-updatetag-route-handlers]]
