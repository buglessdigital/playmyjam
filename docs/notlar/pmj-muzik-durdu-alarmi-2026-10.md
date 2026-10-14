---
name: pmj-muzik-durdu-alarmi-2026-10
description: "Açık player 10 sn susarsa mekan adminlerine push + OPS_ALERT_EMAIL'e e-posta + Sorunlar; sinyalsiz kayboluşta alarm YOK (kapanış yanlış alarmı); migration yok"
metadata:
  type: project
---

15 Eki 2026: `lib/music-alert.ts`. Kaynak player'ın kendi ölçtüğü kontrol dışı sessizlik (`silence_start`/`silence_end`, bkz. [[pmj-saglik-ekrani-2026-09]]) — heartbeat'le (5 sn) gelir, alarm cron'suz, olay sunucuya ulaşınca `after()` içinde gider (en geç ~15 sn).

- **Eşik 10 sn (kullanıcı kararı, 2 dk "çok fazla" dedi).** Player'ın SILENCE_MIN_MS'i zaten 10 sn; PLAYING ama ilerlemiyorsa (reklam) 50 sn, uyanmadan sonraki 90 sn sayılmaz. Bedeli: ≤45 sn kendiliğinden geçen kısa takılmalar da alarm verir (21 günde 39 sessizliğin 24'ü buydu) → bitince aynı bildirim (tag `music-<venueId>`) "Müzik yeniden çalıyor" vb. ile üzerine yazılır, telefonda yığılmaz.
- **Kanallar:** mekan adminlerine push (`music_stopped` / `music_resumed`), `OPS_ALERT_EMAIL` (virgüllü liste, Vercel env) e-postası mekan başına 30 dk'da bir, Sorunlar ekranı (area `player`, kind `music_stopped` / `music_stopped_queue_empty` → Sentry'ye de gider). `video_id` boşken başlayan sessizlik = sıra boşaldı, ayrı metin.
- Tekrar gönderilen aynı `silence_id` bir kez alarm verir (`consume_rate_limit` anahtarı `music-alert:<id>`). Aynı partide başlayıp biten sessizlik (çevrimdışı birikmiş) alarmsız.
- **Sinyalsiz kayboluşta (elektrik/internet/kapak) alarm YOK — bilinçli:** mekanlar kapanışta player'ı kapatmadan bilgisayarı kapatıyor; Mezzanine 14 günde 3 açılış / 0 `player_closed`. Kullanıcıya çalışma saati seçeneği sunuldu, şimdilik istemedi. Eklenirse kayboluş yalnız o saatlerde uyarabilir.
- Test yöntemi: SESSION_SECRET ile imzalı admin_session (taner, sv şu an 6) + `/api/player/<venue uuid>` heartbeat `presence:true` + sahte `silence_start`/`silence_end`; sonra `venue_events` ve `system_events` test satırlarını sil.

**How to apply:** "Telefonuma çok bildirim geliyor" şikâyetinde eşiği player'da değil burada büyüt (ör. start'ta gecikmeli gönderim); player'ın SILENCE_MIN_MS'i sağlık ekranının da ölçüsü. Bkz. [[pmj-push-stats-2026-07]], [[pmj-player-guvenilirlik-2026-09]].
