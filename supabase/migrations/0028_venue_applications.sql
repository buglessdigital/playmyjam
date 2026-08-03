-- 0028: Mekan başvuruları — ana sayfadaki "mekanını kaydet" formunun kayıtları.
--
-- Vitrin sayfasındaki form buraya yazar, super admin panelindeki "Mekan Talepleri"
-- ekranı buradan okur. Mekan hesabı (venues + venue_admins) hâlâ elle açılır;
-- bu tablo yalnızca talep kuyruğudur, onaylanan başvuru "Yeni Mekan" ekranına
-- taşınır ve başvuru satırı 'approved' işaretlenir.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0027'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (tablo yokken form 500 döner).

begin;

create table if not exists public.venue_applications (
  id           uuid primary key default gen_random_uuid(),
  venue_name   text not null,
  contact_name text not null,
  phone        text not null,
  email        text not null,
  city         text not null default '',
  venue_type   text not null default '',
  message      text not null default '',
  -- Panelde super admin'in kendine düştüğü not; başvurana gösterilmez
  notes        text not null default '',
  status       text not null default 'new'
                 check (status in ('new', 'contacted', 'approved', 'rejected')),
  -- Spam incelemesi için: form gönderildiği andaki IP ve tarayıcı imzası
  ip           text not null default '',
  user_agent   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Panel listesi "önce bekleyenler, sonra yeniden eskiye" sıralar
create index if not exists venue_applications_status_idx
  on public.venue_applications (status, created_at desc);

-- Tablo istemciye tamamen kapalı: politika YOK.
-- Form gönderimi de listeleme de sunucudaki route handler'lardan
-- (service-role) geçer; anon anahtarla ne okuma ne yazma mümkün.
alter table public.venue_applications enable row level security;

commit;

-- PostgREST şema önbelleğini tazele: yeni tablo hemen sorgulanabilsin
notify pgrst, 'reload schema';
