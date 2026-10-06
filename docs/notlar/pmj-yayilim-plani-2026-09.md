---
name: pmj-yayilim-plani-2026-09
description: Aşamalı mekan yayılımı 5→30→100→250→500→1000→2000 (her aşama ~1 ay); 19 Eyl 2026 itibarıyla 5 mekan için engeller Vercel Hobby + Supabase Free
metadata: 
  node_type: memory
  type: project
  originSessionId: 219ab6b1-2036-49cd-9d2f-fd27ac5e7131
  modified: 2026-09-19T12:46:28.835Z
---

Kullanıcının planı (19 Eyl 2026): önce 5 mekan kurulur ve 1 ay geliştirmeye devam edilir, sonra 30 mekan, ardından aylık adımlarla 100, 250, 500, 1000, 2000.

19 Eyl 2026'daki kontrolde durum: prod'da 4 mekan var (berkay, ogulcan, taner, the-mezzanine-bar), DB 104 MB.
- **Vercel pmj projesi Hobby planında** (jettplaycrm-9116). Hobby ticari kullanımı yasaklıyor ve ayda 1M fonksiyon çağrısı veriyor. Player 5 sn'de bir `/api/player/{id}` heartbeat yolluyor; mekan başına günde 12 saatte ayda ~260k çağrı ediyor, yani 5 mekan kotayı aşar → Pro şart.
- **Supabase muhtemelen Free** (custom domain "Pro gerekir" diye kurulmadı). Player saniyede bir Realtime broadcast yolluyor (STATE_BEAT_MS), ayda 2M mesaj kotası 2 mekanla dolar. Free planda yedek de yok → Pro şart.
- 17 Eyl'deki (taşıma günü) 6 ödeme denemesi initialize'da istisnaya düştü, raw_response boş. 19 Eyl'de lokalden atılan initialize denemesi başarılı; prod'da gerçek bir satın alma ile yeniden doğrulanmalı.

**Why:** Heartbeat ve broadcast sıklığı mekan sayısıyla doğrusal artıyor; 500+ mekanda maliyet mimariyi belirler.
**How to apply:** Ölçek sorusu gelince önce bu iki sıklığa bak (YouTubePlayer.tsx HEARTBEAT_MS, STATE_BEAT_MS). 100+ mekandan önce heartbeat'i Vercel dışına (Realtime presence veya doğrudan RPC) taşımayı değerlendir. Bkz. [[pmj-supabase-hesabi]], [[pmj-iyzico-payment-integration-2026-07]].

**25 Eyl 2026 — mekan öncesi kontrol listesi kararları:** Vercel Pro + Supabase Pro mekanlara vermeden HEMEN önce alınacak → ardından custom domain (auth.playmyjam.com.tr) → ardından Google OAuth doğrulama/marka. Anonymous sign-ins açık, "Deploy Kontrol" satırı silindi, iyzico banka komisyonu %5 girildi, iyzico anahtar yenileme gereksiz. Cihaz testlerini kullanıcı düzenli yapıyor. Müzik lisansı "yol üstünde" çözülecek. Bu maddeleri tekrar sorma.
