---
name: pmj-iyzico-kart-saklama-2026-08
description: "iyzico Kart Saklama eklentisi (yıllık 99 TL) 17 Ağu 2026'da alındı; cardUserKey akışı + 0048 migration şart"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5ea191d0-d1fe-4f39-b186-02769012a191
  modified: 2026-08-17T15:49:54.976Z
---

iyzico'nun "Ödeme Hizmeti ve Kart Saklama" eklentisi 17 Ağu 2026'da satın alındı: **yıllık** 99 TL (BSMV dahil), bakiyeden düşer, mevcut komisyon oranlarını değiştirmez — onların üstüne eklenen sabit ücret. Panelde "Eklenti Kullanımda" yazıyor.

Akış: ilk ödemede kullanıcı formda "kartımı sakla" derse iyzico bir `cardUserKey` üretip ödeme **sorgu (retrieve) yanıtında** döndürür → `profiles.iyzico_card_user_key`'e yazılır (0048) → sonraki ödemelerde Checkout Form initialize isteğine konur ve form saklı kartlarla açılır. Kart verisi asla bize gelmez, PCI kapsamına girmiyoruz.

Non-obvious noktalar:
- `cardUserKey`, Checkout Form initialize'da destekleniyor (kanıt: `node_modules/iyzipay/lib/requests/CreateCheckoutFormInitializeRequest.js`) ama iyzico'nun yeni beta dokümanı bunu **listelemiyor**. Retrieve yanıtında dönmesi de dokümante değil — bu yüzden callback'te `hasCardUserKey` loglanıyor; özellik çalışmıyorsa bakılacak ilk yer orası.
- `enabledCardStorage` diye bir alan YOK. "Kartımı sakla" kutusu hesap seviyesinde eklenti açık olduğu için kendiliğinden çıkar.
- Geçersiz/silinmiş anahtar müşteriyi ödeme yapamaz hale getirebileceği için checkout route, initialize başarısız olursa anahtarı null'a çekip anahtarsız bir kez daha dener.
- KVKK aydınlatma metni + gizlilik politikası (TR/EN) 21 Eyl 2026'da kart saklamayı anlatıyor. Hesap silinince yalnızca anahtar silinir; iyzico'daki kart SİLİNMEZ (iyzico kart silme API'si çağrılmıyor) — metin bunu talep yoluna bağladı.

Bkz. [[pmj-iyzico-payment-integration-2026-07]], [[pmj-akis-kisaltma-2026-08]].
