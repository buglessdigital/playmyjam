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
