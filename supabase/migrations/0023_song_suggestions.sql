-- 0023: Şarkı önerileri (serbest metin istek).
--
-- Müşteri paneli artık YouTube araması yapmıyor (kota başvurusu sonuçlanana
-- kadar arama yalnızca mekanın kendi listesinde). Aradığını bulamayan müşteri
-- sanatçı + şarkı adını yazıp mekana öneri gönderiyor; bu satırlar da aynı
-- song_requests tablosuna düşüyor, tek fark song_id'nin boş olması.
--
-- Mekan şarkıyı YouTube playlist'ine ekleyip paneldeki "Playlist Ekle" ile
-- yeniden içe aktardığında eşleşen öneriler otomatik olarak song_id'ye
-- bağlanıp 'accepted' oluyor (bkz. lib/suggestions.ts).
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0022'den SONRA çalıştırın.

begin;

-- Öneride şarkı kaydı yok — song_id boş kalabilmeli
alter table public.song_requests alter column song_id drop not null;

alter table public.song_requests add column if not exists suggested_title text;
alter table public.song_requests add column if not exists suggested_artist text;

-- Ya gerçek bir şarkı ya da ad/sanatçı ikilisi: ikisi de boş satır olmasın
alter table public.song_requests drop constraint if exists song_requests_song_or_suggestion;
alter table public.song_requests add constraint song_requests_song_or_suggestion
  check (
    song_id is not null
    or (
      nullif(btrim(suggested_title), '') is not null
      and nullif(btrim(suggested_artist), '') is not null
    )
  );

-- Playlist içe aktarımında bekleyen öneriler taranıyor — dar kısmi indeks yeter
create index if not exists song_requests_pending_suggestions_idx
  on public.song_requests (venue_id)
  where song_id is null and status = 'pending';

commit;

-- PostgREST şema önbelleğini tazele: yeni kolonlar hemen seçilebilsin
notify pgrst, 'reload schema';
