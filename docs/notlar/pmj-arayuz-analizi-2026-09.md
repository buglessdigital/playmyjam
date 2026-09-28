---
name: pmj-arayuz-analizi-2026-09
description: "Super admin /super-admin/analytics — müşteri paneli tıklama/sayfa analizi; 0058 uygulandı, 44d0a9e 26 Eyl 2026 prod deploy"
metadata:
  node_type: memory
  type: project
  originSessionId: 0f3fa24b-e133-425a-8a5f-45eae07a710b
  modified: 2026-09-26T13:27:05.885Z
---

26 Eyl 2026: kullanıcı "mekan mekan müşteri paneli tıklamalarını arayüz geliştirmek için analiz edecek sayfa" istedi.

- Kayıt: `lib/ui-track.ts` + `components/venue/UiTracker.tsx` (VenueLayoutClient'ta) → `/api/ui-events` (204, rate limit 60/dk/IP, 90 gün budama %0.2 olasılıkla `after()` ile). Anonim: user_id/IP/yazılan metin YOK, session_id sekme başına.
- Ölü tık = etkileşimli ata yok VE cursor:pointer yok; öfke = 1 sn / 30 px içinde 3.+ tık. "Sorunlu" = dead OR rage (toplanırsa %100'ü aşıyordu).
- Sonuç olayları açıkça çağrılır: `trackAction` song_added / song_requested / suggestion_sent / checkout_started (Browse, SongDetail, History, Tokens).
- Toplama SQL'de: `ui_analytics` / `ui_heatmap` RPC'leri (PostgREST 1000 satır tavanı yüzünden). 0058 psql ile uygulandı.
- Isı haritası canlı sayfayı iframe'de gösterir → next.config'te `/venue/:path*` için X-Frame-Options SAMEORIGIN (DENY'ı ezer); iframe içinde izleyici kapalı. Config değişikliği dev sunucu yeniden başlamadan etkimez.
- localhost'ta kayıt kapalı; açmak için `localStorage.setItem("pmj-ui-track-dev","1")`.
- Adsız ikon düğmeler için öğeye `data-track="ad"` eklenebilir (etiket önceliği en yüksek).
