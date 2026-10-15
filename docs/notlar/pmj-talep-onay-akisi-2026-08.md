---
name: pmj-talep-onay-akisi-2026-08
description: Müşteri talebi → admin push onayı → 10 dk tek seferlik çalma hakkı; 0045 migration ŞART
metadata: 
  node_type: memory
  type: project
  originSessionId: 37296f07-56e9-45b2-a9fc-e74d5f274533
  modified: 2026-08-13T12:16:06.643Z
---

12 Ağu 2026'da kurulan talep onay akışı: müşteri şarkı adı + sanatçı yazıp talep
yollar → mekan adminine push (bildirimde TEK "Onayla" düğmesi) →
onayda YouTube'daki **ilk** arama sonucu `one_time_songs` satırı olarak açılır →
müşteri 10 dk içinde jetonla sıraya ekler, ilk ekleyen hakkı tüketir.

**İki ayrı 10 dakika:** `song_requests.expires_at` (adminin karar süresi, dolunca
status='expired') ve `song_requests.play_deadline` = `one_time_songs.expires_at`
(çaldırma süresi).

**Kritik tasarım kararı:** tek seferlik şarkı `venue_songs`/`playlist_songs`'a
GİRMEZ — katalog, playlist rotasyonu ve auto-fill hiç etkilenmez. Müşteri paneli
`one_time_songs`'u katalogun üstüne bindirir (BrowseClient `catalogSongs`).

- **0045 migration ŞART**: one_time_songs tablosu, request_song + get_song_user_state
  yeni gövdeleri, expire_song_requests(), push_subscriptions.admin_id (user_id artık
  nullable — admin oturumu Supabase auth kullanıcısı değil).
- Admin push için ayrı uç: `/api/admin/notifications/subscribe` (admin çerezi ile).
- Bildirim üstü karar: `/api/admin/requests/act`, imzalı `RequestActionToken` ile
  (çerez olmasa da geçer). iOS'ta `actions` desteklenmediği için bildirime dokunmak
  `/admin/{slug}/requests?act=<id>&t=<token>` açar; iOS'ta push yalnızca ana ekrana
  eklenmiş PWA'da çalışır, panelde bunu anlatan kart var.
- **Bildirimde İKİ düğme OLMAZ (13 Ağu 2026 ölçümü):** Android'de iki eylemli
  bildirimde basılan düğme ile sunucuya ulaşan komut ters eşleşiyordu — "Onayla"ya
  basılınca talep reddediliyordu (canlıda üç kez tekrarlandı; tek eylemli bildirimde
  aynı akış doğru çalıştı, sunucu ve SW kodu ikisinde de aynı). Reddetme bildirime
  dokunup panelden yapılıyor. Yeni eylem eklemeden önce bunu hatırla.
- **Süre dolumu otomatik (15 Eki 2026, 0078 ŞART):** pg_cron `expire-song-requests`
  her dakika `expire_song_requests()` çağırır; expires_at boş eski satırlar
  requested_at + 10 dk sayılır. Önceden yalnız yeni talep/karar gelince
  çalışıyordu, katalog şarkısı istekleri de expires_at'sız yazılıyordu →
  panelde 182 saatlik "bekleyen" talepler kalıyordu. Panel listesi ve rozet
  süresi geçeni cron'u beklemeden gizler. Durum adı 'expired' ("Süre doldu"),
  'rejected' değil — müşteri şeridi ve geçmiş bunu zaten tanıyor.
- Önce yerel songs, sonra search_cache, sonra YouTube araması (15 Eki 2026'dan beri, günlük tavanlı), en son admin bağlantı yapıştırır — bkz. [[pmj-talep-youtube-arama-2026-10]].
- İlgili: [[pmj-oneri-akisi-2026-08]], [[pmj-push-stats-2026-07]], [[pmj-playlist-queue-2026-08]]
