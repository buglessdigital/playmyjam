---
name: pmj-is-yonetimi-2026-09
description: "Super admin iş yönetimi (CRM, görevler, sözleşme, hakediş) — 18 Eyl 2026 yazıldı; 0050+0051 uygulandı; 87d1fa7 ile commit + prod deploy (19 Eyl 2026)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a36cdc24-97c0-4b94-9d65-032fa581bf8e
  modified: 2026-09-18T11:26:23.582Z
---

Super admin'e iş yönetimi eklendi (18 Eyl 2026): /super-admin/crm (aday hattı + görüşme kaydı), /tasks, /contracts, /payouts, dashboard'da BusinessOverview. Mekan Talepleri'nde "CRM'e Aktar".

Hakediş modeli (kullanıcının tanımı): **mekan payı = mekan komisyon % × (ciro − KDV − banka komisyonu − ek kesinti)**. Ciro = harcanan jeton (wallet_transactions kind='spend') × güncel birim fiyat. Kesinti oranları app_settings.payout_settings'te (varsayılan KDV 20, banka 0 — kullanıcı iyzico oranını girmeli). Her venue_payouts satırı oranların kopyasını saklar.

**Why:** Ledger TL tutmuyor; bedava (grant/demo) jetonla ödenmiş jeton ayırt edilemiyor — hepsi ciroya sayılıyor.

**How to apply:** 0050_business_management.sql kullanıcı tarafından SQL Editor'da uygulanmadan ekranlar 500 döner. Hesap formülü lib/business.ts computePayout (testi lib/business.test.ts). Taslak yeniden hesaplanırken düzeltme/not korunur, onaylı/ödenmiş kayda dokunulmaz. Bkz. [[pmj-token-rework-2026-07]], [[pmj-iyzico-payment-integration-2026-07]].

**Sözleşme belgeleri (18 Eyl 2026, 0051 ŞART):** super admin /super-admin/contracts/[venueId]'de metin yazar (şablon lib/contract-template.ts) → "Mekana Gönder" (pending) olunca mekan paneli proxy'de /admin/{slug}/contract-approval'a kilitlenir (panel kabuğu dışında, müzik çalmaz). Mekan onaylayınca kayıt: kullanıcı adı, IP, UA, SHA-256; onaylı metin DB tetikleyicisiyle değişmez. Kapı yalnızca SAYFALARDA — açık kalmış player sekmesinin API'leri kesilmez. Kilit durumu lib/venue-documents.ts (kilitsizken 30 sn önbellek, kilitliyken önbelleksiz, tablo yoksa fail-open).

**Otomatik belge seti (19 Eyl 2026, migration YOK):** Koşullar'daki zorunlu alanlar (bitiş tarihi ve notlar hariç hepsi) doluyken kaydetmek 3 belgeyi üretip doğrudan pending yapar: Hizmet ve Gelir Paylaşım Sözleşmesi, KVKK protokolü, Müzik Lisansı ve Tazmin Taahhütnamesi (lib/contract-template.ts, senkron lib/venue-documents.ts syncVenueDocuments). Belge türü kolon değil, başlık SONEKİ ("… — PlayMyJam {ad}"); başlığı elle değiştirilen belge artık otomatik sete sayılmaz. Metni değişen tür yeniden onaya gider; yeni sürüm onaylanınca eski onaylı sürüm withdrawn olur. **25 Eyl 2026 — hakediş artık yalnızca ücretli jetondan (0057 ŞART):** user_wallets.paid_balance + wallet_transactions.paid_amount, BEFORE INSERT tetikleyicisi tutar; harcamada ÖNCE ücretli jeton düşer. Geçmiş yeniden oynatıldı; purchase satırı ancak başarılı payment_orders siparişine (±5 dk) denk gelirse ücretli (16 Tem simülasyon satın alması bedava). venue_token_usage artık paid_tokens da döner; 0057 yokken kod eski davranışa düşer. Ekipman tutanağı eklenmedi (veri yok).

docs/youtube-compliance-reply-2026-0{8,9}.md bilerek commitlenmedi: test mekanı "taner"in canlı panel şifresini düz metin içeriyor.

**25 Eyl 2026 — açılış öncesi tüm satın almalar TEST:** Uygulama henüz müşteriye açılmadı; o güne kadarki ödemeler/harcamalar test. Eylül ve öncesi için hakediş oluşturulmayacak. İlk gerçek dönem, ilk 5 mekanın açıldığı ay. Açılış sonrası test alımları "Düzeltme" alanıyla düşülür; test hesabı hariç tutma özelliği şimdilik gereksiz görüldü.
