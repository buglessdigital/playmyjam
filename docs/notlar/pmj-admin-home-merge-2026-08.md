---
name: pmj-admin-home-merge-2026-08
description: "Admin paneli tek ekrana toplandı (3 sütun + alt player barı); /playlist sayfası silindi, next.config redirect'e düştü"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a1d3e65-f48d-4bae-926d-1d386c3a8186
  modified: 2026-08-06T23:51:29.550Z
---

7 Ağu 2026: Mekan paneli "Ana Ekran"ı tek ekranlı çalışma alanına dönüştürüldü —
sol sütun playlist rayı, orta sütun seçili listenin (ya da tüm katalogun)
şarkıları, sağ sütun sıradaki 10 şarkı, altta sabit oynatma barı (play/pause/next
+ ses kaydırıcısı + Player'ı Aç). Kenar çubuğu daraltılabilir; tercih
`pmj-admin-sidebar-collapsed` anahtarıyla localStorage'da, `useSyncExternalStore`
ile okunuyor (effect içinde setState lint kuralı yüzünden).

**Why:** Mekan çalışanı gece boyunca sayfa değiştirmeden iş görebilsin; playlist
yönetimi ile kuyruk aynı ekranda olmadığı için sürekli gidip geliniyordu.

**How to apply:**
- `app/admin/[venueId]/(panel)/playlist/page.tsx` **silindi**. Eski bağlantılar
  `next.config.ts` redirects ile `/admin/:venueId`'e gider (sorgu korunur, `?list=`
  ana ekranda hâlâ okunuyor). Yeniden bir playlist rotası açmayın.
- Mantık iki hook'ta: `components/admin/home/useLibrary.ts` (katalog, listeler,
  sıra, senkron) ve `usePlayback.ts` (now_playing, kuyruk, ses). Panolar bu
  hook'ların dönüşünü tek prop olarak alır (`lib`, `playback`).
- Panel layout'u artık `h-dvh overflow-hidden`; kaydırma panoların içinde. Yeni
  bir alt sayfa eklerken kendi `p-4` kökü yeterli, sayfa kabuğu kaydırıyor.
- Migration yok; API sözleşmeleri değişmedi. Bkz. [[pmj-volume-control-2026-08]],
  [[pmj-playlists-2026-08]], [[pmj-playlist-rotation-2026-08]].
