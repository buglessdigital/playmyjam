---
name: pmj-canli-yayin-2026-09
description: Müşteri ekranları artık postgres_changes değil `venue-live:<id>` Broadcast hattını dinliyor; 0060 ŞART (koddan ÖNCE prod'a), ölçüm 20× az DB isteği
metadata:
  type: project
---

28 Eyl 2026 (ilk mekan öncesi hazırlık). Müşteri ekranları (gözat, sıra, şarkı detayı,
oynatıcı-açık kancası, bildirim izleyicisi) tablolara postgres_changes ile abone olup
her satır değişikliğinde yeniden okuyordu. Player 5 sn'de bir now_playing'e heartbeat
yazdığı için her telefon 5 sn'de bir ~3 istek atıyordu; her ücretli şarkı bitişinde
play_count artışı gözat ekranındaki herkese mekanın bütün kataloğunu indirtiyordu;
NotificationWatcher'ın filtresiz DELETE aboneliği bütün mekanların silmelerini her
telefona taşıyordu.

**Yeni yol:** `0060_venue_live_broadcast.sql` tetikleyicileri deyim başına tek
`realtime.send` yollar (topic `venue-live:<venue_id>`, herkese açık kanal):
`queue`, `np` (şarkı/çal-duraklat/çapa >2 sn), `beat` (20 sn'lik dilim — veri çekmez),
`catalog` (play_count SAYILMAZ), `one_time`. İstemci tarafı `lib/venue-live.ts`:
sayfadaki bütün bileşenler tek kanalı paylaşır (supabase-js aynı konuya ikinci kanal
açmıyor, mevcudu veriyor), okumalar `coalesce` ile toplanıp 150–750 ms'ye yayılır,
bağlantı dönüşünde / 30 sn+ gizli kalan sekmede `resync`.

**Ölçüm** (`npm run load:venue`, staging, 50 telefon): gerçekçi tempoda
(`--song-sec 210 --add-sec 60`) telefon başına dakikada 31 → 1,5 istek (20,7×),
mesaj teslimi p95 817 → 314 ms. Yoğun tempoda 4×.

**Bilinçli ödünler:** "En çok çalınanlar" sayfa açılışında/yeniden bağlanışta tazelenir
(play_count yayın yapmaz). Otomatik doldurma artık "kuyruğa şarkı eklendi" bildirimi
atmıyor (yalnızca user_id'li satırlar).

**Why:** Yük mekandaki telefon sayısıyla çarpılıyordu; 2000 mekanda Postgres'i ilk bu bitirirdi.
**How to apply:**
- 0060 prod'a KODDAN ÖNCE uygulanmalı — tetikleyici yoksa müşteri ekranları yalnızca
  açılışta/uyanışta tazelenir. Tersi güvenli (eski kod tetikleyicileri görmezden gelir).
- Müşteri ekranına yeni canlı veri gerekiyorsa postgres_changes EKLEME: tetikleyiciye
  olay ekle, `useVenueLive`/`subscribeVenueLive` ile dinle. Admin paneli ve player
  postgres_changes'te kaldı (mekan başına 1-2 abone), yayın tablosu değişmedi.
- now_playing'e yeni bir müşteri-görünür kolon eklenirse `now_playing_live_notify`'daki
  "anlamlı" koşuluna da eklenmeli.

İlgili: [[pmj-player-offline-gate-2026-08]], [[pmj-realtime-publication-2026-08]], [[pmj-olcek-esikleri-2026-09]]
