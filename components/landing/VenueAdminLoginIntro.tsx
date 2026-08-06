"use client";

import { useT } from "@/lib/i18n";

// Başlık ayrı client bileşeni: sözlük istemcide çözülüyor, kart Suspense içinde kalsın
export function VenueAdminLoginIntro() {
  const t = useT();

  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.venueAdminLogin.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.venueAdminLogin.heading}</h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
        {t.venueAdminLogin.desc}
      </p>
    </div>
  );
}
