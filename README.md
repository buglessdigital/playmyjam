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
npm run db:diff                          # prod ile test DB'nin yapısını karşılaştır (salt okur)
npm run i18n:translate                   # TR sözlükteki yeni metinleri EN'e çevir
```

## Yeni geliştirici kurulumu

Gerekenler: Node 24, git, GitHub CLI (`gh`), VS Code + Claude Code eklentisi.

- **macOS:** `brew install git gh fnm && fnm install 24 && fnm default 24`
- **Windows:** her şey WSL2 (Ubuntu) içinde çalışır — `dev` script'i POSIX sözdizimi kullanır, CI ve Vercel de Linux'tur. PowerShell'de (yönetici) `wsl --install -d Ubuntu`, yeniden başlat; Ubuntu'da `git`, [fnm](https://github.com/Schniz/fnm) ile Node 24 ve `gh` kurulur. Proje Linux ev klasörüne klonlanır (`~/`, `/mnt/c` altına değil — orada çok yavaş). VS Code'a **WSL** eklentisi kurulur ve proje Ubuntu terminalinden `code .` ile açılır; Claude Code eklentisi o pencereye kurulur.

```bash
gh auth login
git clone https://github.com/buglessdigital/playmyjam.git && cd playmyjam
npm ci
npx playwright install --with-deps chromium
```

Kök klasöre iki dosya gelir (şifre yöneticisinden, git'e girmez):

- `.env.local` — **staging** Supabase + **iyzico sandbox** değerleri. Yerel ortam prod veritabanına ya da canlı ödemeye bağlanmaz.
- `.env.new` — yalnızca `STAGING_*` satırları (migration ve e2e için).

Doğrulama: `npm run check` ve `npm run e2e` yeşil, `npm run dev` ile http://localhost:3000 açılıyor. Ardından küçük bir deneme PR'ı açılır; akış aşağıdaki gibidir.

## Çalışma düzeni

`main` korumalıdır: doğrudan push edilmez, her değişiklik bir dal ve Pull Request ile gelir.

1. `git switch main && git pull`, sonra `git switch -c <isim>/<kısa-ad>` ile dal açın, değişikliği commit'leyip dalı push edin.
2. PR açın. GitHub CI'ı çalıştırır (lint, tip kontrolü, birim ve uçtan uca testler); Vercel test veritabanına bağlı bir deneme sitesi kurar ve linkini PR'a yazar.
3. Berkay'ın PR'larını Taner onaylar (repo sahibi `buglessdigital` hesabı onay kuralından muaftır, CI ise herkese zorunludur). CI yeşilse ve deneme sitesi doğruysa PR'ı birleştirin (squash). `main`'e giren kod Vercel tarafından **otomatik olarak** prod'a çıkar; Vercel yayından önce CI'ın geçtiğini ayrıca kontrol eder.

Acil bir durumda son çare olarak `npx vercel deploy --prod` hâlâ çalışır, ama bu yol CI'ı atlar.

## Veritabanı değişiklikleri

1. `supabase/migrations/` altına sıradaki numarayla SQL dosyası ekleyin (`0060_ne_yaptigi.sql`).
2. `npm run db:migrate -- --target staging` ile test veritabanına uygulayın, Preview deploy'unda deneyin.
3. `npm run db:migrate -- --target prod --dry` ile prod'da neyin bekleyeceğine bakın, sonra `--dry` olmadan uygulayın.

Her dosya kendi transaction'ında çalışır; hata verirse tamamen geri alınır. Uygulanan dosyalar `supabase_migrations.schema_migrations` tablosunda tutulur. SQL Editor'dan elle DDL çalıştırmayın — çalıştırırsanız aynı değişikliği migration dosyasına da yazın, yoksa test veritabanı prod'dan sapar. `npm run db:diff` böyle bir sapmayı yakalar.

Bu araçlar Postgres portunu (5432) kullanır; bazı ofis/kafe ağları bu portu sessizce engeller. "Veritabanına bağlanılamadı" hatasında başka bir ağdan deneyin.

## Testler

- **Birim testleri** (`lib/*.test.ts`, `node --test`): saf iş mantığı — ücret formülü, sıra düzeni, hakediş, şarkı eşleştirme. Ücret formülü SQL ikiziyle migration dosyasından okunarak karşılaştırılır.
- **Uçtan uca testler** (`e2e/`, Playwright): site test veritabanına bağlı olarak yerelde derlenir, telefon ekranında robot tarayıcı müşteri akışını dener — misafir şarkıya ödeme yapar ve şarkı sıraya girer, reddedilen kartta jeton yüklenmez, oynatıcı kapalıyken ekleme kilitlenir. Her koşu `e2e-test` mekanını sıfırdan kurar. GitHub'da `STAGING_*` secret'larıyla her push'ta çalışır; başarısız koşunun raporu ve videosu Actions sayfasında `e2e-rapor` olarak indirilir. Başarısız testin videosu ve izi `e2e-results/` altında; rapor için `npx playwright show-report e2e-report`.
