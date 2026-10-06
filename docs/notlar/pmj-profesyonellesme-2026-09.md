---
name: pmj-profesyonellesme-2026-09
description: Projeyi büyük şirket mühendislik standardına çekme turu (27 Eyl 2026 başladı) — aşamalar ve bekleyen kararlar
metadata:
  node_type: memory
  type: project
  originSessionId: 483083f8-2fe7-4fee-acd0-38507fbd6267
  modified: 2026-09-26T22:47:08.427Z
---

Kullanıcı 27 Eyl 2026'da "projeyi büyük şirketler yapmış gibi, yapabildiğimiz kısımlarıyla en profesyonel hale getir" dedi. Lisans/iş tarafı değil, mühendislik kalitesi hedefleniyor.

Aşama 1 (b840134, prod'da): lint 0 hata, app/error.tsx + global-error.tsx + not-found.tsx, .github/workflows/ci.yml (lint+typecheck+test; build Vercel'de çünkü build Supabase'e bağlanıyor), `npm run check`, engines node "24.x" (">=" DEĞİL — Vercel en yeni majörü seçer), lib/pricing.test.ts SQL ikizini migration'dan okuyarak doğruluyor.

Aşama 2 — Sentry (d8287c8, prod'da, 27 Eyl uçtan uca doğrulandı): Vercel Marketplace'ten (CLI'daki accept-terms linki bozuk, dashboard'dan kuruldu), org `playmyjam`, proje `sentry-celeste-magnet`, EU (de.sentry.io), Developer (ücretsiz) plan. @sentry/nextjs v11: `withSentryConfig` artık `@sentry/nextjs/config`'ten, `sendDefaultPii` YOK → `dataCollection` (lib/sentry-options.ts, hepsi kapalı). Tünel /monitoring. Test ucu /api/super-admin/sentry-test (super admin oturumu ister). Vercel'deki SENTRY_AUTH_TOKEN yalnız sourcemap yetkili, issue okuyamaz; env'ler "sensitive" olduğundan pull edilemez.

Aşama 3 — test ortamı (27 Eyl, fe4b60e + 85dde55): Supabase `pmj-staging` (ref cvjfizeekepxzltqqumm, eu-central-1, kullanıcının kendi hesabında — Supabase MCP ona ERİŞEMİYOR). .env.new'de STAGING_SUPABASE_URL / STAGING_DB_URL / STAGING_ANON_KEY / STAGING_SERVICE_ROLE_KEY. `npm run db:migrate -- --target staging|prod [--dry] [--baseline N]` (scripts/migrate.ts, supabase_migrations.schema_migrations). 0001-0059 staging'e uygulandı; prod ile şema karşılaştırması birebir (tek eksik realtime yayını → 0059). Vercel Preview'daki 3 Supabase env'i staging'e, Preview iyzico tamamen sandbox (kullanıcının sandbox-merchant hesabı; STAGING_IYZICO_* .env.new'de, 27 Eyl doğrulandı). Boş DB'de build düşüyordu (boş generateStaticParams) → "ornek" yedeği.

Prod 27 Eyl baseline'landı (0001-0059 işaretli, SQL çalışmadı) — yeni migration: önce --target staging, sonra --target prod. Aşama 4 — e2e (c19a812, prod'da): Playwright, `npm run e2e`. Site test DB + iyzico sandbox env'iyle yerelde derlenip :3100'de açılır (Preview'ın Vercel koruması yüzünden oraya karşı değil). `e2e-test` mekanı her testte seedVenue() ile sıfırlanır; heartbeat beatPlayer() ile tazelenir. 3 senaryo: misafir öder→şarkı sıraya girer (sipariş+cüzdan+paid_amount), reddedilen kart (4111111111111129), oynatıcı kapalı. Mutasyon testiyle testlerin hata yakaladığı doğrulandı. iyzico form alanları maskeli → pressSequentially şart. İlk girişte arama ekranı açık gelir; role="dialog" name="Şarkı Seç" ile bulunur. README gerçek proje belgesine çevrildi.

CI TUZAĞI (ca24d02): CI b840134'ten ca24d02'ye kadar her push'ta `npm ci`'de düştü — Mac'te üretilen lock @emnapi/runtime+core içermiyordu, GitHub'ın npm 11.19'u reddediyor. Paket ekledikten sonra lock'u `npx npm@<CI sürümü> install --package-lock-only` ile üret. CI loglarını git credential'daki token ile GitHub API'den okuyabiliyorum (gh yok).

Aşama 5 — e2e CI'da (f344ab6, 28 Eyl): ci.yml'de `e2e` işi (needs: check, concurrency e2e-staging), 3/3 GitHub'da geçti. 5 GitHub secret: STAGING_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY/IYZICO_API_KEY/IYZICO_SECRET_KEY — keychain'deki git token'ı (scope: repo, workflow) + libsodium ile API'den eklendi. e2e/db.ts artık pg DEĞİL supabase-js (HTTPS); .env.local olmadan da geçiyor.
28 Eyl: bu Mac'ten Supabase pooler'a (aws-0-eu-central-1, 5432+6543, staging+prod) pg bağlantısı zaman aşımına uğradı; TCP açık, REST sağlam. `npm run db:migrate` pg kullandığı için etkilenir — sonraki migration öncesi tekrar dene.

Aşama 6 — CI/CD (28 Eyl, TAMAM): Vercel ↔ GitHub bağlı (push → otomatik deploy; PR → Preview + yorum). Vercel Deployment Checks: check + e2e (prod, CI geçmeden yayına çıkmaz — "Waiting for checks" doğrulandı). GitHub main koruması: PR zorunlu, check+e2e zorunlu, bypass yok. PR #1 squash-merge → 5938640 otomatik prod. ARTIK: doğrudan main'e push YOK; dal aç → push → PR'ı API ile aç (token: git credential, gh yok) → yeşilse squash-merge → Vercel kendisi yayınlar. `vercel deploy --prod` yalnız acil durum. Depo HERKESE AÇIK kalıyor (kullanıcı kararı: ilk mekandan sonra private + GitHub Pro); sahibi buglessdigital, bu Mac'teki hesap taneryldrm (admin değil).

Aşama 7 — geriye dönük denetim (28 Eyl, PR #2 → f56aefe prod): Next 16.2.6→16.3.6 (11 açık, 2 kritik RCE + proxy bypass; ilk audit'te `head` kesip kaçırmıştım — audit'i JSON ile tam oku). Yerelde yükseltme sonrası "next/font/google ... @vercel/turbopack-next" hatası = bayat .next önbelleği, `rm -rf .next` çözer. Dependabot (npm haftalık grup, actions aylık) + 5 STAGING secret Dependabot deposunda da. CI günlük 05:00 UTC cron + workflow_dispatch. `npm run db:diff` kalıcı. migrate 15 sn timeout. e2e yarışı: /api/queue after() fillQueue+playNext sonraki testin seed'ine sızıyordu → test 1 now_playing'i bekliyor. Vercel: SESSION_SECRET + SUPER_ADMIN_PASSWORD Preview/Prod ayrıldı (API PATCH target=production, değer korunur; CLI rm tüm değişkeni silebilirdi); Preview super admin şifresi .env.new STAGING_SUPER_ADMIN_PASSWORD. Tarayıcı Sentry tüneli canlıda doğrulandı (statik chunk taraması yanıltıcı — tarayıcıda window.__SENTRY__ bak). Bu Mac'in bulunduğu ağ (gw 10.253.x) 5432'yi yutuyor.
Açık kalanlar: iyzipay kaynaklı 4 orta açık (kullanılmayan HTTP katmanı); YOUTUBE_API_KEY Preview/Prod aynı olabilir (kota); e2e yalnız müşteri akışı (admin/player yok).

Bekleyen: CSP Report-Only.

**How to apply:** Yeni iş bu turun devamıysa buradan sürdür; [[pmj-yayilim-plani-2026-09]] ile öncelik çakışırsa kullanıcıya sor.
