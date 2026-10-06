---
name: pmj-tosla-basvuru-2026-07
description: "Tosla İşim sanal POS başvurusu — site şartları deploy'da; playmyjam.com.tr alındı, TRABİS DNS yayılımı bekleniyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: cf8cc961-fc56-4235-a212-d3ce26941d20
---

15 Temmuz 2026: Tosla İşim (isim.tosla.com) sanal POS başvurusu için site şartları eklendi ve
**production'da canlı** (commit 01d448e; browse/now-playing işi bfa60ff — 0014 migration'ı
kullanıcı SQL Editor'dan uygulayacak, kod geriye uyumlu): vitrin ana sayfa (fiyatlar +
İletişim başlığı), `/hakkimizda`, `/iletisim`, `/mesafeli-satis-sozlesmesi`, `/teslimat-iade`,
Türkçeleştirilmiş `/privacy` (İngilizce metin YouTube kota başvurusu için altta korundu),
`CardLogos` (Visa/MC/Troy), genişletilmiş `LegalFooter`. Satıcı bilgileri `lib/company-info.ts`
— telefon/adres dolduruldu.

**Domain:** playmyjam.com.tr TurkTicaret'ten alındı (bitiş 14 Tem 2027, NS turkticaret'te
kalıyor), pmj projesine apex+www eklendi; A `76.76.21.21` + CNAME www `cname.vercel-dns.com`.
**CANLI:** https://playmyjam.com.tr SSL'li servis ediyor, http→https 308 (15 Tem 2026 akşamı
doğrulandı). Artık asıl prod adres bu ([[pmj-prod-env]] güncellenmeli sayılır). Kalan: Tosla
formuna `https://playmyjam.com.tr` yazılıp başvurunun gönderilmesi (kullanıcıda); ödeme
entegrasyonu (Tosla API) başvuru onayı sonrası iş.
