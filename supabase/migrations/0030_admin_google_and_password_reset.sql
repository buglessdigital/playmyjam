-- 0030: Mekan admini için Google hesabı bağlama + şifre sıfırlama.
--
-- Mekan admini (venue_admins) Supabase auth kullanıcısı değil: kullanıcı adı +
-- bcrypt şifre ile giriyor. Şifresini unutan adminin elinde hiçbir kurtarma
-- yolu yoktu, super admin'e yazmak zorundaydı.
--
-- Çözüm iki parça:
--   1) Admin kendi Google hesabını panelden bağlar (OAuth ile doğrulanmış
--      e-posta) — google_sub, hesabın değişmeyen kimliğidir, e-posta değişse
--      bile aynı kalır.
--   2) Login ekranındaki "şifremi unuttum" bu adrese tek kullanımlık bir
--      bağlantı yollar; token'ın kendisi değil sha256 özeti saklanır, böylece
--      veritabanını okuyan biri geçerli bağlantı üretemez.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0029'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kolonlar yokken panel 500 döner).

begin;

alter table public.venue_admins
  add column if not exists google_email     text,
  add column if not exists google_sub       text,
  add column if not exists google_linked_at timestamptz;

-- Aynı Google hesabı iki mekanın adminine bağlanamaz: sıfırlama bağlantısı
-- hangi hesaba ait olduğu belirsiz kalmasın
create unique index if not exists venue_admins_google_sub_key
  on public.venue_admins (google_sub)
  where google_sub is not null;

create table if not exists public.admin_password_resets (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.venue_admins(id) on delete cascade,
  -- Ham token yalnızca mailde; burada sha256 hex özeti durur
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  -- Kötüye kullanım incelemesi için isteğin geldiği IP
  ip         text not null default '',
  created_at timestamptz not null default now()
);

-- Yeni istek gelince o admine ait bekleyen token'lar iptal ediliyor
create index if not exists admin_password_resets_admin_idx
  on public.admin_password_resets (admin_id, created_at desc);

-- Tablo istemciye tamamen kapalı: politika YOK, yalnızca service-role erişir
alter table public.admin_password_resets enable row level security;

commit;

-- PostgREST şema önbelleğini tazele: yeni kolon ve tablo hemen sorgulanabilsin
notify pgrst, 'reload schema';
