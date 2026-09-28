---
name: pmj-musteri-onboarding-2026-08
description: "Müşteri paneli yeni kullanıcıya göre yeniden düzenlendi — açılış GÖZAT, alt menüde JETON AL, profil sağ üstte"
metadata: 
  node_type: memory
  type: project
  originSessionId: 51463e1a-6a5b-4041-84d5-588cf5ec6598
  modified: 2026-08-16T15:27:58.302Z
---

16 Ağu 2026: müşteri panelinde yeni gelenler zorlandığı için gezinme değişti.
Alt menü artık KUYRUK / GÖZAT / JETON AL (profil sekmesi kaldırıldı); profil her
sayfanın sağ üstünde avatar düğmesi (`components/ui/ProfileChip.tsx`, avatar tek
sorguyla okunup sessionStorage'da tutulur). Mekan kökü, proxy yönlendirmeleri,
login sonrası hedef, çıkış ve ana sayfadaki mekan kartları artık `/queue` yerine
`/browse`'a gider — ilk iş şarkı bulmak.

**Why:** QR'dan giren kişi önce kuyruğu görüp ne yapacağını anlayamıyordu; jeton
almak profil menüsünün altında gömülüydü.

İkinci tur: JETON AL sekmesinde bakiye rozeti (sıfırken pembe, `lib/token-balance-store.ts`
— sayfalar okudukları bakiyeyi yayınlar, rozet ayrı sorgu atmaz), jeton yüklemeye
giderken şarkı niyeti saklanıp dönüşte kart kendiliğinden açılıyor
(`lib/pending-add.ts`, ekleme otomatik DEĞİL), dil düğmesi üyede başlıktan profil
sayfasına indi (misafirde başlıkta kaldı), jeton sayfası `?tab=1` ile açılınca
geri okunu gizliyor.

Üçüncü tur (16 Ağu 2026): **anlatım metni tamamen kaldırıldı.** `VibeIntroModal`
(3 adımlık modal) SİLİNDİ, `vibeIntro.*` sözlük anahtarları da gitti. Yerine
`lib/first-visit.ts` → `takeFirstVisit(venueId)`: mekana ilk girişte BrowseClient
arama ekranını kendiliğinden açıyor. localStorage anahtarı bilinçli olarak eski
`pmj-vibe-intro:` — modalı görmüş kullanıcı "yeni" sayılmasın. Ayrıca misafir bir
şarkıya dokunduğunda (`openSheet` ve `luckyPick`) giriş ekranına gitmeden önce
`savePendingAdd` çağrılıyor; girişten dönünce ekleme kartı kendiliğinden açılıyor.
Arama ekranı kutu boşken artık boş kalmıyor: `SearchView` yeni `suggestedArtists`
(12 sanatçı) + `suggestedSongs` (20 şarkı) prop'larını alıyor — bunlar BrowseClient'ın
zaten hesapladığı `artists` ve `defaultListSongs`, ikinci kez hesaplanmıyor. Sanatçı
görünümü dalı ternary'de EN BAŞA alındı, yoksa kutu boşken seçilen sanatçı açılmıyordu.
Zincir: QR → arama → şarkı → (giriş) → ekleme kartı → 0 jeton → "Jeton Yükle" →
jeton sayfası → dönüşte kart yeniden açılır.

**Why:** Yeni kullanıcıya önce yazı okutmak yerine doğrudan şarkı bulma/talep
gönderme işine sokmak, jeton adımını da bu işin doğal sonucu olarak göstermek.

**How to apply:** Yeni "varsayılan ekran" yönlendirmesi eklerken `/browse` kullan.
Misafiri `requireAccount()` ile giriş ekranına gönderen her yeni eylemde niyeti
sakla (pending-add / pending-suggestion), yoksa kullanıcı dönüşte eli boş kalıyor.
Migration yok. Jeton sayfasına render sırasında yeni searchParam okursan
`unstable_instant.samples` içine eklemek ŞART (bkz. [[next16-instant-validation]]).
İlgili: [[pmj-profil-avatar-2026-08]], [[pmj-auth-rework-2026-07]]
