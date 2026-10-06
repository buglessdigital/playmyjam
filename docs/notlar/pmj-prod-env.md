---
name: pmj-prod-env
description: "PMJ prod domaini playmyjam.com.tr (+ pmj-seven.vercel.app); env eksikleri \"Şarkı bulunamadı\" gibi sessiz hatalara yol açar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 77b7370b-0121-4357-9584-4e01b913e175
  modified: 2026-07-21T09:34:32.028Z
---

PMJ'nin prod alias'ları **playmyjam.com.tr** (özel domain, 2026-07-20 itibarıyla TRABİS yayılımı tamamlanmış ve Vercel'e aliaslı — SSL otomatik) ve **pmj-seven.vercel.app** (Vercel projesi `bugless-digital/pmj`; deployment URL'leri SSO korumalı, alias'lar açık). 2026-07-12: [[pmj-youtube-migration-2026-07]] sonrası `YOUTUBE_API_KEY` Vercel'e hiç eklenmemişti — şarkı detay sayfası prod'da "Şarkı bulunamadı" gösteriyordu çünkü `getTrackDetails` hatası `page.tsx`'te `.catch(() => null)` ile yutuluyor. Production'a eklendi + redeploy edildi. 2026-07-12 (sonra): `YOUTUBE_API_KEY` preview'a da eklendi ve VAPID üçlüsü (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) prod+preview+dev'e eklendi ([[pmj-push-stats-2026-07]]). 2026-07-21: `IYZICO_API_KEY`/`IYZICO_SECRET_KEY`/`IYZICO_BASE_URL` de prod+preview+dev'e eklendi ([[pmj-iyzico-payment-integration-2026-07]]) — canlı/production iyzico hesabı, sandbox değil. Global CLI hâlâ 51.2.1 — preview'a env eklemek gibi `--yes` isteyen işler `npx -y vercel@latest ...` ile yapılıyor, global kuruluma dokunulmadı.

**Why:** Yeni env var gerektiren her değişiklikte lokal .env.local yeterli görünüyor ama Vercel'e ekleme adımı atlanabiliyor; hata da UI'da sessizce "bulunamadı" olarak görünüyor.

**How to apply:** Yeni bir env var eklendiğinde `vercel env ls` ile prod/preview'da varlığını doğrula; prod'a curl testi için alias'ı kullan (deployment URL'leri 302 SSO döner). Lokalde 3000 portu başka projeye (JettPlay CRM) ait — PMJ'yi ayrı portta başlat.
