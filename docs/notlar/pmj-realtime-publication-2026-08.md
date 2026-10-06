---
name: pmj-realtime-publication-2026-08
description: "Realtime yayınına bazı tablolar dashboard'dan eklenmiş, migration'larda görünmez (16 Ağu 2026 doğrulandı)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24526773-70d8-41df-a63d-7e63a0d80b46
  modified: 2026-08-16T18:08:01.853Z
---

`supabase_realtime` publication'ındaki tablo listesi depodaki migration'larla
**örtüşmüyor**. Migration'larda yalnızca `one_time_songs`, `playlists`,
`playlist_songs`, `playlist_sources`, `playlist_rotation`, `venue_songs`
eklenmiş; ama panelde 9 tablo açık — `song_requests` dahil (Publications
sayfasından elle açılmış).

**Sonuç:** "migration'larda yok → realtime kapalı" çıkarımı YANLIŞ. Gerçeği
görmek için Supabase panel → Database → Publications → `supabase_realtime` →
sağdaki "N tables" listesine bakılmalı.

**Risk:** proje sıfırdan migration'larla kurulursa bu tablolar realtime'sız
gelir. Kayda geçirmek için idempotent satır:
`alter publication supabase_realtime add table public.song_requests;`
(16 Ağu 2026 itibarıyla henüz eklenmedi.)

İlgili: [[pmj-talep-durum-seridi-2026-08]]
