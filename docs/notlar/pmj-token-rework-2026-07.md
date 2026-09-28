---
name: pmj-token-rework-2026-07
description: "Jeton fiyatı: 9 Ağu 2026'dan beri birim 20 TL, paket yok — tekli satış paketlerden bağımsız çalışıyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: cf8cc961-fc56-4235-a212-d3ce26941d20
  modified: 2026-08-09T12:18:51.856Z
---

16 Tem 2026: PayTR+iyzico redleri üzerine jeton sistemi rework'ü **TAMAMLANDI ve CANLIDA**
(20232a6; 0015 VE 0016 kullanıcı tarafından uygulandı; paket fiyatları panelden 30 TL bazına
göre güncellendi: 3/70₺, 5/110₺ popüler, 10/200₺, 20/350₺). Ayrıca ana sayfa profesyonel
vitrine dönüştürüldü (8aa31df): sticky header, telefon mockup'lı hero, SSS akordeon, tam
footer — chrome headless mobil ekran görüntüsü ~500px min-pencere artefaktı verir, gerçek
taşma değildir. Ayrıca /mekanlar sayfası eklendi (0ff8891): aktif mekan listesi + "Mekanı Aç";
tüm landing CTA'ları artık /mekanlar'a gider, header/footer components/landing'de paylaşımlı,
getActiveVenues "venues-list" tag'iyle cache'li (super admin CRUD revalidate eder).
Sıradaki iş: Param/banka sanal POS başvurusu, onay sonrası ödeme entegrasyonu.

İçerik: demo (+10) tamamen silindi; paketler global (`global_token_packages`, max 4, tek popular
partial-unique-index); birim fiyat app_settings.token_unit_price (30); tekli jeton satışı
(1-1000 adet, fiyat sunucuda cache'siz hesap); super admin /super-admin/pricing sayfası +
/api/super-admin/pricing (revalidateTag "global-pricing"); venues.request_cost/priority_cost
(default 1/2) — request_song RPC + istemci optimistic maliyetler bunlardan; mekan admini fiyat
sayfası/API silindi; 0015 içinde taneryldrm111@gmail.com'a idempotent 1M jeton grant
(kind='grant'). Seed paket fiyatları eski değerler — kullanıcı panelden 30 TL bazına göre
güncellemeli. İlgili: [[pmj-tosla-basvuru-2026-07]], [[pmj-global-wallet-2026-07]].

**6 Ağu 2026 fiyat güncellemesi:** birim fiyat 40 TL, yalnızca iki paket — 1 jeton 40₺,
3 jeton 100₺ (popüler). Migration `0031_pricing_two_packages.sql` (sadece DML) kullanıcının
SQL Editor'ından çalıştırılmalı; alternatifi /super-admin/pricing panelinden elle girmek.
Koddaki 30 fallback'leri 40 yapıldı (lib/pricing-cache.ts, /api/super-admin/pricing).

**9 Ağu 2026:** birim fiyat **20 TL**, paket YOK (kullanıcı panelden hepsini sildi). Paketler
silinince müşteri jeton sayfasında satın alınacak seçenek kalmıyordu; artık TokensClient paket
listesi boşken sanal "1 jeton" satırı üretiyor (id `single`, sunucuya gönderilmez) ve checkout
`package_id` gelmeyen istekte fiyatı `app_settings.token_unit_price`'tan okuyor. Fallback 20.
Migration `0042_token_unit_price_20.sql` yalnızca sıfırdan kurulan ortam içindir — canlıda
değişiklik zaten panelden yapıldı. Commit 590e44c, prod deploy'da.
