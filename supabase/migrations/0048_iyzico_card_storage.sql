-- 0048 — iyzico Kart Saklama: kullanıcı başına saklı kart anahtarı.
--
-- iyzico'nun "Kart Saklama" ek servisi hesapta aktif (yıllık ücretli eklenti).
-- Akış şöyle: kullanıcı ödeme formunda "kartımı sakla" derse iyzico o kullanıcı
-- için bir cardUserKey üretir ve ödeme sorgusu (retrieve) yanıtında döndürür.
-- Anahtarı burada saklayıp bir sonraki ödemede initialize isteğine koyuyoruz —
-- form o kullanıcının saklı kartlarını listeliyor, müşteri yalnızca CVC giriyor.
--
-- Kart numarası/CVC hiçbir zaman bize gelmez ve burada tutulmaz; sakladığımız
-- şey iyzico'nun ürettiği, tek başına ödeme yapmaya yetmeyen (API key + secret
-- key gerektiren) bir referans. Bu yüzden PCI kapsamına girmiyoruz.

alter table public.profiles
  add column if not exists iyzico_card_user_key text;

comment on column public.profiles.iyzico_card_user_key is
  'iyzico Kart Saklama kullanıcı anahtarı (cardUserKey). Kart verisi DEĞİL, iyzico tarafındaki cüzdana referans. Yalnızca sunucu tarafı (service_role) okur/yazar; iyzico anahtarı geçersiz sayarsa checkout route null''a çeker.';

-- venues'ta (0032/0033) yaşadığımız kolon bazlı grant tuzağının tekrarı olmasın:
-- profiles üzerinde tablo bazlı değil kolon bazlı grant varsa yeni kolon
-- dışarıda kalır ve service_role yazamaz. Tablo bazlı grant zaten varsa bu
-- satır bir şeyi değiştirmez. authenticated'a bilinçli olarak grant YOK —
-- anahtarı yalnızca sunucu kullanıyor.
grant select (iyzico_card_user_key), update (iyzico_card_user_key)
  on public.profiles to service_role;
