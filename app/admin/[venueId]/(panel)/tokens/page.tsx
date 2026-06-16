"use client";

import { useState, useEffect, useMemo, useCallback, use } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Package = { id: string; label: string; tokens: number; price: number; popular: boolean; display_order: number };

export default function AdminTokensPage({ params }: Props) {
  const { venueId } = use(params);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchPackages = useCallback(async (): Promise<Package[] | null> => {
    const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
    if (!venue) return null;
    const { data } = await supabase.from("token_packages").select("*").eq("venue_id", venue.id).order("display_order");
    return data ?? null;
  }, [supabase, venueId]);

  useEffect(() => {
    let cancelled = false;
    fetchPackages().then((data) => {
      if (!cancelled && data) setPackages(data);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPackages]);

  const update = (id: string, field: keyof Package, value: string | boolean | number) => {
    setSaved(false);
    setPackages((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };

  const save = async () => {
    setError(null);
    const res = await fetch("/api/admin/tokens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packages }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Kaydedilemedi");
      // Kaydedilmemiş değişiklikler ekranda kalmasın — veritabanındaki halini geri yükle
      const fresh = await fetchPackages();
      if (fresh) setPackages(fresh);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white font-bold text-2xl">Jeton Fiyatları</h1>
        <button onClick={save} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all" style={{ background: saved ? "rgba(34,197,94,0.15)" : "#e91e8c", color: saved ? "#22c55e" : "white" }}>
          {saved ? "Kaydedildi!" : "Kaydet"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Paket Adı", "Jeton", "Fiyat (₺)", "Popüler"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-[#6b7280] text-xs font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg, i) => (
              <tr key={pkg.id} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                <td className="px-5 py-3">
                  <input value={pkg.label} onChange={(e) => update(pkg.id, "label", e.target.value)} className="bg-transparent text-white text-sm outline-none border-b border-white/20 focus:border-[#e91e8c] transition-colors w-full" />
                </td>
                <td className="px-5 py-3">
                  <input type="number" value={pkg.tokens} onChange={(e) => update(pkg.id, "tokens", Number(e.target.value))} className="bg-transparent text-white text-sm outline-none border-b border-white/20 focus:border-[#e91e8c] transition-colors w-20" />
                </td>
                <td className="px-5 py-3">
                  <input type="number" value={Number(pkg.price)} onChange={(e) => update(pkg.id, "price", Number(e.target.value))} className="bg-transparent text-white text-sm outline-none border-b border-white/20 focus:border-[#e91e8c] transition-colors w-20" />
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => update(pkg.id, "popular", !pkg.popular)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all" style={{ background: pkg.popular ? "rgba(233,30,140,0.2)" : "rgba(255,255,255,0.08)" }}>
                    {pkg.popular && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#e91e8c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl border border-white/10 p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <input value={pkg.label} onChange={(e) => update(pkg.id, "label", e.target.value)} className="bg-transparent text-white font-semibold text-sm outline-none border-b border-white/20 focus:border-[#e91e8c]" />
            <div className="flex gap-4">
              <div><p className="text-[#6b7280] text-xs mb-1">Jeton</p><input type="number" value={pkg.tokens} onChange={(e) => update(pkg.id, "tokens", Number(e.target.value))} className="bg-transparent text-white text-sm outline-none border-b border-white/20 w-16 focus:border-[#e91e8c]" /></div>
              <div><p className="text-[#6b7280] text-xs mb-1">Fiyat (₺)</p><input type="number" value={Number(pkg.price)} onChange={(e) => update(pkg.id, "price", Number(e.target.value))} className="bg-transparent text-white text-sm outline-none border-b border-white/20 w-20 focus:border-[#e91e8c]" /></div>
              <div className="flex items-end"><button onClick={() => update(pkg.id, "popular", !pkg.popular)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all" style={{ background: pkg.popular ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.08)", color: pkg.popular ? "#e91e8c" : "#9ca3af" }}>{pkg.popular ? "Popüler ✓" : "Popüler"}</button></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
