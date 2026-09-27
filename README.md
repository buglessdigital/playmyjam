# PlayMyJam

Mekanlarda müziği müşterinin seçtiği platform. Müşteri masadaki QR kodu okutur, mekanın listesinden şarkı seçer, jetonla sıraya ekler; mekanın panelindeki oynatıcı şarkıyı çalar.

- **Müşteri paneli** — `/venue/<slug>`: gözat, ara, sıraya ekle, jeton al
- **Mekan paneli** — `/admin/<slug>`: oynatıcı, kuyruk, playlist'ler, talepler
- **Super admin** — `/super-admin`: mekanlar, CRM, hakediş, sağlık ekranı, analiz

## Teknoloji

| Katman | Kullanılan |
|---|---|
| Uygulama | Next.js 16 (App Router, Cache Components), React 19, Tailwind 4 |
| Veritabanı + auth + realtime | Supabase (Postgres) |
| Ödeme | iyzico Checkout Form |
| Müzik | YouTube IFrame Player |
| Barındırma | Vercel (fra1) |
| Hata takibi | Sentry (`lib/sentry-options.ts` — kişisel veri gönderilmez) |

> Next 16'da API'ler eğitim verilerindeki sürümlerden farklı. Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehbere bakın (bkz. `AGENTS.md`).

## Ortamlar

| | Production | Preview (deneme) | Yerel |
|---|---|---|---|
| Adres | playmyjam.com.tr | `pmj-*.vercel.app` | localhost:3000 |
| Supabase | prod projesi | `pmj-staging` | `.env.local` |
| iyzico | canlı | sandbox | `.env.local` |
| Sentry ortamı | `production` | `preview` | kapalı |

Gizli değerler Vercel ortam değişkenlerinde ve yerelde git'e girmeyen `.env.local` / `.env.new` dosyalarında durur. Preview deploy'ları **asla** prod veritabanına ya da canlı ödemeye bağlanmaz.

## Komutlar

```bash
npm run dev          # geliştirme sunucusu
npm run check        # lint + tip kontrolü + birim testleri (CI'da her push'ta çalışır)
npm run e2e          # uçtan uca testler (test veritabanı + iyzico sandbox; CI'da da her push'ta)
npm run db:migrate -- --target staging   # bekleyen migration'ları test DB'ye uygula
npm run db:migrate -- --target prod      # ...sonra prod'a (onay ister)
npm run i18n:translate                   # TR sözlükteki yeni metinleri EN'e çevir
```

## Veritabanı değişiklikleri

1. `supabase/migrations/` altına sıradaki numarayla SQL dosyası ekleyin (`0060_ne_yaptigi.sql`).
2. `npm run db:migrate -- --target staging` ile test veritabanına uygulayın, Preview deploy'unda deneyin.
3. `npm run db:migrate -- --target prod --dry` ile prod'da neyin bekleyeceğine bakın, sonra `--dry` olmadan uygulayın.

Her dosya kendi transaction'ında çalışır; hata verirse tamamen geri alınır. Uygulanan dosyalar `supabase_migrations.schema_migrations` tablosunda tutulur. SQL Editor'dan elle DDL çalıştırmayın — çalıştırırsanız aynı değişikliği migration dosyasına da yazın, yoksa test veritabanı prod'dan sapar.

## Testler

- **Birim testleri** (`lib/*.test.ts`, `node --test`): saf iş mantığı — ücret formülü, sıra düzeni, hakediş, şarkı eşleştirme. Ücret formülü SQL ikiziyle migration dosyasından okunarak karşılaştırılır.
- **Uçtan uca testler** (`e2e/`, Playwright): site test veritabanına bağlı olarak yerelde derlenir, telefon ekranında robot tarayıcı müşteri akışını dener — misafir şarkıya ödeme yapar ve şarkı sıraya girer, reddedilen kartta jeton yüklenmez, oynatıcı kapalıyken ekleme kilitlenir. Her koşu `e2e-test` mekanını sıfırdan kurar. GitHub'da `STAGING_*` secret'larıyla her push'ta çalışır; başarısız koşunun raporu ve videosu Actions sayfasında `e2e-rapor` olarak indirilir. Başarısız testin videosu ve izi `e2e-results/` altında; rapor için `npx playwright show-report e2e-report`.
