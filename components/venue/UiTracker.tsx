"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startUiTracking, trackView } from "@/lib/ui-track";

// Müşteri panelinin arayüz analizi (bkz. lib/ui-track.ts). Görüntü üretmez.
export default function UiTracker({ venueSlug }: { venueSlug: string }) {
  const pathname = usePathname();

  useEffect(() => startUiTracking(venueSlug), [venueSlug]);

  useEffect(() => {
    trackView(pathname);
  }, [pathname, venueSlug]);

  return null;
}
