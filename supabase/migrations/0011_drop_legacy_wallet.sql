-- Global cüzdan geçişinin temizliği: eski 3-parametreli sarmalayıcılar ve
-- boşaltılmış user_tokens tablosu kaldırılır.
-- Uygulama: 0010 uygulanıp YENİ KOD DEPLOY EDİLDİKTEN ve doğrulandıktan SONRA
-- Supabase Dashboard > SQL Editor'da çalıştırın. Erken çalıştırılırsa eski
-- deploy'daki satın alma/şarkı isteme akışları kırılır.

begin;

drop function if exists public.spend_tokens(uuid, uuid, int);
drop function if exists public.add_tokens(uuid, uuid, int);

drop table if exists public.user_tokens;

commit;
