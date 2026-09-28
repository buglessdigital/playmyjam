---
name: pmj-supabase-custom-domain-2026-08
description: "Supabase auth artık auth.playmyjam.com.tr üzerinden; Google OAuth client \"Play My Jam\" GCP projesine taşındı"
metadata: 
  node_type: memory
  type: project
  originSessionId: b0363d64-75c0-459e-a732-ca2ec0552ff2
  modified: 2026-08-11T11:41:54.909Z
---

11 Ağu 2026'da Google giriş ekranındaki "rtvnbhifqxdeljijxtpe.supabase.co" yazısını markalaştırmak için
Supabase **Custom Domain** add-on'u ($10/ay) açıldı: `auth.playmyjam.com.tr`.

- DNS TurkTicaret'te: `auth` CNAME → `rtvnbhifqxdeljijxtpe.supabase.co` + `_acme-challenge.auth` TXT.
- `NEXT_PUBLIC_SUPABASE_URL` üç Vercel ortamında da `https://auth.playmyjam.com.tr`. Kodda başka
  değişiklik yok — URL tek noktadan env'den okunuyor, `next.config.ts`'te Supabase host'u geçmiyor.
- Eski `*.supabase.co` adresi çalışmaya devam ediyor; geri dönüş sadece env değişikliği.
- Google OAuth client, YouTube/Translate anahtarlarıyla aynı **play-my-jam-502210** projesine taşındı
  (client adı "PlayMyJam Web"). Kodda `GOOGLE_CLIENT_ID` yok, tüm giriş Supabase provider'ı üzerinden.
  Google'ın `sub` değeri client'tan bağımsız olduğu için bağlı hesaplar bozulmadı.
- Google Branding'de logo yüklenirse marka doğrulaması başlar ve **onaylanana kadar logo görünmez**;
  uygulama adı hemen görünür.

**Vercel CLI tuzağı:** `vercel env rm/add` aynı isim birden çok satıra dağılınca "multiple_envs" deyip
takılıyor. Çözüm: `api.vercel.com/v9/projects/<id>/env` ile id bazlı silmek, sonra tek satır olarak
`env add NAME production,preview,development --value ... --no-sensitive --force`.

İlgili: [[pmj-prod-env]], [[pmj-admin-google-reset-2026-08]], [[pmj-google-link-gate-2026-08]]
