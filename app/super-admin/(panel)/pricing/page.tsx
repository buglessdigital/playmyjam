"use client";

import { useState, useEffect } from "react";

const ACCENT = "#f59e0b";
const MAX_PACKAGES = 4;

type PackageRow = {
  label: string;
  tokens: string;
  price: string;
  popular: boolean;
};

export default function PricingPage() {
  const [unitPrice, setUnitPrice] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/super-admin/pricing")
      .then((r) => {
        if (!r.ok) throw new Error("Yüklenemedi");
        return r.json();
      })
      .then((data: { unit_price: number; packages: { label: string; tokens: number; price: number; popular: boolean }[] }) => {
        setUnitPrice(String(data.unit_price));
        setPackages(
          (data.packages ?? []).map((p) => ({
            label: p.label,
            tokens: String(p.tokens),
            price: String(p.price),
            popular: p.popular,
          }))
        );
      })
      .catch(() => setError("Fiyatlandırma bilgileri yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (idx: number, patch: Partial<PackageRow>) => {
    setPackages((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const setPopular = (idx: number, value: boolean) => {
    // En fazla bir popüler paket: işaretlenen dışındakiler kapanır
    setPackages((rows) => rows.map((r, i) => ({ ...r, popular: i === idx ? value : false })));
    setSaved(false);
  };

  const addRow = () => {
    if (packages.length >= MAX_PACKAGES) return;
    setPackages((rows) => [...rows, { label: "", tokens: "", price: "", popular: false }]);
    setSaved(false);
  };

  const removeRow = (idx: number) => {
    setPackages((rows) => rows.filter((_, i) => i !== idx));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/super-admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_price: Number(unitPrice.replace(",", ".")),
          packages: packages.map((p) => ({
            label: p.label.trim(),
            tokens: Number(p.tokens),
            price: Number(p.price.replace(",", ".")),
            popular: p.popular,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setSaved(true);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[#6b7280] text-sm">Yükleniyor...</div>;

  const unit = Number(unitPrice.replace(",", "."));

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Fiyatlandırma</h1>
        <p className="text-[#6b7280] text-sm mt-0.5">
          Birim fiyat ve jeton paketleri tüm mekanlarda aynıdır; yalnızca buradan değiştirilebilir.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-white text-sm font-semibold">Birim Fiyat</p>
          <div>
            <label className="block text-[#9ca3af] text-xs mb-1.5">1 jeton (TL)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={unitPrice}
              onChange={(e) => { setUnitPrice(e.target.value); setSaved(false); }}
              className="w-full max-w-[180px] rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
            />
            <p className="text-[#6b7280] text-xs mt-1.5">
              Tekli jeton satışının fiyatı ve paketlerdeki avantaj yüzdesinin baz değeri.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center justify-between">
            <p className="text-white text-sm font-semibold">Jeton Paketleri</p>
            <span className="text-[#6b7280] text-xs">{packages.length}/{MAX_PACKAGES}</span>
          </div>

          {packages.length === 0 && (
            <p className="text-[#6b7280] text-sm">
              Paket yok — müşteriler yalnızca tekli jeton satın alabilir.
            </p>
          )}

          {packages.map((p, idx) => {
            const tokens = Number(p.tokens);
            const price = Number(p.price.replace(",", "."));
            const validRow = Number.isInteger(tokens) && tokens > 0 && Number.isFinite(price) && price > 0;
            const savings =
              validRow && Number.isFinite(unit) && unit > 0
                ? Math.round((1 - price / tokens / unit) * 100)
                : null;
            return (
              <div
                key={idx}
                className="rounded-xl border border-white/10 p-4 flex flex-col gap-3"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_90px_110px]">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[#9ca3af] text-xs mb-1.5">Paket adı</label>
                    <input
                      type="text"
                      value={p.label}
                      maxLength={40}
                      onChange={(e) => updateRow(idx, { label: e.target.value })}
                      placeholder="Örn: Başlangıç"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9ca3af] text-xs mb-1.5">Jeton</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={p.tokens}
                      onChange={(e) => updateRow(idx, { tokens: e.target.value })}
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9ca3af] text-xs mb-1.5">Fiyat (TL)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={p.price}
                      onChange={(e) => updateRow(idx, { price: e.target.value })}
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-[#9ca3af] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p.popular}
                      onChange={(e) => setPopular(idx, e.target.checked)}
                      className="accent-[#f59e0b]"
                    />
                    &quot;En Popüler&quot; rozeti
                  </label>
                  <div className="flex items-center gap-3">
                    {savings !== null && (
                      <span className={`text-xs font-semibold ${savings > 0 ? "text-[#22c55e]" : savings < 0 ? "text-red-400" : "text-[#6b7280]"}`}>
                        {savings > 0 ? `%${savings} avantaj` : savings < 0 ? `birim fiyattan %${-savings} pahalı` : "birim fiyatla aynı"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-xs text-red-400/80 hover:text-red-400 transition-colors"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            disabled={packages.length >= MAX_PACKAGES}
            className="w-full py-2.5 rounded-xl text-xs font-medium border border-dashed border-white/15 text-[#9ca3af] transition-all hover:text-white disabled:opacity-40 disabled:pointer-events-none"
          >
            + Paket Ekle
          </button>
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
          {saved ? "Kaydedildi!" : saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </button>
      </form>
    </div>
  );
}
