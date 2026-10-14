---
name: canliya-al-web-uygulama
description: "\"Canlıya al\" = hem web hem mobil uygulama; web değişikliği uygulamaya kendiliğinden yansır, mobile/ değiştiyse uygulama ayrıca derlenir"
metadata:
  type: feedback
---

Kullanıcı "canlıya al" dediğinde iş hem web'de hem uygulamada canlıya çıkarılır (15 Eki 2026, Taner).

- **Web:** PR → CI yeşil → squash-merge → Vercel main'i prod'a çıkarır (bkz. [[pmj-git-akisi-pr]]). Sonra playmyjam.com.tr'de değişiklik doğrulanır.
- **Uygulama:** Capacitor kabuğu playmyjam.com.tr'yi WebView'de açar (bkz. [[pmj-mobil-uygulama-2026-10]]) → yalnız web kodu değiştiyse prod deploy'u uygulamayı da günceller, ayrı adım yok; bunu kullanıcıya açıkça söyle.
- `mobile/` (kabuk, eklenti, Capacitor config, Android/iOS projesi) değiştiyse uygulama ayrıca derlenir: `npx cap sync`, Android `./gradlew bundleRelease` (imzalı AAB), iOS Xcode arşivi; mağazaya yükleme gerekiyorsa kullanıcıya bildirilir.

**Why:** Kullanıcı web ile uygulamanın hep aynı sürümde olmasını istiyor; "canlıya al" ikisini birden kapsıyor.
**How to apply:** Her "canlıya al"da değişen dosyalarda `mobile/` var mı bak; sonuçta web ve uygulama durumunu ayrı ayrı raporla.
