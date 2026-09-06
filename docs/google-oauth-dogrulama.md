# Google OAuth Doğrulama Başvurusu — PlayMyJam (play-my-jam-502210)

Kapsam: `https://www.googleapis.com/auth/youtube.readonly` (sensitive scope)
Amaç: "Google bu uygulamayı doğrulamadı" uyarı ekranını kaldırmak ve 100 kullanıcı tavanından çıkmak.

## Sıra

1. **Branding doğrulaması** (Google Auth Platform → Branding). Kapsam incelemesi bu geçmeden başlamaz.
   - App name: `PlayMyJam` (ana sayfa h1/footer ile birebir aynı olmalı)
   - Home page: `https://playmyjam.com.tr/hakkimizda` (Google verisi kullanımını açıklıyor)
   - Privacy policy: `https://playmyjam.com.tr/privacy`
   - Terms: `https://playmyjam.com.tr/terms`
   - Authorized domains: yalnızca `playmyjam.com.tr` kalmalı — `*.supabase.co` **silinecek**
     (OAuth artık `auth.playmyjam.com.tr` üzerinden gidiyor; kodda ham supabase adresi yok).
   - Otomatik kontrol yine düşerse "I believe the issues found are incorrect" ile insan incelemesi.
2. **Kapsam gerekçesi** (aşağıdaki metin) Verification Center'a yapıştırılır.
3. **Demo videosu** (unlisted YouTube) — senaryo aşağıda.
4. **Submit** → sensitive kapsamda tipik 2-6 hafta. Yazışma `info@playmyjam.com.tr`'ye gelir;
   cevapsız kalan e-posta başvuruyu düşürür.

## Kapsam gerekçesi (Verification Center'a yapıştırılacak İngilizce metin)

> PlayMyJam is a jukebox platform for venues (bars, cafés, restaurants). A venue's staff signs in
> to the venue dashboard and manages the music that plays on the venue's screen through the
> embedded YouTube player.
>
> We request `https://www.googleapis.com/auth/youtube.readonly` for a single, user-initiated
> feature: importing the venue's **own** YouTube playlists into the venue's PlayMyJam catalog.
> After the venue owner clicks "Choose from my YouTube playlists", we call
> `playlists.list?mine=true` to show the list of their playlists, then `playlistItems.list` for
> the playlists they explicitly select, and copy the resulting video IDs, titles and channel names
> into the venue's catalog so those songs can be queued and played.
>
> We make **no write calls of any kind**: no uploads, no playlist creation, editing or deletion,
> no ratings, no comments, no subscriptions. The scope is used strictly read-only.
>
> No narrower scope exists. `youtube.readonly` is the only scope that returns a user's own
> playlists, including their private ones; `youtubepartner` and `youtube` are broader and grant
> write access we do not need. The public YouTube Data API with an API key cannot list a specific
> user's playlists.
>
> The OAuth access token is never stored in our database. It is held only in an httpOnly cookie in
> the administrator's browser for the lifetime of the token (~1 hour) and is discarded afterwards;
> we do not request or store refresh tokens. The only data we persist is the public metadata of the
> videos the user chose to import.
>
> Granting the scope is optional. Sign-in itself only uses email/profile; a venue that declines can
> still use every dashboard feature and import playlists by pasting public playlist links.
>
> Our use of information received from Google APIs adheres to the Google API Services User Data
> Policy, including the Limited Use requirements. This is documented at
> https://playmyjam.com.tr/privacy (section 5) and https://playmyjam.com.tr/hakkimizda

## Demo videosu senaryosu (unlisted YouTube)

1. Tarayıcı adres çubuğu görünür halde `https://playmyjam.com.tr` — ana sayfada "PlayMyJam" markası.
2. `https://playmyjam.com.tr/hakkimizda` ve `/privacy` sayfalarını göster (Google verisi bölümü).
3. Mekan paneline giriş: `https://playmyjam.com.tr/admin/{slug}/login`.
4. İçe aktarma kutusunu aç → "YouTube hesabımdaki listelerden seç".
5. **Google onay ekranını yavaşça göster**: uygulama adı, istenen izin metni okunacak kadar net,
   adres çubuğunda `accounts.google.com` görünür olmalı. "İzin ver".
6. Dönüşte listeler ekranı → bir liste seç → "Aktar" → şarkıların katalog kuyruğuna eklenişi.
7. Kapanışta: YouTube hesabında hiçbir değişiklik olmadığını (liste sayısı aynı) göster.
