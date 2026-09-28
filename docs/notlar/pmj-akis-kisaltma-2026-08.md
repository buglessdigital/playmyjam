---
name: pmj-akis-kisaltma-2026-08
description: "Müşteri akışı 7 tıktan 3 tıka indirildi (misafir oturumu + şarkıya ödeme); Supabase panelinde \"Anonymous sign-ins\" AÇILMADAN misafir yolu devreye girmez"
metadata: 
  node_type: memory
  type: project
  originSessionId: 79b56c12-b588-4f79-9098-56e9c7f901ad
  modified: 2026-08-17T12:03:23.111Z
---

16 Ağu 2026'da müşterinin sıfırdan şarkı çaldırma akışı 7 tıktan 3 tıka indirildi
(migration YOK, sadece kod):

1. **Misafir oturumu** (`lib/guest-session.ts`): hesap gerektiren ilk dokunuşta
   Supabase anonymous sign-in + `/api/venue/{slug}/auth` ile mekan çerezi. Giriş
   ekranı akıştan çıktı (-2 tık). `useVenueGate.requireAccount` artık **async** —
   tüm çağrı yerleri `await` ediyor, BottomNav'da `e.preventDefault()` senkron
   kalıp gezinme sonradan elle yapılıyor.
2. **Şarkıya ödeme** (`AddSongSheet.buyAndPlay`): jeton yetmiyorsa jeton sayfasına
   uğramadan eksik jeton kadar checkout açılır; `pending-add` kaydı artık
   `{videoId, priority, autoAdd}` taşır ve dönüşte SongDetailClient şarkıyı
   kendiliğinden sıraya koyar (-2 tık).
3. **Normal sıra onay ekranı kaldırıldı**: karşılaştırma iki butonun içinde (-1 tık).

**Devreye girmesi için ŞART:** Supabase panelinde Authentication → Anonymous
sign-ins AÇIK olmalı. Kapalıyken `signInAnonymously` hata döner ve akış sessizce
eski hâline (giriş ekranı) düşer — bozulmaz, sadece hızlanmaz.

Misafirin cüzdanı cihazda mahsur kalmasın diye: profil sayfasında "Hesabını bağla"
kartı; login ekranı misafir oturumunda `signUp` yerine `updateUser`, Google için
`signInWithOAuth` yerine `linkIdentity` kullanıyor (yeni kullanıcı açılsa cüzdan
eski kimlikte kalırdı).

KVKK/şartlar onayı: giriş ekranından geçilmediği için ekleme kartında
`ConsentNotice` (kutu yok, eylemle kabul) + `record_consents` RPC misafir oturumu
açılırken damgalanıyor.

Yan etki (bilinçli): başka mekanda oturumu olan kişi yeni mekanda "X olarak devam
et" düğmesine basmadan içeri giriyor.

Yapılmadı: iyzico kart saklama / Apple Pay (kart yazma adımı hâlâ duruyor),
dış katalog sonuçlarının serbest metin talep kutusunun üstüne alınması.
Gerçek kartla uçtan uca ve misafir yolu canlı test EDİLMEDİ.
Bkz. [[pmj-iyzico-payment-integration-2026-07]], [[pmj-auth-rework-2026-07]].
