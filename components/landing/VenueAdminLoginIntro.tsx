"use client";

import { useT } from "@/lib/i18n";

// Başlık ayrı client bileşeni: sözlük istemcide çözülüyor, kart Suspense içinde kalsın
export function VenueAdminLoginIntro() {
  const t = useT();

  return (
    <div className="text-center">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{t.venueAdminLogin.heading}</h1>
      <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#d1d5db]">
        {t.venueAdminLogin.desc}
      </p>
    </div>
  );
}
