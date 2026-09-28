---
name: pmj-git-akisi-pr
description: "PMJ'de değişiklik nasıl gönderilir — main korumalı, dal + PR + otomatik Vercel prod (28 Eyl 2026'dan beri)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 483083f8-2fe7-4fee-acd0-38507fbd6267
  modified: 2026-09-27T22:25:22.386Z
---

main'e doğrudan push EDİLMEZ (GitHub koruması reddeder). Her iş: `git switch main && git pull` → `git switch -c <isim>/<kısa-ad>` → commit → `git push -u origin <dal>` → PR aç (`gh pr create --fill`; gh yoksa GitHub API, token `git credential fill`) → check + e2e yeşili bekle → **diğer geliştirici onaylar** → squash-merge → Vercel main'i kendisi prod'a çıkarır (Deployment Checks CI'ı bekler). `npx vercel deploy --prod` yalnız acil durum, CI'ı atlar.

28 Eyl 2026'dan beri ekipte iki geliştirici var (Taner + Berkay): PR'ı açan kendi PR'ını onaylayamaz, Claude da onaysız merge etmez — PR'ı açar, linkini verir, onayı diğer kişi verir.

**Why:** Bozuk kodun prod'a çıkmaması ve iki kişinin birbirinin değişikliğinden haberdar olması.

**How to apply:** Commit/push/deploy isteyen her işte bu akışı kullan; migration varsa önce `db:migrate --target staging`, prod migration'ı şimdilik yalnız Taner uygular (merge'den hemen önce). Bkz. [[pmj-profesyonellesme-2026-09]].
