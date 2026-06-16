-- Şemada önceden var olan gevşek RLS politikalarını kaldırır.
-- Uygulama: Supabase Dashboard > SQL Editor (0001 ve 0002'den sonra).
--
-- Neden: RLS'te birden çok permissive policy OR'lanır — en gevşek olan kazanır.
-- Bu eski politikalar, authenticated kullanıcının tarayıcıdan doğrudan:
--   * kendi user_tokens.balance değerini güncellemesine (bedava jeton),
--   * jeton harcamadan queue'ya satır eklemesine,
--   * validasyondan geçmeden song_requests eklemesine
-- izin veriyordu. Tüm bu yazmalar yalnızca service-role API rotalarından yapılmalı.

-- user_tokens: kullanıcı bakiyesini doğrudan değiştiremesin
drop policy if exists "Own tokens update" on public.user_tokens;
drop policy if exists "Own tokens insert" on public.user_tokens;
-- okuma duplicate'i (public rol) — yerine user_tokens_own_read (authenticated) var
drop policy if exists "Own tokens read" on public.user_tokens;

-- queue: doğrudan insert kapatılır (yalnız /api/queue + spend_tokens)
drop policy if exists "Auth insert queue" on public.queue;
drop policy if exists "Public read queue" on public.queue; -- duplicate of queue_public_read

-- song_requests: doğrudan insert kapatılır (yalnız /api/venue/[id]/request)
drop policy if exists "Auth insert requests" on public.song_requests;
drop policy if exists "Own requests read" on public.song_requests; -- duplicate; song_requests_public_read yeterli

-- Kalan duplicate okuma politikalarını temizle (davranış değişmez, net son durum)
drop policy if exists "Public read now_playing" on public.now_playing;
drop policy if exists "Public read songs" on public.songs;
drop policy if exists "Public read venue_songs" on public.venue_songs;
drop policy if exists "Public read token_packages" on public.token_packages;
drop policy if exists "Public read venues" on public.venues;
drop policy if exists "Own profile read" on public.profiles;   -- profiles_own_select ile aynı
drop policy if exists "Own profile update" on public.profiles; -- profiles_own_update ile aynı
drop policy if exists "Own favorites" on public.user_favorites; -- own_select/insert/delete ile kapsanır
