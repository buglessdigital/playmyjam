---
name: pmj-hover-gorunmez-dugme-2026-08
description: "Tailwind 4'te hover varyantları @media(hover:hover) ile sarılı — panelde opacity-0 kaplama düğmeler dokunmatikte görünmez ama tıklanabilir kalıyordu"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8e8f06b6-209c-44c7-9378-710a5e3072fc
  modified: 2026-08-16T13:18:05.581Z
---

16 Ağu 2026'da bir mekanda admin "şarkıyı değiştireyim" derken kapağa dokunup
yanlışlıkla şarkı başlattı. Sebep: Tailwind 4 `hover:`/`group-hover:` kurallarını
`@media (hover:hover)` içine koyuyor (derlenmiş CSS'te doğrulandı). Fare olmayan
cihazda (mekandaki tablet/telefon) `opacity-0 group-hover:opacity-100` kaplama
düğme SONSUZA DEK görünmez kalır — ama opacity tıklamayı engellemez, yani
görünmez bir tuzak olur.

**Why:** Panelin "kapak üstünde beliren çal düğmesi" deseni üç yerde vardı:
LibraryPane, QueuePane, PlaylistRail. İlk ikisinde `md:` gatelemesi vardı ama
tablet zaten ≥768 px; PlaylistRail'de gate bile yoktu.

**How to apply:** Kapağı kaplayan/side-effect'li düğmelerde gizleme yalnızca
`[@media(hover:hover)]:opacity-0` ile yapılır, taban `opacity-100` kalır.
Ayrıca kilitli düğmeyi `hidden` yapıp sebebi `title`'a yazma: dokunmatikte
sebep hiç görünmez, admin boşluğa basıp durur — sebep ekrana yazılmalı.
İlgili: [[pmj-admin-home-merge-2026-08]], [[pmj-mini-player-2026-08]]
