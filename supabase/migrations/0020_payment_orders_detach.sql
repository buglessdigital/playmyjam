-- Hesap silme (KVKK) ile yasal saklama yükümlülüğünü uzlaştırır.
--
-- payment_orders.user_id şu an "on delete cascade": kullanıcı silinince ödeme
-- kayıtları da siliniyor. Ticari kayıtların saklanması VUK gereği zorunlu ve
-- KVKK md. 5/2-a "kanunda açıkça öngörülme" istisnası bunu karşılıyor. Bu yüzden
-- kayıt silinmez, yalnızca kullanıcıdan KOPARILIR: user_id null'a düşer, sipariş
-- ve tutar bilgisi muhasebe için yerinde kalır.

alter table public.payment_orders
  alter column user_id drop not null;

alter table public.payment_orders
  drop constraint if exists payment_orders_user_id_fkey;

alter table public.payment_orders
  add constraint payment_orders_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

notify pgrst, 'reload schema';
