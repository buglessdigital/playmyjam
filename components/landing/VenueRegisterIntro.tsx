"use client";

import Link from "next/link";
import { COMPANY } from "@/lib/company-info";
import { useT } from "@/lib/i18n";

// /mekan-kayit sayfasının sol sütunu: ne olacağını önceden söyler, formun
// doldurulmaya değip değmeyeceğine karar vermeyi kolaylaştırır.
export default function VenueRegisterIntro() {
  const t = useT();
  const next = [t.venueRegister.next1, t.venueRegister.next2, t.venueRegister.next3];

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-5xl">
        {t.venueRegister.title}
      </h1>
      <p className="mt-5 max-w-md text-lg leading-relaxed text-[#d1d5db]">{t.venueRegister.desc}</p>

      <h2 className="font-tag mt-10 text-xs uppercase tracking-[0.18em] text-[#ff8fd0]">
        {t.venueRegister.nextHeading}
      </h2>
      <ol className="mt-4 border-t border-white/15">
        {next.map((line, i) => (
          <li key={line} className="flex gap-4 border-b border-white/15 py-4 text-base leading-relaxed text-[#d1d5db]">
            <span className="font-tag text-sm text-[#ff8fd0]">{i + 1}</span>
            {line}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-2 text-base text-[#9ca3af]">
        <p>{t.venueRegister.directContact}</p>
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-[#ff2d9c]">
            {COMPANY.phone}
          </a>
          <a href={`mailto:${COMPANY.email}`} className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-[#ff2d9c]">
            {COMPANY.email}
          </a>
        </p>
      </div>

      <p className="mt-8 text-base text-[#9ca3af]">
        {t.venueRegister.loginPrefix}{" "}
        <Link href="/mekan-girisi" className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-[#ff2d9c]">
          {t.venueRegister.loginLink}
        </Link>
      </p>
    </div>
  );
}
