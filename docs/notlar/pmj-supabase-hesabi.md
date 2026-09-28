---
name: pmj-supabase-hesabi
description: PMJ Supabase projesinin ref'i rtvnbhifqxdeljijxtpe; Claude'a bağlı Supabase hesabında (Bugless Digital org) DEĞİL
metadata:
  type: reference
---

PMJ'nin Supabase projesi: ref `rtvnbhifqxdeljijxtpe` (auth.playmyjam.com.tr bu adrese CNAME). Dashboard: https://supabase.com/dashboard/project/rtvnbhifqxdeljijxtpe

17 Eyl 2026 kontrolü: claude.ai Supabase bağlayıcısındaki hesapta yalnızca "Bugless Digital" org'u ve BuglessCRM projesi var — PMJ projesi başka bir Supabase hesabında. En güçlü ipucu: 2 Tem 2026'da brky.bnl@gmail.com'a "taneryildirim" adlı Supabase org'una davet geldi, org sahibi taneryildirim@buglessdigital.com.tr — PMJ büyük olasılıkla o org'da. Bağlı Gmail/MCP hesabı brky.bnl@gmail.com (GitHub: berkyacan), yani Taner'in değil; davet kabul edilmemiş görünüyor. Bu yüzden Supabase MCP ile PMJ'ye erişilemez; DDL kullanıcının SQL Editor'ından ([[pmj-perf-rework-2026-07]]).

**17 Eyl 2026 — PROD YENİ PROJEDE.** PMJ artık Supabase ref `quvkscvbsplxkuolvhwe` (eu-central-1, kullanıcının başka hesabı; DB şifresi + anahtarlar `.env.new`, `.env.local` da yeni değerlerde). Eski proje `rtvnbhifqxdeljijxtpe` terk edildi: custom domain auth.playmyjam.com.tr SSL'i ölmüştü, prod ~6-17 Eyl arası DB'siz çalıştı.
- Şema: `supabase/migrations/0000_base_schema.sql` + 0001-0049 yeni projede hatasız; OpenAPI + anon davranışı eskisiyle birebir doğrulandı.
- Veri tamamı taşındı (265.267 şarkı, 35 auth user + 24 identity; e-posta kullanıcılarının şifresi YOK → sıfırlamalı). Realtime 9 tablo, venue-logos bucket.
- Auth: Google (client PlayMyJam Web, yeni secret eklendi), anonymous açık, SMTP Resend, URL config kullanıcıda yapıldı.
- Vercel: pmj projesi artık `jettplaycrm-9116` hesabında (team_1KuLn6iwUWHBSMd5URmDFsWT, eski bugless-digital değil); CLI o hesapla girişli. 3 Supabase env değiştirildi, prod deploy pmj-o1o5ogopv canlı.
- Açık işler: DB şifresi + service_role sohbette paylaşıldı → rotate; Google'daki eski secret silinebilir; custom domain yok (Pro gerekir); DDL artık psql ile doğrudan yapılabiliyor (libpq brew'de, NEW_DB_URL).
