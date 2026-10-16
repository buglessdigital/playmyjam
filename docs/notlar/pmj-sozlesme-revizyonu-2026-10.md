---
name: pmj-sozlesme-revizyonu-2026-10
description: Hizmet sözleşmesi revizyonu (16 Eki 2026) — dönem sonu fiyatı, KDV hariç hakediş, Bugless Digital taraf bilgisi, App Store kanalı + mekan panelinde Hakedişler; 0083 ŞART ve koddan ÖNCE
metadata:
  type: project
---

16 Eki 2026'da Taner'le Hizmet ve Gelir Paylaşım Sözleşmesi gözden geçirildi. Kararlar:

- **Ciro = kanal başına ücretli jeton × Dönemin SON günü geçerli birim fiyat** (eskiden metinde "harcama anındaki", kodda "hesaplama anındaki güncel" yazıyordu — ikisi tutmuyordu). **Kesinti oranları Dönem BAŞINDA geçerli olanlar** (md. 5.6: değişiklik izleyen Dönemden itibaren). İkisi `lib/business-server.ts` `getPeriodTerms` → `app_settings_history` (0083 tetikleyicisi `token_unit_price`, `apple_token_unit_price`, `payout_settings` değişikliklerini yazar; silme `null` olarak). Değer değişmeden yapılan upsert geçmişe düşmez.
- **Hakediş KDV hariç**; mekan faturasına KDV ekler (md. 6.3). Panellerde "fatura toplamı" bilgi satırı.
- **Taraf ve fatura unvanı: Bugless Digital** (Taner'in kararı; sitedeki satıcı adı hâlâ Taner Yıldırım), Ege VD, VKN 9591047099, yasal adres Rafetpaşa (vergi levhası), yazışma adresi Minerva Kuluçka (`lib/company-info.ts`; sitedeki adres hâlâ Minerva). İletişim e-postası her yerde taneryildirim@playmyjam.com.tr. Sorumluluk sınırı (md. 10.4): son 12 Dönemin hakedişi, en az 25.000 TL; ödenmesi gereken hakedişi kapsamaz.
- **App Store kanalı:** iOS'ta jeton Apple IAP ile satılacak. `wallet_transactions.channel` ('apple' | 'iyzico' | null=iyzico), `user_wallets.apple_paid_balance`, `wallet_transactions.apple_paid_amount`. Harcamada ücretli jeton kanallar arasında **ORANSAL** düşülür (Taner'in seçimi; md. 5.2 metne yazıldı). Apple komisyonu **Apple cirosunun KDV hariç kısmından**, iyzico komisyonu yalnız iyzico cirosundan. App Store birim fiyatı ayrı ayar (boş = web fiyatı); oran ve fiyat super admin → Hakedişler → Kesinti Oranları. Metinde Apple oranı **yazmaz** ("Apple'ın fiilen uyguladığı"), böylece oran girilince belgeler yeniden onaya gitmez; iyzico oranı ise metinde yazar.
- **IAP akışı yazılırken:** 'purchase' satırı `channel = 'apple'` ile eklenmeli, yoksa Apple jetonu iyzico sayılır ve mekana fazla ödenir.
- **Mekan panelinde /admin/{slug}/payouts "Hakedişler"**: yalnız onaylı + ödenmiş kayıtlar (taslak/iptal/iç not görünmez), kanal kırılımı, fatura bilgileri; süren ay yalnız jeton adedi. Sözleşme 6.4/7.1 bunu vaat ediyordu, sayfa yoktu.

**Why:** Sözleşme ile kodun farklı hesaplaması itiraz sebebiydi; Apple'ın kesintisi iyzico'dan çok yüksek olduğu için tek oranla iOS hakedişi yanlış çıkardı.

**How to apply:** 0083 prod'a koddan ÖNCE (kod `venue_payouts`'un yeni kolonlarına yazıyor; 0083 yokken geçmiş okunamazsa güncel değere düşer ama taslak oluşturma kırılır). Şablon değişikliği belgeleri kendiliğinden yeniden göndermez: super admin bir mekanın koşullarını kaydedince ya da belge senkronunu çalıştırınca yeni metin pending olur ve panel kilitlenir (16 Eki'de Biralem + test mekanı Taner onaylıydı). Bkz. [[pmj-is-yonetimi-2026-09]], [[pmj-mobil-uygulama-2026-10]], [[pmj-token-rework-2026-07]].
