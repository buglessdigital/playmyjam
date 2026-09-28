---
name: next16-updatetag-route-handlers
description: "Next 16'da updateTag yalnızca Server Action'da çalışır — Route Handler'da revalidateTag(tag, \"max\") kullan"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7a1640cb-2acf-4760-8999-170f0d88a353
---

Next 16'da `updateTag` **yalnızca Server Action** içinde çağrılabilir; Route Handler'da sessizce exception fırlatır → route 500 + boş gövde döner, istemcide `res.json()` patlar ve PMJ'de "Bağlantı hatası, tekrar deneyin" olarak görünür (DB yazımı çoğu kez başarılı olmuştur, çökme yazımdan sonradır).

**Why:** 12 Tem 2026'da playlist'e şarkı ekleme bu yüzden hata gösterdi; kök neden YouTube geçişi değil, route handler'lardaki miras `updateTag` çağrılarıydı.

**How to apply:** API route'larında `revalidateTag(tag, "max")` kullan (ikinci argüman zorunlu; profilsiz çağrı deprecated ve TS hatası verir). `updateTag` sadece `"use server"` action'larında. Bkz. `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md`. İlgili: [[pmj-youtube-migration-2026-07]]
