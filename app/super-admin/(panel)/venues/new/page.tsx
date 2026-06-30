"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toSlug, generatePassword } from "@/lib/utils";

const ACCENT = "#f59e0b";

function Field({
  label, value, onChange, placeholder, mono = false, readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; mono?: boolean; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-[#9ca3af] text-xs mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
        style={{
          background: readOnly ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: readOnly ? "#6b7280" : "white",
          fontFamily: mono ? "monospace" : undefined,
        }}
      />
    </div>
  );
}

export default function NewVenuePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // crypto.getRandomValues() prerender sırasında çağrılamaz — mount sonrası üret
  useEffect(() => {
    setAdminPassword(generatePassword());
  }, []);

  // Slug ve kullanıcı adı, elle düzenlenmedikleri sürece mekan adından türetilir
  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) setSlug(toSlug(val));
    if (!usernameEdited) setAdminUsername(val ? toSlug(val) + "_admin" : "");
  };

  const handleSlugChange = (val: string) => {
    setSlugEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"));
  };

  const handleUsernameChange = (val: string) => {
    setUsernameEdited(true);
    setAdminUsername(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/super-admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        name,
        tagline,
        logo_url: logoUrl,
        admin_username: adminUsername,
        admin_password: adminPassword,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error ?? "Bir hata oluştu";
      setError(msg.includes("duplicate key") ? `"${slug}" slug'ı zaten kullanımda, farklı bir slug dene.` : msg);
      setLoading(false);
      return;
    }
    setSaved(true);
    setTimeout(() => router.push("/super-admin/venues"), 1200);
  };

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/super-admin/venues" className="text-[#6b7280] hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Yeni Mekan</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">Yeni bir mekan hesabı oluştur</p>
        </div>
      </div>

      {error && (
        <div className="mb-2 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">Mekan Bilgileri</p>

          <Field label="Mekan Adı *" value={name} onChange={handleNameChange} placeholder="örn. The Neon Lounge" />

          <div>
            <label className="block text-[#9ca3af] text-xs mb-1.5">
              URL Slug *
              <span className="ml-2 text-[#6b7280]">— otomatik üretildi, düzenleyebilirsin</span>
            </label>
            <div className="flex items-center rounded-xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <span className="px-3 text-[#6b7280] text-sm border-r border-white/10 py-2.5 shrink-0">/venue/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="the-neon-lounge"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none font-mono"
              />
            </div>
          </div>

          <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="örn. Müziği sen seç, geceyi sen yönet" />
          <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://..." />
        </div>

        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">Admin Hesap Bilgileri</p>

          <Field
            label="Admin Kullanıcı Adı *"
            value={adminUsername}
            onChange={handleUsernameChange}
            placeholder="venue_admin"
            mono
          />

          <div>
            <label className="block text-[#9ca3af] text-xs mb-1.5">Admin Şifresi *</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center rounded-xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="px-3 text-[#6b7280] hover:text-white transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    {showPass ? (
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    ) : (
                      <>
                        <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setAdminPassword(generatePassword())}
                className="shrink-0 px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                style={{ background: "rgba(255,255,255,0.08)", color: "#9ca3af" }}
              >
                Yenile
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!name || !slug || !adminUsername || !adminPassword || loading || saved}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: saved ? "rgba(34,197,94,0.15)" : (!name || !slug || loading) ? "rgba(255,255,255,0.06)" : ACCENT,
            color: saved ? "#22c55e" : (!name || !slug || loading) ? "#6b7280" : "#0f0a18",
            cursor: (!name || !slug || loading || saved) ? "not-allowed" : "pointer",
          }}
        >
          {saved ? "Kaydedildi! Yönlendiriliyor..." : loading ? "Kaydediliyor..." : "Mekanı Oluştur"}
        </button>
      </form>
    </div>
  );
}
