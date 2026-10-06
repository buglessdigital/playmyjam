---
name: pmj-kilit-dosyasi-npm-tuzagi
description: Yerel npm (11.6) package-lock.json'dan @emnapi kayıtlarını ve libc alanlarını düşürüyor; CI'daki npm ci kırılıyor
metadata:
  type: project
---

Yerelde `npm install` / `npm uninstall` koşunca (npm 11.6.2, macOS) kilit dosyasından
`@emnapi/core`, `@emnapi/runtime` (tailwind oxide-wasm32-wasi altındakiler dahil) ve
linux paketlerinin `"libc": ["glibc"|"musl"]` alanları siliniyor. CI'da `npm ci`
"Missing: @emnapi/runtime@… from lock file" ile düşüyor. İki kez yaşandı: 7a5031b ve
6 Eki 2026 #37.

**Why:** CI Linux'ta, kilidi bu kayıtlarla bekliyor; yerel npm onları gereksiz sayıyor.
**How to apply:** Bağımlılık değişikliğinde kilidi yerel npm'e baştan ürettirme. main'in
`package-lock.json`'ını al, yalnızca değişen paketlerin kayıtlarını (paket + root
`devDependencies`/`dependencies`) elle güncelle, `npm ci --dry-run` ile doğrula. Ya da
dependabot'un açtığı PR'ı kullan — onun kilidi doğru. Bkz. [[pmj-git-akisi-pr]].
