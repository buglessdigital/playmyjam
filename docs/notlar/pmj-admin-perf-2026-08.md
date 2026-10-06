---
name: pmj-admin-perf-2026-08
description: Mekan admin paneli hızlandırma turları (10 + 13 Ağu 2026) — kalıcı desenler ve kalan yavaş yerler
metadata: 
  node_type: memory
  type: project
  originSessionId: db10cd78-e248-476d-983c-952be0520c11
  modified: 2026-08-13T18:56:30.967Z
---

Mekan admin panelinin genel yavaşlığı için iki tur yapıldı.

**1. tur (10 Ağustos 2026)** — desen: ağır kuyruk işleri yanıttan sonra (`after`),
panelde tam yeniden yükleme yerine iyimser yerel güncelleme.
- `resetAutoQueue` hiçbir admin isteğinde awaited DEĞİL — hepsi `after()` içinde.
- `playPlaylistNow(..., { refillQueue: false })` imleci taşır, dolumu çağıran `after()` ile yapar.
- `useLibrary.refresh()` uçuştaki yüklemeye bağlanır; imleç değişiminde `refreshRotation()`.
- `LibraryPane` 60 satırdan sonra sanallaştırılır (kendi `useRowWindow`'u).

**2. tur (13 Ağustos 2026)** — asıl sorun render sıklığıydı:
- **İlerleme (progress) artık React state'i DEĞİL.** `usePlayback` onu abone
  olunabilir kutuda tutuyor (`progressStore` + `useProgress`). Yeni bir yere
  "çalan saniye" koyacaksan `useProgress`'i AYRI bir alt bileşende çağır —
  aynı bileşende çağırmak o ağacı saniyede 4 kez çizdirir.
- `playerOffline` 5 sn'de bir bakılıp yalnızca değişince yazılıyor (eskiden
  250 ms'lik saat state'i vardı).
- `QueuePane` sanallaştırıldı: blok başlıkları yüzünden satırlar eşit yükseklikte
  değil, bu yüzden kümülatif ofset + ikili arama; yükseklikler DOM'dan ölçülüyor
  (`data-queue-row` / `data-queue-header` — silme).
- `lib/venue-db-id.ts`: slug→id çözümü sekme başına tek sorgu (modül + sessionStorage
  önbelleği, `useSyncExternalStore`). Panelde yeni bir yerde mekan kimliği lazımsa
  `useVenueDbId` / `resolveVenueDbId` kullan, `venues` tablosunu tekrar sorgulama.
- Sıra yazmaları artık yalnızca YERİ DEĞİŞEN satırları yazıyor; `playlist_songs`
  sırası tek `upsert` (onConflict `playlist_id,song_id`). Kuyrukta upsert
  KULLANILMADI bilerek: `status` gibi oynatıcının anlık güncellediği alanlar var.

**3. tur (13 Ağustos 2026) — "şarkı geç başlıyor, sıra geç güncelleniyor":**
- **Panel player'a videoyu sunucudan ÖNCE söylüyor.** Şarkı çalarken video kimliği
  zaten elimizde; playlist'te açılış şarkısı panelde hesaplanıp (`localOpener`,
  sunucudaki `pickPlaylistOpener` ile aynı kural) hem player'a yollanıyor hem de
  `opener_song_id` ipucu olarak sunucuya gidiyor. Sunucu ipucunu `verifyPlaylistOpener`
  ile iki ucuz sorguyla doğruluyor, tutmazsa tam seçime düşüyor.
  Sunucu sahneye dokunmazsa/başka şarkı derse panel iyimser başlattığını geri alıyor.
- `playSongNow` okumaları ve yazmaları paralel (6 ardışık tur → 2).
- **`startPlaylistFrom(venueId, playlistId, fromSongId)`** — play tuşunun kısa yolu.
  Eski zincir (`playPlaylistNow` → `clearAutoQueue` → `jumpPlaylistCursorTo` →
  `fillQueue`) aynı işi üç kez yapıyordu: ~30 ardışık DB turu, panelde sıra 8-9 sn
  sonra beliriyordu. Kısa yol iki turda hem listeyi devrediyor hem kuyruğun ilk
  20 satırını yazıyor; gerisi arkadan `fillQueue` ile geliyor. `playPlaylistNow`
  artık çağrılmıyor (kaldırılmadı). Yeni bir "listeyi başlat" yolu eklerken bunu kullan.

- **Alt bar şarkı değişimini kuyruktan tanıyor.** Player yeni video_id'yi yayınlayınca
  panel satırı kendi kuyruğundan buluyor (sahneye çıkan şarkı sıradaydı zaten) ve
  DB turu beklemeden alt barı/kuyruk panosunu değiştiriyor. `expectedVideoRef`:
  yoldaki BAYAT `now_playing` satırı (sunucu henüz yazmamışken okunan) ekrandaki
  doğru şarkıyı geri almasın diye 5 sn'lik koruma.

**Hâlâ açık (bu turda dokunulmadı):** katalog/üyelik sayfalarının ardışık çekilmesi
(`fetchAllRows` seri), arama kutusunda debounce yokluğu, `/api/admin/stats`'ın
10.000 satırı Node'da toplaması, içe aktarmanın YouTube'u yanıtta beklemesi.

Bkz. [[pmj-playlist-queue-2026-08]], [[pmj-playlist-rotation-2026-08]], [[pmj-perf-rework-2026-07]]
