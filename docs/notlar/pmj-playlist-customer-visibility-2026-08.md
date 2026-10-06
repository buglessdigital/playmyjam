---
name: pmj-playlist-customer-visibility-2026-08
description: "Playlist müşteri aktifliği (0040): müşteri yalnızca customer_visible listelerdeki şarkıları görür; otomatik çalma etkilenmez"
metadata: 
  node_type: memory
  type: project
  originSessionId: c16e4a80-22ba-4bd8-afa9-f8b019ca8dde
  modified: 2026-08-09T11:52:23.582Z
---

8 Ağu 2026: müşteri katalogu artık "mekanın tüm şarkıları" değil, **müşteriye
aktif playlist'lerin birleşimi**. 0026'daki kural 2 ("müşteri tarafı hiç değişmez")
burada değişti.

**Why:** Mekan "bu liste yalnızca fon müziği, müşteri buradan seçmesin" diyebilsin;
aktiflik SADECE müşteri tarafını bağlar — pasif liste otomatik kuyrukta çalmaya
devam eder (kullanıcının açık şartı).

**How to apply:**
- `playlists.customer_visible` (default **true** — mevcut listeler ve yeni açılan
  listeler aktif doğar). `is_active` kolonu hâlâ ölü, karıştırma.
- `venue_songs.playlist_visible` materyalize: "en az bir aktif listede üye mi".
  Trigger'lar: `playlist_songs` insert/delete + `playlists` customer_visible
  update → `refresh_playlist_visibility(venue, song_ids[])`. Müşteri sorgusu tek
  tablo kalsın (hız) ve liste pasife alınınca venue_songs realtime'ı açık
  panelleri anında tazelesin diye böyle.
- Müşteri tarafı her yerde `in_venue_list && playlist_visible` okur:
  `lib/venue-cache.ts`, `BrowseClient` realtime fetch, `SimilarOverlay`,
  `get_song_user_state` RPC (in_venue_list alanı artık VE'lenmiş dönüyor).
- `request_song` RPC'sine sunucu kapısı eklendi → `not_available` (API 409).
  Öncesinde bu kontrol yalnızca arayüzdeydi.
- Panel: liste başlığında "Müşteriye açık/kapalı" pili (LibraryPane) + **9 Ağu
  2026'dan beri playlist rayında satır başına büyük göz düğmesi** (eski senkron
  rozetinin yerine). "⋮" menüsündeki aç/kapat maddesi ve raydaki "· müşteriye
  kapalı" metni kaldırıldı — anahtar tek yerde dursun diye.
  PATCH `/api/admin/playlists` → `{customer_visible: bool}`; kuyruk TAZELENMEZ,
  yalnızca `venue-songs-{venueId}` tag'i revalidate edilir.

**Tuzak:** `0040_playlist_customer_visibility.sql` kod deploy'undan ÖNCE
Supabase SQL Editor'dan uygulanmalı — kod `playlist_visible` kolonunu select
ediyor, kolon yoksa müşteri katalogu boş döner.

İlgili: [[pmj-playlists-2026-08]], [[pmj-playlist-queue-2026-08]],
[[pmj-oneri-akisi-2026-08]]
