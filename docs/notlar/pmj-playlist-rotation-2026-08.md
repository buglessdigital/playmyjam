---
name: pmj-playlist-rotation-2026-08
description: "Aktif playlist'ler daima sırayla çalar; 0032 + 0033 migration ŞART, karışık mod kaldırıldı"
metadata: 
  node_type: memory
  type: project
  originSessionId: d27e66a4-20da-4784-a68b-40593298e98d
  modified: 2026-08-15T12:03:43.538Z
---

6 Ağu 2026: otomatik çalma artık daima rotasyondan geçiyor — aktif playlist'ler
`sort_order` sırasıyla tüketilir, biri bitmeden diğerine geçilmez. Panelde sıra
sol raydaki oklarla değişir. 0032'de eklenen `venues.autofill_mode` ("karışık"
modu) aynı gün kaldırıldı (0033 kolonu düşürür): karışıklık isteyen mekan için
liste bazlı `playlists.shuffle` var — liste İÇİNDE rastgele, listeler arası sıra
korunur.

**Why:** Kuyruk 10 şarkılık pencere olduğu için "bu liste bitti" kuyruğa bakarak
anlaşılamıyor; ilerleme kalıcı olarak ayrı tutuluyor.

**How to apply:** İmleç `playlist_rotation` (playlist_id + cycle), tüketim
`playlist_rotation_consumed` (venue, playlist, cycle, song). Son liste bitince
imleç başa döner, cycle artar, eski tur satırları silinir. `resetAutoQueue`
düşürdüğü `auto` satırlarının tüketimini `queue.source_playlist_id` üzerinden
geri alır. Cooldown'daki/kuyrukta duran şarkı tüketilmez, atlanır. Aktif listede
uygun şarkı yoksa katalog yedeği devrede (müzik susmaz). Liste içi sıra
`playlist_songs.position`. Gerekçeler 0032 SQL başlığında.

**Başa sarma (15 Ağu 2026):** Sıradaki listelerin hepsi turunu bitirdiğinde son
liste düşmez, ilerlemesi silinip baştan çalar. Kritik nokta: bu, listelerin
kuyrukta bekleyen satırları erimeden — "verecek yeni şarkısı kalmadı" anında —
olur. Eskiden kuyruk tamamen tükenene kadar bekleniyordu, o yüzden liste
bitmeden kuyruk QUEUE_FLOOR'un (10) altına düşüp araya katalogdan rastgele
şarkılar giriyordu. `pickFromRotation` içinde `exhausted` (yeni şarkı veremez) ve
`isDone` (+ kuyrukta satırı da yok → düşer) ayrı iki kavram.

**Tuzak:** `venues` tablosunda kolon bazlı grant var (0002) — anon/authenticated
yalnızca id/slug/name/tagline/logo_url/status/created_at okuyabilir. Panele yeni
bir venue kolonu göstereceksen ya grant'e ekle ya da admin API'sinden ver;
aksi halde select sessizce boş döner.

İlgili: [[pmj-playlists-2026-08]], [[pmj-playing-cooldown-2026-08]],
[[pmj-playlist-autosync-2026-08]]
