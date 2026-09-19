-- 0051: Mekan sözleşme belgeleri — super admin yazar, mekan admini panelden onaylar.
--
-- Akış: draft (yalnızca super admin görür) → pending (mekana gönderildi; onaylanana
-- kadar mekan paneli kilitli) → accepted. Super admin gönderilmiş ya da onaylanmış
-- belgeyi geri çekebilir (withdrawn); geri çekilen belge kilidi kaldırır.
--
-- Onay kanıtı: onaylayan admin, kullanıcı adı, IP, tarayıcı ve onaylanan metnin
-- SHA-256 özeti saklanır. Onaylanmış belgenin başlığı/metni değiştirilemez
-- (tetikleyici) — değişiklik gerekiyorsa yeni belge gönderilir.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0050'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. Tablo yokken mekan paneli kilitlenmez
-- (kontrol fail-open), yalnızca yeni ekranlar hata verir.

begin;

create table if not exists public.venue_documents (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues (id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 200),
  body                text not null check (char_length(body) between 1 and 100000),
  status              text not null default 'draft'
                        check (status in ('draft', 'pending', 'accepted', 'withdrawn')),
  sent_at             timestamptz,
  accepted_at         timestamptz,
  accepted_admin_id   uuid references public.venue_admins (id) on delete set null,
  accepted_username   text,
  accepted_ip         text,
  accepted_user_agent text,
  accepted_sha256     text,
  withdrawn_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Panel kapısı her istekte "bu mekanın bekleyen belgesi var mı" diye sorar
create index if not exists venue_documents_pending_idx
  on public.venue_documents (venue_id) where status = 'pending';
create index if not exists venue_documents_venue_idx
  on public.venue_documents (venue_id, created_at desc);

-- Onaylanmış metin değişmez; onay kaydı da sonradan düzenlenemez.
-- (accepted_admin_id bilerek hariç: admin silinince FK onu null'a çeker.)
create or replace function public.venue_documents_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'accepted' or (old.status = 'withdrawn' and old.accepted_at is not null) then
    if new.title is distinct from old.title or new.body is distinct from old.body
       or new.accepted_at is distinct from old.accepted_at
       or new.accepted_sha256 is distinct from old.accepted_sha256
       or new.accepted_username is distinct from old.accepted_username then
      raise exception 'Onaylanmış sözleşme değiştirilemez';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists venue_documents_guard on public.venue_documents;
create trigger venue_documents_guard
  before update on public.venue_documents
  for each row execute function public.venue_documents_guard();

-- Tablo istemciye kapalı: politika YOK, erişim route handler'lardan (service-role)
alter table public.venue_documents enable row level security;

commit;
