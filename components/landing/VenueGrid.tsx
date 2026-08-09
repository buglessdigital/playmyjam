"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { VenueListItem } from "@/lib/venue-cache";
import VenueLogo from "@/components/VenueLogo";
import { fmt, useT } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Logosu olmayan mekanlar için baş harf avatarı: mekan adından deterministik gradient
const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #e91e8c, #8b5cf6)",
  "linear-gradient(140deg, #8b5cf6, #3b82f6)",
  "linear-gradient(140deg, #f59e0b, #e91e8c)",
  "linear-gradient(140deg, #3b82f6, #22c55e)",
  "linear-gradient(140deg, #ff2d9c, #f59e0b)",
];

function venueGradient(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

// Arama eşleşmesi aksan/İ-ı farkına takılmasın: "Mezzanıne" da "mezzanine"i bulsun.
function foldForSearch(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .trim();
}

const SEARCH_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Mekan adı ve tagline'ı DB'den gelen dinamik içerik — çevrilmez, olduğu gibi gösterilir.
export default function VenueGrid({ venues }: { venues: VenueListItem[] }) {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = foldForSearch(query);
    if (!q) return venues;
    return venues.filter(
      (v) => foldForSearch(v.name).includes(q) || foldForSearch(v.tagline ?? "").includes(q)
    );
  }, [venues, query]);

  // Liste bomboşken arama kutusu anlamsız; yalnızca boş durum + "yakında" mesajı.
  if (venues.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <div
          className="rounded-2xl border border-white/[0.08] px-6 py-12 text-center"
          style={{ background: "#160d24" }}
        >
          <p className="text-sm font-bold text-white">{t.venuesPage.emptyTitle}</p>
          <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
            {t.venuesPage.emptyDescPrefix}{" "}
            <Link href="/#iletisim" className="text-[#e91e8c] underline">
              {t.venuesPage.emptyDescLink}
            </Link>
            .
          </p>
        </div>
        <MoreVenuesSoon />
      </div>
    );
  }

  return (
    <div>
      <VenueSearchBar
        value={query}
        onChange={setQuery}
        count={filtered.length}
        total={venues.length}
      />

      {filtered.length === 0 ? (
        <div
          className="mx-auto mt-8 max-w-md rounded-2xl border border-white/[0.08] px-6 py-10 text-center"
          style={{ background: "#160d24" }}
        >
          <p className="text-sm font-bold text-white">
            {fmt(t.venuesPage.noMatchTitle, { query: query.trim() })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">{t.venuesPage.noMatchDesc}</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t.venuesPage.searchClear}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VenueCard key={v.slug} venue={v} />
          ))}
        </div>
      )}

      <MoreVenuesSoon />
    </div>
  );
}

function VenueCard({ venue: v }: { venue: VenueListItem }) {
  const t = useT();

  return (
    <div
      className="flex flex-col rounded-2xl border border-white/[0.07] p-5 transition-colors hover:border-[#e91e8c]/35"
      style={{ background: "#160d24" }}
    >
      <div className="flex items-center gap-4">
        <VenueLogo
          name={v.name}
          logoUrl={v.logo_url}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-white"
          style={{ boxShadow: "0 8px 20px -8px rgba(233,30,140,0.4)" }}
          fallbackStyle={{ background: venueGradient(v.name) }}
        />
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold text-white">{v.name}</h2>
          <p className="mt-0.5 truncate text-xs text-[#9ca3af]">
            {v.tagline?.trim() || t.venuesPage.defaultTagline}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Link
          href={`/venue/${v.slug}`}
          className="flex-1 rounded-xl py-2.5 text-center text-sm font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: PINK_GRADIENT, boxShadow: "0 8px 22px -8px rgba(233,30,140,0.55)" }}
        >
          {t.venuesPage.open}
        </Link>
        <Link
          href={`/venue/${v.slug}/queue`}
          className="rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-[#9ca3af] transition-colors hover:bg-white/10 hover:text-white"
          aria-label={fmt(t.venuesPage.liveQueueAria, { venue: v.name })}
        >
          {t.venuesPage.queue}
        </Link>
      </div>
    </div>
  );
}

// Arama kutusu: liste küçükken de yer tutması bilinçli — mekan sayısı arttıkça
// aynı yerde kalsın, kullanıcı aramayı aramak zorunda kalmasın.
function VenueSearchBar({
  value,
  onChange,
  count,
  total,
}: {
  value: string;
  onChange: (next: string) => void;
  count: number;
  total: number;
}) {
  const t = useT();
  const inputId = useId();
  const searching = value.trim().length > 0;

  return (
    <div className="mx-auto max-w-xl">
      <label htmlFor={inputId} className="sr-only">
        {t.venuesPage.searchLabel}
      </label>
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3 focus-within:border-[#e91e8c]/45"
        style={{ background: "#160d24" }}
      >
        <span className="text-[#9ca3af]">{SEARCH_ICON}</span>
        <input
          id={inputId}
          type="search"
          inputMode="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.venuesPage.searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#6b7280]"
        />
        {searching && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#9ca3af] transition-colors hover:text-white"
          >
            {t.venuesPage.searchClear}
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-[#6b7280]" aria-live="polite">
        {searching
          ? fmt(t.venuesPage.searchResultCount, { count, total })
          : fmt(t.venuesPage.venueCount, { count: total })}
      </p>
    </div>
  );
}

// "Liste kısa" algısını kırar: mekan sayısı büyüyor mesajı listeyle aynı ekranda dursun.
function MoreVenuesSoon() {
  const t = useT();

  return (
    <div
      className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#e91e8c]/30 px-6 py-7 text-center"
      style={{ background: "rgba(233,30,140,0.05)" }}
    >
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">
        {t.venuesPage.soonBadge}
      </span>
      <p className="text-sm font-extrabold text-white sm:text-base">{t.venuesPage.soonTitle}</p>
      <p className="max-w-md text-xs leading-relaxed text-[#9ca3af]">{t.venuesPage.soonDesc}</p>
    </div>
  );
}

export function VenuesPageIntro() {
  const t = useT();

  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e91e8c]">{t.footer.venues}</p>
      <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">{t.venuesPage.heading}</h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
        {t.venuesPage.desc}
      </p>
    </div>
  );
}

export function VenuesPageOutro() {
  const t = useT();

  return (
    <p className="mt-10 text-center text-xs text-[#6b7280]">
      {t.venuesPage.ctaPrefix}{" "}
      <Link href="/#iletisim" className="text-[#e91e8c] underline hover:text-[#ff2d9c]">
        {t.venuesPage.ctaLink}
      </Link>
    </p>
  );
}
