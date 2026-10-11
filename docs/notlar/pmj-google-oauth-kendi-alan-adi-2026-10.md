---
name: pmj-google-oauth-kendi-alan-adi-2026-10
description: Google girişi Supabase yerine playmyjam.com.tr'ye döner (Custom Domain eklentisi gerekmeden marka); 3 env + 4 redirect URI şart, env yoksa eski akış
metadata:
  type: project
---

11 Eki 2026: Google onay ekranında `quvkscvbsplxkuolvhwe.supabase.co` yerine "PlayMyJam" + logo görünsün diye Supabase Custom Domain eklentisi (ayda ~10$, Pro şart) yerine **ücretsiz yol** seçildi: Google artık doğrudan `playmyjam.com.tr`'ye döner, kodu sunucumuz takas eder (`lib/google-oauth.ts`, giriş: `/api/auth/google/start`).

- **Müşteri:** kimlik jetonu `signInWithIdToken`; misafirse `linkIdentity({ token })` (0071 birleştirme bileti aynen çalışır, `identity_already_exists` yakalanır). Mobilde dönüş yine `/auth/native-callback` → `playmyjam://` → WebView `/auth/callback`; akış çerezi WebView'e `format=json` ile yazılır.
- **Admin kurtarma hesabı + YouTube listeleri:** Supabase'te hiç oturum açılmıyor; e-posta/sub kimlik jetonundan, YouTube erişim jetonu doğrudan Google'dan.
- **Güvenlik:** state + PKCE, doğrulayıcı httpOnly `pmj_google_oauth` çerezinde (10 dk).
- **Anahtar:** istemci yalnız `NEXT_PUBLIC_GOOGLE_OAUTH_ORIGIN` ile açılan sayfada yeni akışı kullanır. Preview'lar ve `pmj-seven.vercel.app` eski Supabase akışında kalır. Geri dönüş = env'i silip yeniden derlemek.

**Devreye alma (kullanıcının işi):**
1. GCP `play-my-jam-502210` → "PlayMyJam Web" client → redirect URI'lere ekle: `https://playmyjam.com.tr` + `/auth/callback`, `/auth/native-callback`, `/api/admin/google/callback`, `/api/admin/youtube/callback`.
2. Vercel **yalnız Production**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (sensitive; değeri aynı client'ta ya da Supabase → Auth → Providers → Google'da), `NEXT_PUBLIC_GOOGLE_OAUTH_ORIGIN=https://playmyjam.com.tr`. NEXT_PUBLIC derlemede gömülür → redeploy.
3. Supabase Google provider'ındaki Client ID bu client olmalı (`signInWithIdToken` `aud` kontrol eder).
4. Prod'da dene: müşteri girişi, misafir → Google bağlama, admin "Google ile bağla", "YouTube hesabımdan seç", mobil uygulamada giriş.
5. Hepsi çalışınca client'tan supabase.co redirect URI'sini, Branding → Authorized domains'ten supabase.co'yu sil. Supabase alanı listede durdukça marka doğrulaması geçmez. Sonra branding'i doldur (bkz. [[pmj-google-oauth-dogrulama]]).

Logo yine marka doğrulaması onaylanınca görünür. `youtube.readonly` uyarısı + 100 kullanıcı tavanı ayrı bir kapsam incelemesi ister, bu değişiklik onu kaldırmaz.
