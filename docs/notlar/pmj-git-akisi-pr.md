---
name: pmj-git-akisi-pr
description: "PMJ'de değişiklik nasıl gönderilir — main korumalı, dal + PR + otomatik Vercel prod (28 Eyl 2026'dan beri)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 483083f8-2fe7-4fee-acd0-38507fbd6267
  modified: 2026-09-27T22:25:22.386Z
---

main'e doğrudan push EDİLMEZ. Her iş: `git switch main && git pull` → `git switch -c <isim>/<kısa-ad>` → commit → `git push -u origin <dal>` → `gh pr create --fill` → check + e2e yeşili bekle → squash-merge → Vercel main'i kendisi prod'a çıkarır (Deployment Checks CI'ı bekler). `npx vercel deploy --prod` yalnız acil durum, CI'ı atlar.

**Kim onaysız merge edebilir (28 Eyl 2026'dan beri):** repo `buglessdigital` adlı KİŞİSEL hesaba ait (organizasyon değil) — orada rol yok, collaborator'lar hep write, admin yalnız sahip hesap.
- Klasik koruma (main): PR zorunlu, `check` + `e2e` zorunlu, admin dahil kimse CI'ı atlayamaz.
- Ruleset `main-onay`: 1 onay + yeni push'ta onay düşer; muafiyet yalnız "Repository admin" (= `buglessdigital`), yalnız PR'lar için.
- Taner yazılım yöneticisi; yerelde git + `gh` `buglessdigital` hesabıyla girişli → Taner'in PR'ları CI yeşilse onaysız merge edilir (`gh pr merge <no> --squash --admin`).
- Berkay (`berkyacan`, write) ve `taneryldrm` hesabı muaf değil → PR'ları Taner'in onayını bekler. Berkay'ın Claude'u onaysız merge etmeye çalışmaz; PR'ı açar, linki verir.

**Why:** Bozuk kod prod'a çıkmasın (CI herkese zorunlu), Taner yönetici olarak beklemeden çalışsın, Berkay'ın değişikliklerini Taner görsün.

**How to apply:** Hangi hesapla çalışıldığına `gh auth status` ile bak. Migration varsa önce `db:migrate --target staging`; prod migration'ı şimdilik yalnız Taner uygular (merge'den hemen önce). Bkz. [[pmj-profesyonellesme-2026-09]].
