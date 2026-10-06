---
name: pmj-vercel-gorsel-kotasi
description: "2 Eki 2026'da Vercel hesabı Image Optimization Transformations (6.7K/5K) yüzünden duraklatıldı; next.config'te images.unoptimized: true"
metadata:
  type: project
---

2 Eki 2026'da jettplaycrm-9116 takımı Hobby kullanım sınırını aştığı için **Paused** oldu (deploy'lar dahil). Aşan tek metrik **Image Optimization – Transformations: 6.7K / 5K**; geri kalan her şey sınırın çok altındaydı. Aynı gün Pro'ya geçildi.

Sebep: `next/image` ile gösterilen her farklı görsel URL'si × genişlik Vercel'de ayrı transformation sayılıyor. Kapaklar `i.ytimg.com`'dan geliyor ve katalog yüz binlerce şarkı → müşteriler göz attıkça kota hızla doluyor. Pro'da da bu kalem ücretli.

Çözüm: `next.config.ts` → `images.unoptimized: true`. Görseller kaynağından doğrudan gelir; YouTube kapakları zaten küçük JPG olduğundan görünür fark yok.

**How to apply:** Optimizasyonu geri açmayı ya da `next/image`'e yeni uzak kaynak eklemeyi düşünürken bu kotayı hesaba kat; Vercel Usage'da "Image Optimization" satırına bak. Bkz. [[pmj-yayilim-plani-2026-09]].
