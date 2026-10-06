---
name: pmj-uyelik-onaylari-2026-08
description: "Müşteri kaydında KVKK + şartlar zorunlu, ticari ileti isteğe bağlı; 0043 migration ŞART"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce6c4552-7d8a-4fac-b67d-9676037b25e2
  modified: 2026-08-09T12:35:07.478Z
---

9 Ağustos 2026'da müşteri kayıt akışına onay kutuları eklendi: KVKK Aydınlatma
Metni (/kvkk) ve Kullanım Şartları + Gizlilik Politikası zorunlu; ticari
elektronik ileti izni (/ticari-ileti) **isteğe bağlı** bırakıldı — 6563 s. Kanun
ve Ticari İletişim Yönetmeliği m.6 uyarınca onay hizmetin şartı yapılamaz ve
önceden işaretli gelemez. Kullanıcı bunun zorunlu olmasını istemişti; hukuki
gerekçe anlatıldı, zorunlu yapmak istenirse tek yapılacak ConsentChecks'teki
kutunun `consentsSatisfied`e eklenmesi.

**Why:** Onay ispatı bizde; kutu değil zaman damgası tutuluyor (profiles:
kvkk_consent_at, terms_consent_at, marketing_consent, marketing_consent_at).

**How to apply:** 0043_customer_consents.sql ŞART (kullanıcının SQL Editor'ından).
Migration eski kullanıcıları auth.users.created_at ile geriye dönük onaylı sayar.
Akış: e-posta kaydında onaylar signUp metadata'sına yazılır → handle_new_user
trigger'ı damgalar; Google'da çerezle (pending_consent*) taşınır → /auth/callback
`record_consents` çağırır. Emniyet ağı: her giriş yolu `claim_signup_consents`
çağırır, eksikse /venue/{slug}/onay ekranına düşer (RPC hata verirse fail-open —
migration uygulanmadan kimse kilitlenmesin). Ticari ileti izni Ayarlar'daki
anahtardan geri alınabilir (`set_marketing_consent`). İlgili: [[pmj-auth-rework-2026-07]]
