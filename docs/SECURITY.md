# PMJ Güvenlik Mimarisi

## Roller ve kimlik doğrulama

| Rol | Giriş | Oturum |
|---|---|---|
| Müşteri | `/venue/[slug]` — Supabase Auth (e-posta) | Supabase session cookie + `venue_auth_<venueId>` (httpOnly, mekana özel) |
| Mekan admini | `/admin/[slug]/login` — kullanıcı adı + bcrypt şifre | `admin_session` — HMAC-SHA256 imzalı token (httpOnly, 7 gün) |
| Super admin | `/super-admin/login` — `SUPER_ADMIN_PASSWORD` env şifresi | `sa_session` — HMAC-SHA256 imzalı token (httpOnly, 12 saat) |

İmzalı oturumlar `lib/session.ts` içinde üretilir/doğrulanır:
`base64url(JSON payload).base64url(HMAC-SHA256(payload, SESSION_SECRET))` — exp alanı zorunlu,
karşılaştırmalar `timingSafeEqual` ile yapılır. Cookie'ler prod'da `Secure` bayrağı taşır.

## Gerekli env değişkenleri

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # yalnızca sunucu; asla NEXT_PUBLIC yapmayın
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=
SESSION_SECRET=                     # 64+ karakter rastgele dize (HMAC anahtarı)
SUPER_ADMIN_PASSWORD=               # super-admin giriş şifresi
```

`SESSION_SECRET` üretmek için: `openssl rand -base64 48`

## Veritabanı migration'ları

Supabase Dashboard > SQL Editor'da sırasıyla çalıştırın:

1. `supabase/migrations/0001_token_functions.sql` — atomik jeton fonksiyonları
   (`spend_tokens`, `add_tokens`) + `user_tokens(user_id, venue_id)` unique index.
   Koşullu UPDATE sayesinde eşzamanlı isteklerde çift harcama mümkün değildir.
2. `supabase/migrations/0002_rls_policies.sql` — tüm tablolarda RLS.

Doğrulama: `select * from pg_policies where schemaname = 'public';`

## Güven modeli

- **Tüm yazmalar** (favoriler ve profil hariç) API rotaları üzerinden `service-role`
  anahtarıyla yapılır; rotalar oturumu doğrular ve `venue_id` scoping uygular.
- **Tarayıcı (anon anahtar)** yalnızca RLS'in izin verdiği okumaları yapabilir.
  `venues` tablosunda Spotify token kolonları kolon bazlı grant ile anon'dan gizlidir.
- **Spotify OAuth**: `state` parametresi imzalıdır (`signState`/`verifyState`, 10 dk geçerli)
  ve callback, oturumun ilgili mekana erişimini doğrular — token hijack kapalıdır.
- **Jeton düşümü**: `spend_tokens` RPC'si tek koşullu UPDATE ile çalışır (race condition yok).
  Kuyruğa ekleme başarısız olursa `add_tokens` ile iade edilir.
- **Ödeme**: simülasyondur. Gerçek PSP entegrasyonu
  `app/api/venue/[venueId]/tokens/purchase/route.ts` içindeki işaretli noktaya eklenmelidir.

## Bilinçli ödünleşimler

- `song_requests` herkese-SELECT'tir (admin paneli ve realtime anon anahtarla okur);
  istek sahibi kullanıcı adları mekan genelinde görünürdür.
- `queue` ve `now_playing` herkese-SELECT'tir — kuyruk zaten mekandaki herkese gösterilir.
- Spotify arama (`/api/spotify/search`) client-credentials token kullanır ve oturum istemez.
