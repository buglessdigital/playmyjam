"use client";

import { useState } from "react";
import { VENUE_TYPES } from "@/lib/validate";
import { useT, type Dictionary } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

const FIELD_STYLE = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#9ca3af]">
        {label}
        {required && <span className="ml-0.5 text-[#e91e8c]">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        maxLength={120}
        className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none transition-colors placeholder:text-[#4b5563] focus:border-[#e91e8c]/60"
        style={FIELD_STYLE}
      />
    </label>
  );
}

// Ana sayfadaki mekan kayıt formu. Gönderim /api/venue-applications'a düşer,
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
        className="rounded-3xl border p-8 text-center"
        style={{ background: "#160d24", borderColor: "rgba(34,197,94,0.3)" }}
      >
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="mt-5 text-xl font-black text-white">{t.venueForm.sentTitle}</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9ca3af]">
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
      className="rounded-3xl border border-white/[0.08] p-6 sm:p-8"
      style={{ background: "#160d24" }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#9ca3af]">{t.venueForm.venueType}</span>
          <select
            value={venueType}
            onChange={(e) => setVenueType(e.target.value)}
            className="w-full appearance-none rounded-xl px-3.5 py-3 text-sm text-white outline-none transition-colors focus:border-[#e91e8c]/60"
            style={FIELD_STYLE}
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
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-[#9ca3af]">
          {t.venueForm.message}
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t.venueForm.messagePlaceholder}
          className="w-full resize-y rounded-xl px-3.5 py-3 text-sm text-white outline-none transition-colors placeholder:text-[#4b5563] focus:border-[#e91e8c]/60"
          style={FIELD_STYLE}
        />
      </label>

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
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
        style={{ background: PINK_GRADIENT, boxShadow: "0 12px 32px -12px rgba(233,30,140,0.6)" }}
      >
        {sending ? t.venueForm.sending : t.venueForm.submit}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[#6b7280]">
        {t.venueForm.consent}
      </p>
    </form>
  );
}
