---
name: next16-instant-validation
description: "unstable_instant doğrulaması param okuyan route'larda prefetch:'runtime'+samples ister; GSP örnek sağlamaz"
metadata: 
  node_type: memory
  type: project
  originSessionId: 92d870af-84af-44b7-a177-3fb1341461c7
---

Next 16.2.6 (cacheComponents) `unstable_instant` build doğrulaması: route (veya üstteki bir layout) `params` okuyorsa `prefetch: 'static'` HER ZAMAN "accessed param ... not defined in samples" hatası verir — `generateStaticParams` örnek olarak KULLANILMAZ (doğrulayıcı örnekleri yalnızca `unstable_instant.samples`'tan okur; kaynak: `next/dist/esm/server/app-render/instant-validation/instant-samples.js`). Resmî dokümandaki (`instant-navigation.md`, draft) prefetch:'static' + params.then örneği implementasyonla uyuşmuyor.

**Why:** PMJ müşteri panelini instant yaparken build üç kez bu hatayla kırıldı; çözüm dokümanda değil kaynak kodda bulundu.

**How to apply:** Param'lı venue sayfalarında `unstable_instant = { prefetch: "runtime", samples: [{ params: { venueId: "ecem-s-house" } }] }` kullan (sayfa param okumasa bile client layout `use(params)` okuduğu için gerekli). Numaralandırılamayan param'lı route'larda (song/[songId]) `unstable_instant = false` + Suspense yapısı yeterli. `generateStaticParams` yine de değerli: bilinen mekan kabuklarını statik HTML yapar ([[pmj-perf-rework-2026-07]]).

**16 Eki 2026 — "runtime data in generateMetadata()" (Next 16.3.8):** panel düzeninin generateMetadata'sı params okuyor, kabuk statik → geliştirme ekranında "Blocking Route". Dokümanın önerdiği `<Suspense>` içi `await connection()` işaretçisi DÜZENDE işe yaramıyor: statik kabuk denetimini geçiyor ama ikinci denetim ("depth-based instant validation", `NEXT_PRIVATE_DEBUG_VALIDATION=1` ile görünür) gezinmeyi taklit edip üstteki düzenleri — alt klasör layout'ları ve paralel yuvalar dahil — "zaten ekranda" sayıyor, yalnız `__PAGE__`'e bakıyor. İşaretçi sayfa dosyasının KENDİSİNDE olmalı; istemci sayfalarda page.tsx ince sunucu sarmalayıcı yapılır (`…Client.tsx` + `components/admin/DynamicMetadataMarker`). Deneme yöntemi: ayrı worktree (`node_modules` sembolik bağ DEĞİL, `cp -Rc` — Turbopack bağı reddediyor), `next dev -p 3100`, imzalı admin_session çereziyle curl.
