-- 0052: Mekan sayfası ("hub") — QR plaketinin ARKA yüzündeki kare.
--
-- Plaketin ön yüzü doğrudan PlayMyJam'e gider (şarkı isteme akışı hiç değişmez).
-- Arka yüzdeki kare ise mekanın kendi dijital başlıklarına açılır: menü,
-- Instagram, Google yorum, Wi-Fi şifresi, konum, telefon…
--
-- Hizmet İNSİYATİFE bağlı: super admin mekanla anlaşırken açar (venues.hub_enabled).
-- Kapalıysa arka yüz QR'ı hiç basılmaz, sayfa da 404 döner.
--
-- venues.hub_code : plakete basılan DEĞİŞMEZ kod. Adres /m/<kod>. Slug sonradan
--                   değişse bile basılı plaket bozulmasın diye ayrı tutulur.
-- venue_hub_links : mekanın panelden açtığı satırlar (tür + etiket + değer).
-- venue_hub_views / venue_hub_link_clicks : günlük sayaçlar. Kişi değil, yalnızca
--                   toplam tutulur — KVKK açısından kimliklendirilebilir veri yok.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0051'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kolon yokken panel 500 döner).

begin;

-- 1) Mekan üzerindeki anahtar ve değişmez kod
alter table public.venues add column if not exists hub_enabled boolean not null default false;
alter table public.venues add column if not exists hub_code text;
-- Mekan sayfasının üstünde adın altında görünen tek satır (boşsa tagline kullanılır)
alter table public.venues add column if not exists hub_headline text not null default '';

create unique index if not exists venues_hub_code_uidx on public.venues (hub_code)
  where hub_code is not null;

-- Karışması kolay harfler (0/O, 1/I/l) dışarıda: kod telefonla elle de yazılabilsin
create or replace function public.generate_hub_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.venues where hub_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Mevcut mekanlara kod ver: hizmet kapalı olsa da kod hazır dursun, açıldığı gün
-- plaket basılabilsin
update public.venues set hub_code = public.generate_hub_code() where hub_code is null;

-- 2) Mekan sayfasındaki satırlar
create table if not exists public.venue_hub_links (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  kind       text not null
               check (kind in ('menu', 'instagram', 'google_review', 'wifi', 'location',
                               'phone', 'whatsapp', 'website', 'reservation', 'custom')),
  -- Satırın başlığı. Boşsa arayüz türün varsayılan adını yazar ("Menü", "Instagram"…).
  -- wifi satırında ağ adı (SSID) burada durur.
  label      text not null default '',
  -- Adres; wifi satırında şifre, phone/whatsapp satırında numara
  value      text not null default '',
  -- Satırın altındaki küçük açıklama (isteğe bağlı)
  note       text not null default '',
  enabled    boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_hub_links_venue_idx
  on public.venue_hub_links (venue_id, position, created_at);

-- Aynı türden birden çok satır yalnızca 'custom' için anlamlı
create unique index if not exists venue_hub_links_kind_uidx
  on public.venue_hub_links (venue_id, kind)
  where kind <> 'custom';

-- 3) Günlük sayaçlar
create table if not exists public.venue_hub_views (
  venue_id uuid not null references public.venues (id) on delete cascade,
  day      date not null,
  count    int  not null default 0,
  primary key (venue_id, day)
);

create table if not exists public.venue_hub_link_clicks (
  link_id  uuid not null references public.venue_hub_links (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  day      date not null,
  count    int  not null default 0,
  primary key (link_id, day)
);

create index if not exists venue_hub_link_clicks_venue_idx
  on public.venue_hub_link_clicks (venue_id, day);

-- Sayaçlar yalnızca service-role route handler'larından artırılır (/api/hub/track).
-- Tarih İstanbul saatiyle: mekan gecesi gün ortasında ikiye bölünmesin.
create or replace function public.hub_track(p_venue uuid, p_link uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if p_link is null then
    insert into public.venue_hub_views (venue_id, day, count)
    values (p_venue, d, 1)
    on conflict (venue_id, day) do update set count = venue_hub_views.count + 1;
  else
    insert into public.venue_hub_link_clicks (link_id, venue_id, day, count)
    select p_link, l.venue_id, d, 1
      from public.venue_hub_links l
     where l.id = p_link and l.venue_id = p_venue
    on conflict (link_id, day) do update set count = venue_hub_link_clicks.count + 1;
  end if;
end;
$$;

revoke execute on function public.hub_track(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.generate_hub_code() from public, anon, authenticated;

-- 4) Tablolar istemciye kapalı: mekan sayfası da panel de service-role route
-- handler'larından okunuyor, tarayıcı bu tablolara hiç dokunmuyor.
alter table public.venue_hub_links       enable row level security;
alter table public.venue_hub_views       enable row level security;
alter table public.venue_hub_link_clicks enable row level security;

-- venues'ta kolon bazlı grant var (bkz. 0002 / 0032): yeni kolonlar oraya
-- BİLEREK eklenmiyor. hub_enabled ve hub_code müşteriye açılan anon rolüne
-- gerekmez; mekan sayfası sunucuda service-role ile okunur.

commit;
