"use client";

import { useEffect, useId, useRef, useState } from "react";
import { VENUE_TYPES } from "@/lib/validate";
import { useT, type Dictionary } from "@/lib/i18n";

// 16px yazı: iOS Safari daha küçük yazılı alana odaklanınca sayfayı yakınlaştırıyor.
// Kenarlık %30 beyaz: koyu zeminde alan sınırı WCAG 3:1 kontrastını geçsin.
const FIELD_CLASS =
  "min-h-12 w-full rounded-xl border border-white/30 bg-white/[0.04] px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-[#8b8f99] hover:border-white/50 focus-visible:border-[#ff2d9c] focus-visible:ring-2 focus-visible:ring-[#ff2d9c]/50";

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  const t = useT();
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-[#e5e7eb]">
      {label}
      {required && (
        <>
          <span aria-hidden className="ml-1 text-[#ff8fd0]">*</span>
          <span className="sr-only"> {t.venueForm.requiredSr}</span>
        </>
      )}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} required={required} />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={120}
        className={FIELD_CLASS}
      />
    </div>
  );
}

// Mekan kayıt formu (/mekan-kayit). Gönderim /api/venue-applications'a düşer,
// super admin panelindeki "Mekan Talepleri" ekranında listelenir.
// Seçenek değerleri sunucuda VENUE_TYPES'a karşı doğrulanıyor — etiket çevrilir, değer Türkçe kalır.
const VENUE_TYPE_KEYS: Record<(typeof VENUE_TYPES)[number], keyof Dictionary["venueForm"]> = {
  "Kafe": "typeCafe",
  "Restoran": "typeRestaurant",
  "Bar / Pub": "typeBar",
  "Gece Kulübü": "typeClub",
  "Otel": "typeHotel",
  "Diğer": "typeOther",
};

export default function VenueApplicationForm() {
  const t = useT();
  const [venueName, setVenueName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [venueType, setVenueType] = useState("");
  const [message, setMessage] = useState("");
  // Bal küpü: ekranda görünmez, yalnızca botlar doldurur (bkz. route handler)
  const [website, setWebsite] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const typeId = useId();
  const messageId = useId();
  const errorId = useId();
  // Gönderim sonrası ekran okuyucu ve klavye odağı onay başlığına taşınır
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) sentHeadingRef.current?.focus();
  }, [sent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || sent) return;
    setSending(true);
    setError("");

    const res = await fetch("/api/venue-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue_name: venueName,
        contact_name: contactName,
        phone,
        email,
        city,
        venue_type: venueType,
        message,
        website,
      }),
    }).catch(() => null);

    const data = await res?.json().catch(() => null);

    if (!res?.ok) {
      setError(data?.error ?? t.venueForm.sendError);
      setSending(false);
      return;
    }

    setSent(true);
    setSending(false);
  };

  if (sent) {
    return (
      <div
        className="rounded-2xl border-2 border-[#22c55e]/50 bg-[#160d24] p-8 text-center"
      >
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 ref={sentHeadingRef} tabIndex={-1} className="font-display mt-5 text-2xl font-extrabold text-white outline-none">
          {t.venueForm.sentTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[#d1d5db]">
          {t.venueForm.sentDescPrefix}{" "}
          <span className="font-semibold text-white">{phone}</span> {t.venueForm.sentDescMiddle}{" "}
          <span className="font-semibold text-white">{email}</span> {t.venueForm.sentDescSuffix}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-describedby={error ? errorId : undefined}
      className="rounded-2xl border border-white/15 bg-[#160d24] p-5 sm:p-8"
    >
      <p className="mb-6 text-sm text-[#9ca3af]">{t.venueForm.requiredNote}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.venueForm.venueName}
          value={venueName}
          onChange={setVenueName}
          placeholder={t.venueForm.venueNamePlaceholder}
          required
          autoComplete="organization"
        />
        <Field
          label={t.venueForm.contactName}
          value={contactName}
          onChange={setContactName}
          placeholder={t.venueForm.contactNamePlaceholder}
          required
          autoComplete="name"
        />
        <Field
          label={t.venueForm.phone}
          value={phone}
          onChange={setPhone}
          placeholder={t.venueForm.phonePlaceholder}
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
        />
        <Field
          label={t.venueForm.email}
          value={email}
          onChange={setEmail}
          placeholder={t.venueForm.emailPlaceholder}
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label={t.venueForm.city}
          value={city}
          onChange={setCity}
          placeholder={t.venueForm.cityPlaceholder}
          autoComplete="address-level2"
        />
        <div>
          <FieldLabel htmlFor={typeId} label={t.venueForm.venueType} />
          <div className="relative">
            <select
              id={typeId}
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className={`${FIELD_CLASS} appearance-none pr-11`}
            >
              <option value="" style={{ background: "#160d24" }}>
                {t.venueForm.selectPlaceholder}
              </option>
              {VENUE_TYPES.map((type) => (
                <option key={type} value={type} style={{ background: "#160d24" }}>
                  {t.venueForm[VENUE_TYPE_KEYS[type]]}
                </option>
              ))}
            </select>
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#c7cad1]"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <FieldLabel htmlFor={messageId} label={t.venueForm.message} />
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder={t.venueForm.messagePlaceholder}
          className={`${FIELD_CLASS} resize-y`}
        />
      </div>

      {/* Bal küpü — ekran okuyucudan ve klavyeden de gizli */}
      <div aria-hidden className="hidden">
        <label>
          Web sitesi
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-base text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        aria-busy={sending}
        className="mt-7 min-h-14 w-full rounded-full bg-[#e91e8c] text-base font-bold text-white transition-colors hover:bg-[#ff2d9c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff2d9c] disabled:opacity-60"
      >
        {sending ? t.venueForm.sending : t.venueForm.submit}
      </button>

      <p className="mt-4 text-center text-sm leading-relaxed text-[#9ca3af]">
        {t.venueForm.consent}
      </p>
    </form>
  );
}
