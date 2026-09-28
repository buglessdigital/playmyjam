---
name: pmj-player-guvenilirlik-2026-09
description: "Player güvenilirlik turu (19 Eyl 2026, c29543b prod'da) — çift ses, şarkı yakma, oturum düşünce susma; tarayıcı testi yöntemi"
metadata: 
  node_type: memory
  type: project
  originSessionId: 219ab6b1-2036-49cd-9d2f-fd27ac5e7131
  modified: 2026-09-19T13:15:35.039Z
---

19 Eyl 2026'da 5 mekan öncesi player incelemesinde bulunan sorunlar düzeltildi, c29543b prod'da (migration yok):

- **Sahiplik kimliği artık modül belleğinde** (`playerInstanceId`), sessionStorage DEĞİL. Chrome, isimli hedefle opener'lı açılan sekmeye (panelin "TV modu" bağlantısı) ve "Sekmeyi çoğalt"a sessionStorage'ı kopyalıyor. Bu yüzden iki player aynı kimlikle çift ses çıkarıyordu. Geri almayın.
- TV sekmesi kapanınca aynı tarayıcıdaki susturulmuş panel, BroadcastChannel `pmj-player-handoff:{venue}` üzerinden kaldığı saniyeden kendiliğinden devralıyor. Başka cihazda bilerek yapılmıyor.
- Sahipliği kaybeden player'ın kendi pauseVideo()'su "dış kaynaklı duraklatma → geri aç" dalına düşüp yeniden çalıyordu. Şimdi onStateChange başında blocked==="claim" guard'ı var.
- `from_video_id` ile "sıradaki" isteği tekrarlanabilir: sahne zaten değiştiyse sunucu `already:true` döndürür. 503 alınca tekrar deneniyor, çevrimdışı yedek yalnızca ağ hatasında. `sync` isteği kesintide sahneye çıkmış duyulmamış şarkıyı sıraya geri koyuyor.
- Şifre değişince (revokeAdminSessions) sahip cihaz PLAYBACK_GRACE_ACTIONS ile çalmaya devam ediyor, yanıtta `reauth:true` dönüyor.

**Tarayıcı testi yöntemi:** Playwright + /Applications/Google Chrome (kurulu playwright tarayıcısı sürüm uyuşmuyor), SESSION_SECRET ile imzalı `admin_session` çerezi, test mekanı "taner" (80c5537b-…). Queue + now_playing önce kaydedilip sonra geri yükleniyor. Dev sunucusu 3000'de zaten açık olabiliyor ve PMJ'nin kendisi.

**How to apply:** Player'da "iki ses", "müzik kendiliğinden durdu" ya da "şarkı çalmadan geçti" şikâyetinde önce bu mekanizmalara bak. Bkz. [[pmj-player-background-throttle-2026-08]], [[pmj-fillqueue-yaris-2026-08]].
