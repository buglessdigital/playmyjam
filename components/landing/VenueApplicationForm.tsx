"use client";

import { useState } from "react";
import { VENUE_TYPES } from "@/lib/validate";

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
export default function VenueApplicationForm() {
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
      setError(data?.error ?? "Başvuru gönderilemedi, lütfen tekrar deneyin.");
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
        <h3 className="mt-5 text-xl font-black text-white">Başvurun bize ulaştı</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9ca3af]">
          Ekibimiz başvurunu inceleyip en kısa sürede{" "}
          <span className="font-semibold text-white">{phone}</span> numarasından veya{" "}
          <span className="font-semibold text-white">{email}</span> adresinden sana dönüş yapacak.
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
          label="Mekan adı"
          value={venueName}
          onChange={setVenueName}
          placeholder="örn. Kovan Lounge"
          required
          autoComplete="organization"
        />
        <Field
          label="Yetkili adı soyadı"
          value={contactName}
          onChange={setContactName}
          placeholder="örn. Ayşe Yılmaz"
          required
          autoComplete="name"
        />
        <Field
          label="Telefon"
          value={phone}
          onChange={setPhone}
          placeholder="05XX XXX XX XX"
          type="tel"
          required
          autoComplete="tel"
        />
        <Field
          label="E-posta"
          value={email}
          onChange={setEmail}
          placeholder="mekan@ornek.com"
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label="Şehir"
          value={city}
          onChange={setCity}
          placeholder="örn. İzmir"
          autoComplete="address-level2"
        />
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#9ca3af]">Mekan türü</span>
          <select
            value={venueType}
            onChange={(e) => setVenueType(e.target.value)}
            className="w-full appearance-none rounded-xl px-3.5 py-3 text-sm text-white outline-none transition-colors focus:border-[#e91e8c]/60"
            style={FIELD_STYLE}
          >
            <option value="" style={{ background: "#160d24" }}>
              Seçiniz
            </option>
            {VENUE_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: "#160d24" }}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-[#9ca3af]">
          Eklemek istediklerin
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Mekanının kapasitesi, müzik düzeni veya sormak istediklerin…"
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
        {sending ? "Gönderiliyor…" : "Başvuruyu Gönder"}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[#6b7280]">
        Formu göndererek iletişim bilgilerinin başvurunun değerlendirilmesi amacıyla işlenmesini
        kabul edersin. Kurulum ücretsizdir, ek donanım gerekmez.
      </p>
    </form>
  );
}
