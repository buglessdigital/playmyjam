---
name: pmj-push-stats-2026-07
description: "Web Push \"şarkın çalıyor\" bildirimi + admin istatistik sayfası eklendi (2026-07-12); push için kullanıcı adımları bekliyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: f4fe56ab-9bb1-45ab-8eec-b37e645adb9e
---

2026-07-12: PMJ'ye iki özellik eklendi.

1. **Web Push "şarkın çalıyor"**: `web-push` paketi; `lib/push.ts` (sendPushToUser, 404/410'da abonelik siler); `app/api/notifications/subscribe` (POST/DELETE, getClaims auth); `playNextFromQueue` şarkı sahibine push atar (slug'ı çekip `/venue/{slug}/queue` URL'i); settings sayfasında "Şarkım çalınca" toggle'ı (`pmj_notif_push` pref). sw.js'teki push handler zaten hazırdı.
2. **Admin istatistik**: `/api/admin/stats?days=1|7|30` (queue'dan JS aggregation, user_id null hariç, Europe/Istanbul saat dilimi) + `/admin/[venueId]/stats` sayfası (stat kartları, saatlik bar grafik, top 10) + sidebar linki. DDL gerektirmez, hemen çalışır.

**Durum (2026-07-12 akşamı): tamamlandı.** VAPID env üçlüsü Vercel'in üç ortamında; production'a CLI ile deploy edildi (alias pmj-seven.vercel.app doğrulandı). Kullanıcı 0009 migrasyonunu SQL Editor'dan çalıştırdı (DDL her zaman kullanıcıda, bkz [[pmj-perf-rework-2026-07]]). Commit `acd3e3c` main'e pushlandı. Push akışı henüz gerçek cihazla uçtan uca denenmedi — sorun çıkarsa ilk bakılacak yer: ayarlar sayfasındaki toggle → subscribe POST → `push_subscriptions` satırı → `playNextFromQueue` gönderimi.

**Neden böyle:** push_subscriptions istemciye tamamen kapalı (RLS açık, policy yok); tüm erişim service-role API'dan. VAPID env eksikse `lib/push.ts` sessizce no-op — build/istek düşürmez.
