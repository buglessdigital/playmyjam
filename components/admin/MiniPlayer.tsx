"use client";

import { useEffect, useState } from "react";
import YouTubePlayer from "@/components/player/YouTubePlayer";
import { useVenueDbId } from "@/lib/venue-db-id";
import { MINI_CORNER_WIDTH, useMiniSlot } from "@/lib/mini-player-store";

/**
 * Panelin oynatıcısı — HEP AÇIK.
 *
 * Eskiden müzik ayrı bir sekmede (/admin/[venueId]/player) çalıyordu; mekan o
 * sekmeyi kapatınca ya da bulamayınca müzik susuyordu. Sonra panele aç/kapa
 * düğmesi konuldu, o da gereksiz bir adımdı: panel açıksa oynatıcı da açık
 * olmalı. Tek gereken, tarayıcı politikası yüzünden ilk açılışta bir kez ALT
 * BARDAKI OYNAT düğmesine dokunmak: oynatıcının üstünde ayrı bir "Başlat"
 * düğmesi yok, dokunuşu oradan alıyor (bkz. mini-player-store → setPlayerStarter).
 *
 * Oynatıcı panel KABUĞUNA bağlı (bkz. AdminPanelShell), sayfaya değil —
 * Ayarlar/İstatistik/Talepler arasında gezinmek onu unmount etmez, müzik
 * kesilmez. Ekranda ise kuyruk panosundaki "ŞU AN ÇALIYOR" kartının içinde,
 * albüm kapağının yerinde görünür: orada bir YUVA (bkz. MiniPlayerSlot) yer
 * ayırır, video da o dikdörtgene sabitlenir. Böylece hiçbir yazının üstüne
 * binmez ve iframe DOM'da hiç taşınmadığı için sayfa değiştirmek şarkıyı baştan
 * yükletmez. Yuva olmayan sayfalarda sağ alt köşeye düşer.
 */

/** Ölçülen yuva + dikdörtgeni; yuva değişince eski ölçüm geçersiz sayılır. */
type Rect = { el: HTMLElement; left: number; top: number; width: number };

/** Yuva yokken (Ayarlar/İstatistik) köşede duracağı boşluk. */
const CORNER = 12;

export default function MiniPlayer({ venueId }: { venueId: string }) {
  const venueDbId = useVenueDbId(venueId);
  const slot = useMiniSlot();
  const [rect, setRect] = useState<Rect | null>(null);

  // Yuvanın yeri sayfa düzeni değiştikçe kayar (pano genişliği, uyarı şeridi,
  // pencere boyutu). Ölçüm ucuz olduğu için hem gözlemcilerle hem de düşük
  // frekanslı bir turla tazelenir: kaçan bir yerleşim değişikliği en geç yarım
  // saniyede yakalanır, video kutunun dışında kalmaz.
  useEffect(() => {
    if (!slot) return;
    let last = "";
    const measure = () => {
      const r = slot.getBoundingClientRect();
      // Dar ekranda panolar sırayla gösteriliyor: kuyruk panosu gizliyken yuva
      // sıfır boyutlu ölçülür. Oraya kenetlenirsek video görünmez olur (ve
      // gizli iframe'de tarayıcı oynatmayı kısar) — köşeye düşülür.
      const key = r.width < 8 ? "none" : `${r.left}|${r.top}|${r.width}`;
      if (key === last) return;
      last = key;
      setRect(key === "none" ? null : { el: slot, left: r.left, top: r.top, width: r.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(document.documentElement);
    const timer = setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [slot]);

  // Yuvasız sayfaya geçilmiş olabilir: ölçüm YALNIZCA hâlâ ekranda olan yuvaya
  // aitse kenetlenilir, yoksa köşeye düşülür.
  const docked = !!slot && rect?.el === slot;

  return (
    <div
      className="fixed z-40"
      style={
        docked
          ? { left: rect.left, top: rect.top, width: rect.width }
          : { right: CORNER, bottom: CORNER, width: MINI_CORNER_WIDTH }
      }
    >
      {venueDbId ? (
        <YouTubePlayer venueDbId={venueDbId} loginHref={`/admin/${venueId}/login`} compact />
      ) : (
        <div className="aspect-video w-full animate-pulse rounded-lg bg-white/5" />
      )}
    </div>
  );
}
