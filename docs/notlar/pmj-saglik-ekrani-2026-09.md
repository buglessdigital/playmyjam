---
name: pmj-saglik-ekrani-2026-09
description: "Süper admin /super-admin/health — 25 Eyl 2026'dan beri YALNIZCA kontrol dışı sessizlik + hatalı sıra gösterir; sessizliği player kendisi ölçer"
metadata:
  node_type: memory
  type: project
  originSessionId: 0f4eba3f-2ec0-4de3-ae81-66cb515f686d
  modified: 2026-09-25T12:27:50.093Z
---

Kullanıcının isteği (25 Eyl 2026): sağlık ekranı "sadece hatalı sırayı ve kontrol dışı duraksamayı doğru raporlasın" — eski hali yanlış alarmlı ve kalabalıktı. Kullanıcı ayrıca kendi duraklatmalarını/bilgisayarı kapatmasını arıza sanmamı düzeltti: **o kesintiler onundu, ağ/takılma kayıtlarından "müzik durdu" çıkarımı yapma.**

**Canlıda:** 9e5c48e, 25 Eyl 2026 prod deploy (migration yok). `vercel --prod` "Not authorized" derse `--scope team_1KuLn6iwUWHBSMd5URmDFsWT` ekle.

**Kontrol dışı sessizlik** = player'ın `trackSilence` ölçümü (YouTubePlayer.tsx, her bekçi turunda): ses kanıtı = PLAYING + konum ilerliyor. Niyet "çal" (ya da kuyruk boşaldığı için `idleWantedRef`) iken 10 sn kanıt yoksa `silence_start`, kanıt dönünce `silence_end` (ended_by: recovered|paused|sleep|closed|handoff, causes = aralıktaki ağ/takılma/YouTube olayları, started_at). PLAYING ama ilerlemiyorsa (reklam olabilir) eşik 50 sn. SAYILMAYANLAR: panelden/videodan duraklatma (niyet söner), cihaz uykusu/kapanma (tur boşluğu > 20 sn VE `freeze` olayı yok; Chrome'un dondurması freeze yollar → sayılır), çalmanın başka cihaza geçmesi. Kapanışta `release` beacon'ı bekleyen olayları taşır.

**Hatalı sıra** = tetikleyicinin `out_of_order` + `never_played` kayıtları; atlanan müşteri satırı ilerletmeden < 3 sn önce girdiyse yarış sayılıp elenir (API'de). auto_ahead, repeat_play, cut_short, customer_lost gösterilmez.

Sunucunun eski `heartbeat_gap` / `progress_frozen` çıkarımları SİLİNDİ (şarkı başında yanlış alarm veriyordu). Diğer player olayları teşhis için tabloda durur, ekranda yalnızca sebep metni olarak görünür.

**Tuzak (bulundu, düzeltildi):** `logVenueEvents` toplu insert'te bir satırda `at` olup diğerinde olmayınca PostgREST eksik kolonu NULL yapıyor → `at not null` bütün partiyi düşürüyordu. Artık her satıra `at` basılıyor. Eski kodda heartbeat partisinde de aynı karışım vardı; önceki kayıt boşlukları buna bağlı olabilir.

**Test yöntemi:** Playwright (npx önbelleğinde) + /Applications/Google Chrome, SESSION_SECRET ile imzalı admin_session (taner: admin_id a08b7ff2-…, sv 5). Gerçek sessizlik için `ctx.setOffline(true)` + `YT.get(iframe.id).seekTo(süre*0.45)` (inmemiş nokta); sadece offline yapmak yetmez, player tampondan kesintisiz çalar. Kuyruk + now_playing önce yedeklenip sonra geri yüklenir. Bkz. [[pmj-player-guvenilirlik-2026-09]], [[pmj-fillqueue-yaris-2026-08]].

**4 Eki 2026 — uyanma yanlış alarmı:** PMJ yalnız Taner'in Mac'inde açıkken Biralem'e haftada 46 "sessizlik" düştü. 31'inin 12'si Mac uykudan uyandıktan hemen sonraydı: kapak kapalı Mac ~15 dk'da bir birkaç sn uyanıyor (tab_throttled ~904 sn), uyanınca Wi-Fi yeniden bağlanıp YouTube baştan tamponluyor; player uyku kaydını kapatıp sayacı sıfırlıyor ama 10 sn sonra yeni sessizlik açıyordu. Şimdi: player uyanmadan sonra 90 sn sessizlik açmaz (`WAKE_GRACE_MS`, süre dolunca hâlâ sessizse uyanma anından başlatır); API eski kayıtlar için de uyanmadan (tab_throttled) sonraki 90 sn'de başlayıp bu sürede ya da uykuyla biten sessizliği gizler, sayısını `suppressed` ile döner. `video_id` boşken başlayan sessizlik = kuyruk tükendi → ayrı "Kuyruk boş" sekmesi, son 24 saat sayısına girmez. Sebep artık tek: öncelik internet > oturum > YouTube > dondurma > dış duraklatma > kuyruk (route.ts `primaryCause`). Aynı silence_end'in iki kez yazılması (yanıt kaybolunca heartbeat yeniden yolluyor) ekranı etkilemez, silence_id ile birleşir. Kalan gerçek kesintilerin çoğu ~36 sn'lik takılma merdiveni (STALL_RELOAD 15 sn → STALL_SKIP 28 sn); kısaltmak ayrı karar.

**9 Eki 2026 — toplu "çözüldü":** satırlar onay kutusuyla seçilip "çözüldü olarak işaretle" ile kapatılır. İşaret ayrı tabloda DEĞİL: `venue_events`'e `kind = incident_resolved` satırı (detail.incident_id = sessizlikte silence_id, sırada `order-<event id>`), migration yok, cron eskileri birlikte siler. Çözülenler sekme ve "son 24 saat" sayılarına girmez, "Çözülenleri göster" ile soluk görünür. Süren sessizlik seçilemez.
