---
name: pmj-dynamic-priority-cost-2026-08
description: Öncelikli istek ücreti dinamik — bekleyen her 3 normal şarkı için +1 jeton; 0044 migration ŞART
metadata: 
  node_type: memory
  type: project
  originSessionId: aeafcbb1-2258-4f98-bdd7-a45b9eabd98c
  modified: 2026-08-11T09:27:37.944Z
---

11 Ağu 2026: Öncelikli şarkı isteğinin jeton ücreti artık sabit değil.
Formül: `venues.priority_cost + floor(bekleyen_normal_şarkı / 3)`, üst sınır yok.

Sayıma yalnızca müşterinin jetonla NORMAL seçenekle eklediği bekleyen satırlar girer
(`status='queued'`, `user_id not null`, `priority=false`). Auto-fill (user_id null) ve
admin satırları sayılmaz — yoksa auto-fill kuyruğu hep 10'a tamamladığı için fiyat
kalıcı tavanda kalırdı. Kullanıcının kararı: üst sınır gereksiz, normal ücret ödeyen
kuyruk doğal olarak kısa kalıyor.

**Why:** Sıra uzadıkça öne geçmenin değeri artıyor, fiyatı sabit kalıyordu.

**How to apply:**
- `supabase/migrations/0044_dynamic_priority_cost.sql` ŞART (SQL Editor'dan, ÖNCE SQL sonra deploy).
  Yeni fonksiyon `public.priority_cost_now(venue_id)`; `request_song` bunu kullanıyor ve
  başarı yanıtına `cost` alanı eklendi.
- İstemci aynı formülü `lib/pricing.ts` (`priorityCostFor`) ile yerelde hesaplar — kaynak
  zaten elindeki `queue_entries`, ekstra sorgu yok. İki formül değişirse İKİSİ birden değişmeli.
- Yarış durumu: ekranda görülen fiyatla kesilen tutar farklı çıkarsa istemci `/api/queue`
  yanıtındaki `cost` ile iyimser düşümü düzeltir (istek reddedilmez).
- Panelde alan adı artık "Öncelikli istek (taban jeton)".

İlgili: [[pmj-token-rework-2026-07]], [[pmj-playing-cooldown-2026-08]]
