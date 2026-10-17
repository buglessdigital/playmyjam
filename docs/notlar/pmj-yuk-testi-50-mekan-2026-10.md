---
name: pmj-yuk-testi-50-mekan-2026-10
description: 17 Eki 2026 50 mekan uçtan uca yük testi (npm run load:fleet) — yazılım temiz, darboğaz Supabase Free Realtime tavanı (200 bağlantı / 100 mesaj/sn)
metadata:
  type: project
---

17 Eki 2026, mekanlara dağıtım öncesi `npm run load:fleet` (scripts/load-fleet.ts) staging'de.
Diğer yük testlerinden farkı: player ve müşteri istekleri GERÇEK rotalardan geçiyor
(/api/player, /api/queue — oturum çerezi, player-açık kapısı, request_song jeton/cooldown,
after() içindeki fillQueue/playNext). Site e2e gibi staging'e bağlı yerelde (:3100) açılıyor.

**Tur 1 — 50 mekan × (player+panel + 2 telefon, 1'i ekler), 10 dk:** 550/550 geçiş başarılı
(busy 0), bitiş→yeni şarkı p95 1,2 sn, heartbeat p95 257 ms, ekleme p95 338 ms, eklenen şarkı
diğer telefonda p95 347 ms, başka mekana ekleme 50/50 → 403. Kaybolan ekleme 0/635, jeton
tutarsızlığı 0/50, sıra ihlali 0, çift playing 0. Supabase ~77 istek/sn, 5xx yok, Postgres hatası yok.
**Realtime mesaj ort. 94/sn, tepe 113/sn** (Free tavanı 100).

**Tur 2 — 50 mekan × 4 telefon (255 bağlantı), 5 dk:** Free bağlantı tavanı aşıldı —
`ConnectionRateLimitReached: Too many connected users`; kanala giremeyen player'lar yayını REST'e
düşürdü (1047 kez). Uygulama yine doğru çalıştı (kayıp 0, jeton 0, sıra ihlali 0); mesaj ort. 103/sn, tepe 126/sn.
Turda görülen "2+ playing" yük testinin kendi hatasıydı (ağ kopmasında yeniden denenen tohumlama), düzeltildi.

**Sonuç:** 50 mekanda yazılım darboğaz değil; engel plan. Free'de 50 player 200 bağlantının 50'sini
yer, telefona 150 kalır (mekan başına 3). Mesaj hızı 2 telefonla bile tavanda. 50 mekandan ÖNCE
Supabase Pro (500 bağlantı / 500 mesaj/sn) şart; mekan başına ~9+ eşzamanlı telefon beklenirse
Pro'da harcama tavanı kapatılmalı (10k bağlantı). Mesajın yarısından fazlası player-bus'ın 1 sn'lik
durum yayını (çoğu mekanda dinleyen yok) — kota sıkışırsa ilk kısılacak yer STATE_BEAT_MS ya da
"dinleyen varsa yayınla" ([[pmj-olcek-esikleri-2026-09]]).

**Tuzaklar:** staging'de giriş ~30 istek/5 dk ile sınırlı → test kullanıcı oturumlarını
node_modules/.cache/pmj-load-fleet-sessions.json'da saklar (ilk koşu bekler). Bu Mac'in ağı
Cloudflare'e (Supabase) ara ara erişemiyor: "fetch failed"/20 sn zaman aşımı görülürse önce
`curl https://1.1.1.1` ile bak, sistem hatası sanma. Ölçülmeyen: Vercel fonksiyon katmanı (sunucu yerel),
gerçek YouTube çalma, uyuyan telefonların yeniden bağlanması.
