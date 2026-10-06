-- Metadata tazelemenin aday okuması (0054 stale_song_video_ids) için kapsayan
-- indeks.
--
-- 3-4 Eki 2026 cron'u ilk sorguda 8 sn statement timeout'a düştü ("adaylar
-- okunamadı"). En eski satırlar heap'e dağılmış durumda: tazelenen satır
-- güncellemeyle yeni sayfaya taşınıyor, dokunulmayanlar eski sayfalarda
-- kalıyor. 20 bin aday ~19.500 farklı heap sayfası demek; sabah 06:00'da
-- önbellek soğukken ölçüm 7,9 sn (aynı sorgu ısınınca 0,13 sn).
--
-- youtube_video_id indekse eklenince sorgu yalnız indeksten cevaplanır
-- (index-only scan), heap'e gitmez. Eski indeksin yerini alır: songs'taki
-- indeks sayısı, dolayısıyla tazeleme yazmalarının maliyeti değişmez.
--
-- Tabloya yazmayı indeks bitene kadar kilitler (~1 milyon satırda birkaç
-- saniye); okumalar etkilenmez.

set statement_timeout = 0;

create index if not exists songs_metadata_refreshed_at_vid_idx
  on public.songs (metadata_refreshed_at) include (youtube_video_id);

drop index if exists public.songs_metadata_refreshed_at_idx;

analyze public.songs;
