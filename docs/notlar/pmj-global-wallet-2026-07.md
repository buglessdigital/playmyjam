---
name: pmj-global-wallet-2026-07
description: "Global jeton cüzdanı + mekanlar arası geçmiş — tamamlandı; 0010+0011 uygulandı, user_tokens artık yok"
metadata: 
  node_type: memory
  type: project
  originSessionId: dee6f46a-fcbd-41e0-bd06-af54281d5a78
---

2026-07-13: Mekanlar arası hesap geliştirmesi tamamlandı (commit 52b788d, prod'a deploy edildi).

- Jeton bakiyesi artık global: `user_wallets (user_id pk, balance)`; eski mekan bazlı `user_tokens` bakiyeleri toplanarak taşındı (0010, kullanıcı SQL Editor'dan uyguladı).
- `spend_tokens`/`add_tokens` artık yalnız 2-parametreli; 0011 uygulandı (2026-07-13, kullanıcı e2e testleri doğruladıktan sonra) — 3-parametreli sarmalayıcılar ve `user_tokens` tablosu DÜŞÜRÜLDÜ, artık yok.
- Yeni `get_played_history()` RPC + `/venue/[venueId]/history` sayfası ("Son Çaldırılanlar", mekan adı pill'li); profil menüsünde satırı var.
- Giriş sayfasında mevcut Supabase oturumu algılanınca "X olarak devam et" tek-dokunuş butonu (POST `/api/venue/[venueId]/auth`).
- Deploy notu: Vercel build bir kez `USE_CACHE_TIMEOUT` (tokens sayfası prerender, Supabase gecikmesi) ile düştü; aynı komutla tekrar denemek yetti.
- Devam (2026-07-13, commit 2548fbb): `wallet_transactions` ledger'ı (0012) — `add_tokens(p_user_id, p_amount, p_venue_id default null, p_kind default 'purchase')`, `request_song` spend satırı yazar, `get_wallet_history()` RPC; tokens sayfasında "Son Hareketler"; geçmiş sayfasında bulunulan mekana 1 jetonla "tekrar çaldır" butonu.
- DERS: 0011 `user_tokens`'ı düşürünce super-admin venues API'sindeki kullanılmayan `user_tokens(user_id)` embed'i endpoint'i 500'e düşürdü (2548fbb'de düzeltildi) — tablo düşürmeden önce PostgREST embed'lerini de grep'le.

**Why:** Kullanıcı jetonun her mekanda geçmesini, hesap verilerinin mekanlar arası korunmasını istedi; [[pmj-auth-rework-2026-07]] zaten hesabı global yapmıştı.
**How to apply:** Jeton işlerinde yalnız `user_wallets` + 2-parametreli RPC'ler var; `user_tokens` ve venue_id'li jeton imzaları artık mevcut değil, referans verme.
