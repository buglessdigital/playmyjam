"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { generatePassword } from "@/lib/utils";

const ACCENT = "#f59e0b";

type VenueData = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string;
  status: string;
  request_cost: number;
  priority_cost: number;
  venue_admins: { id: string; username: string }[];
};

function Field({
  label, value, onChange, placeholder, mono = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[#9ca3af] text-xs mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white",
          fontFamily: mono ? "monospace" : undefined,
        }}
      />
    </div>
  );
}

export default function EditVenuePage() {
  return (
    <Suspense>
      <EditVenueForm />
    </Suspense>
  );
}

function EditVenueForm() {
  const params = useParams();
  const router = useRouter();
  const venueSlug = params.venueId as string;

  const [venue, setVenue] = useState<VenueData | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [requestCost, setRequestCost] = useState("1");
  const [priorityCost, setPriorityCost] = useState("2");
  const [showPass, setShowPass] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!venueSlug) return;
    fetch(`/api/super-admin/venues/${venueSlug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Mekan yüklenemedi");
        return r.json();
      })
      .then((v: VenueData) => {
        setVenue(v);
        setName(v.name);
        setTagline(v.tagline ?? "");
        setLogoUrl(v.logo_url ?? "");
        setAdminUsername(v.venue_admins?.[0]?.username ?? "");
        setRequestCost(String(v.request_cost ?? 1));
        setPriorityCost(String(v.priority_cost ?? 2));
      })
      .catch(() => setError("Mekan bilgileri yüklenemedi"))
      .finally(() => setLoading(false));
  }, [venueSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/super-admin/venues/${venueSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          logo_url: logoUrl,
          adminUsername,
          adminPassword: adminPassword || undefined,
          requestCost: Number(requestCost),
          priorityCost: Number(priorityCost),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setSaved(true);
      setTimeout(() => router.push("/super-admin/venues"), 1200);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[#6b7280] text-sm">Yükleniyor...</div>;

  if (!venue) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#6b7280]">{error || "Mekan bulunamadı."}</p>
        <Link href="/super-admin/venues" className="text-[#f59e0b] text-sm mt-2 inline-block">Geri dön</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/super-admin/venues" className="text-[#6b7280] hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Mekan Düzenle</h1>
          <p className="text-[#6b7280] text-sm mt-0.5 font-mono">{venue.slug}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">Mekan Bilgileri</p>
          <Field label="Mekan Adı" value={name} onChange={setName} />
          <div>
            <label className="block text-[#9ca3af] text-xs mb-1.5">URL Slug</label>
            <div className="flex items-center rounded-xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="px-3 text-[#6b7280] text-sm border-r border-white/10 py-2.5 shrink-0">/venue/</span>
              <span className="px-3 py-2.5 text-[#6b7280] text-sm font-mono">{venue.slug}</span>
            </div>
            <p className="text-[#6b7280] text-xs mt-1">Slug değiştirilemez — mevcut linkler bozulur.</p>
          </div>
          <Field label="Tagline" value={tagline} onChange={setTagline} />
          <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://..." />
        </div>

        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">İstek Ücretleri</p>
          <p className="text-[#6b7280] text-xs -mt-2">
            Bu mekanda bir şarkı isteğinin jeton maliyeti. Jeton fiyatları globaldir ve
            Fiyatlandırma sayfasından yönetilir.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Normal istek (jeton)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={requestCost}
                onChange={(e) => setRequestCost(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
              />
            </div>
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Öncelikli istek (jeton)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={priorityCost}
                onChange={(e) => setPriorityCost(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">Admin Hesap Bilgileri</p>
          <Field label="Admin Kullanıcı Adı" value={adminUsername} onChange={setAdminUsername} mono />
          <div>
            <label className="block text-[#9ca3af] text-xs mb-1.5">
              Yeni Şifre
              <span className="ml-2 text-[#6b7280]">— boş bırakırsan değişmez (en az 8 karakter)</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center rounded-xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Değiştirmek için gir"
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white outline-none font-mono placeholder:text-[#4b5563]"
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="px-3 text-[#6b7280] hover:text-white transition-colors">
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
                Üret
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || saved}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
          style={{
            background: saved ? "rgba(34,197,94,0.15)" : ACCENT,
            color: saved ? "#22c55e" : "#0f0a18",
          }}
        >
          {saved ? "Kaydedildi! Yönlendiriliyor..." : saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </button>
      </form>
    </div>
  );
}
