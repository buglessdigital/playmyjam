---
name: pmj-youtube-migration-2026-07
description: "PMJ 12 Tem 2026'da Spotify'dan YouTube'a temiz kesimle geçti — player /admin/[slug]/player, arama yerel-önce + search_cache"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7a1640cb-2acf-4760-8999-170f0d88a353
---

PMJ, 12 Temmuz 2026'da Spotify Connect'ten YouTube'a **temiz kesimle** geçirildi (kullanıcı kararı: flag yok, eski katalog silindi).

- Oynatma: `components/player/YouTubePlayer.tsx` (IFrame API) + tam ekran `/admin/[slug]/player` sayfası. Şarkı bitişi `onStateChange(ENDED)` ile olay tabanlı; 5 sn'lik sync polling silindi. Komutlar `/api/player/[venueId]` (next/play/pause/error/heartbeat) → now_playing güncellenir, player Realtime ile uygular.
- Arama: `/api/search` üç katman — songs tablosu ILIKE → `search_cache` (30 gün) → YouTube search.list (100 birim; günlük kota 10.000, proje geneli). Kota dolunca `quota_exceeded` ile yerel sonuçlara düşer.
- Kimlik: `songs.youtube_video_id` (spotify_track_id kaldırıldı); RPC `get_song_user_state(p_venue_id, p_video_id)`. Migrasyon: `supabase/migrations/0008_youtube.sql` — [[pmj-perf-rework-2026-07]] kuralı gereği DDL'i kullanıcı SQL Editor'dan uygular.
- Heartbeat: player 15 sn'de bir `now_playing.last_heartbeat_at` yazar; admin paneli 45 sn sessizlikte "oynatıcı çevrimdışı" uyarısı gösterir.
- Env: `YOUTUBE_API_KEY` (yalnız sunucu). SPOTIFY_* tamamen kaldırıldı (.env.local + Vercel'den de silinmeli).
- ToS kuralları koda gömülü varsayım: video görünür kalmalı (ses-yalnız yasak), overlay yok, indirme yok — kota artış başvurusunun ön şartı.
- Bilinen sınırlar: gömülü videolarda reklam (mekan tarayıcıda kendi YouTube Premium'uyla oturum açarsa kalkar); embed'e kapalı videolar `songs.embeddable=false` işaretlenip atlanır.
