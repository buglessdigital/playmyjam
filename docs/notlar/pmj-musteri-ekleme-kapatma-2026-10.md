---
name: pmj-musteri-ekleme-kapatma-2026-10
description: Mekan panelinden müşteri eklemelerini kapatma (kapanışa yakın); now_playing.customer_adds_paused_at, 12 saatte kendiliğinden açılır; 0072 ŞART
metadata:
  type: project
---

5 Eki 2026: mekan kapanmaya yakın müşterilerin sıraya şarkı eklemesini durdurabiliyor.
Panel ana ekranında "Sırada" bölmesinin başlığındaki anahtar.

- Veri: `now_playing.customer_adds_paused_at` (0072). Bayrak değil zaman damgası —
  **12 saat sonra kendiliğinden düşer** (`lib/customer-adds.ts`), açmayı unutan mekan
  ertesi gece satış kaçırmasın. venues'a konmadı: kolon bazlı grant tuzağı + müşteri
  kancaları zaten now_playing'i okuyor.
- Yazma: `/api/player/[venueId]` `action: "customer_adds"`, `paused: boolean` (ses/crossfade
  ile aynı yol, claim aranmaz). Olay günlüğüne `customer_adds_paused/resumed`.
- Kapı sunucuda iki yerde: `/api/queue` (409 `adds_paused`, oynatıcı kapalı kontrolünden
  sonra) ve `/api/venue/[slug]/request` (talep de alınmaz). Otomatik doldurma ve panelden
  ekleme etkilenmez; sıradakiler çalar.
- Canlı: 0072 `now_playing_live_notify`'ı yeniden tanımlar — damga değişimi `np` sayılır ve
  mesajda `customer_adds_paused_at` taşınır. İstemci kancası `lib/use-customer-adds.ts`.
- Müşteri UI: oynatıcı-kapalı kilidinin geçtiği her yer `addsLocked = playerOffline || addsPaused`;
  süreler/ilerleme yalnız `playerOffline`'a bakar. `PlayerOfflineNotice reason="paused"`,
  aksiyon durumu `kind: "paused"`, sözlük bölümü `addsPaused` (EN elle yazıldı).

**Why:** Kapanışa kadar çalınamayacak şarkıya jeton harcanıyordu.
**How to apply:** 0072 koddan önce uygulanmalı ama tersi de güvenli: kolon yoksa
`/api/queue` eski select'e düşer, müşteri kancası `false` döner, panel anahtarı hiç
çizilmez. Yeni bir müşteri ekleme yolu açılırsa hem UI kilidine hem iki sunucu kapısına bak.

İlgili: [[pmj-player-offline-gate-2026-08]], [[pmj-canli-yayin-2026-09]], [[pmj-i18n-2026-08]]
