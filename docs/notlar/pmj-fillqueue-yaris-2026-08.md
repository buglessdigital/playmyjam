---
name: pmj-fillqueue-yaris-2026-08
description: Kuyruğa alakasız katalog şarkısı girmesinin sebebi eşzamanlı fillQueue yarışıydı; 0046 kilidi ŞART
metadata: 
  node_type: memory
  type: project
  originSessionId: b52a943a-c105-4f8f-bf5d-d8e2eebaa0bc
  modified: 2026-08-17T10:42:22.855Z
---

`fillQueue` sekiz yerden, üçü fire-and-forget çağrılıyordu ve hiçbir kilit yoktu.
İki dolum çakışınca ikincisi kuyruğu BOŞ, `playlist_rotation_consumed`'ı ise
birincinin yazdığı haliyle DOLU okuyup listeden şarkı bulamıyor, `QUEUE_FLOOR`
yedeğine düşüp çalan listeyle alakasız 10 rastgele katalog şarkısını kuyruğa
yazıyordu. Kanıt: The Mezzanine Bar, 16 Ağu 2026 22:47:50'de 110 satır
("mezzanine 2024 summer"), 22:47:51'de 10 satır `source_playlist_id=NULL`
(Boogie Wonderland, Serdar Ortaç…). Tek dolumdan çıkamaz — `needed =
QUEUE_FLOOR - current` 110 satır yazan turda negatif olur.

**Why:** Semptom "playlist bozuk" gibi görünüyordu, aslında eşzamanlılık hatasıydı;
aynı sınıf hata `playlist_rotation` imlecini de bozabilir.

**How to apply:** Çözüm iki katmanlı — (1) 0046'daki kiralık satır kilidi
(`try_acquire_queue_fill_lock` / `finish_queue_fill` / `release_queue_fill_lock`,
dirty bayrağıyla single-flight; advisory lock İŞE YARAMAZ çünkü dolum onlarca
HTTP turu sürüyor, `pg_advisory_xact_lock` PostgREST'in tek transaction'ıyla
biter), (2) katalog yedeğine düşmeden önce kuyruğun TAZE sayılması.
`fillQueue` kilit RPC'si hata verirse **fail-open** çalışır (kilitsiz dolum),
yoksa 0046 uygulanmadan deploy edilince müzik tamamen susardı.
Kuyruk hatası araştırırken canlı duruma değil `queue` tablosunun `played`/
`removed` satırlarına bakılır: `added_at`/`started_at` + `source_playlist_id`
olayı birebir yeniden kurar (`created_at` kolonu YOK, `added_at`).
0047 ikinci turdur: kilit artık (venue_id, scope). 'advance' kapsamı sahneyi
değiştiren her şeyi (playNextFromQueue, playSongNow, syncPlayingVideo,
playPreviousFromQueue) sarar ve 'fill'den AYRIDIR — tek kilit olsaydı uzun bir
dolum, biten şarkının yerine yenisini koymayı bloklayıp müziği susturur.
advance'te dirty YOK (ilerletme tekrarlanamaz iş): kilidi alamayan çağrı `busy`
döner, player route'u 503'e çevirir — istemci 503'ü "kuyruk boş" saymaz, 1,2 sn
arayla iki kez daha dener. `started:false` dönseydi sessizlik ekranına düşerdi.
Asıl açık şuydu: /api/queue'nun `after()` "boştaysa başlat" dalı player claim'ini
atlıyor, iki müşteri isteği çakışınca biri diğerinin jetonlu şarkısını hiç
çalmadan yakıyordu.
İlgili: [[pmj-playlist-rotation-2026-08]], [[pmj-playlist-queue-2026-08]]
