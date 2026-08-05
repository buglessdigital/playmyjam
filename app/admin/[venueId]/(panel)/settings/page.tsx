"use client";

import { useEffect, useState } from "react";

const ACCENT = "#e91e8c";

type Settings = { name: string; request_cost: number; priority_cost: number };

function CostField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[#9ca3af] text-xs mb-1.5">{label}</label>
      <input
        type="number"
        min="1"
        max="50"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white",
        }}
      />
      <p className="text-[#6b7280] text-xs mt-1.5">{hint}</p>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requestCost, setRequestCost] = useState("1");
  const [priorityCost, setPriorityCost] = useState("2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Settings) => {
        setSettings(s);
        setRequestCost(String(s.request_cost));
        setPriorityCost(String(s.priority_cost));
      })
      .catch(() => setError("Ayarlar yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestCost: Number(requestCost), priorityCost: Number(priorityCost) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[#6b7280] text-sm">Yükleniyor...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Ayarlar</h1>
        <p className="text-[#6b7280] text-sm mt-0.5">{settings?.name ?? ""}</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div
          className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">Şarkı İstek Ücreti</p>
            <p className="text-[#6b7280] text-xs mt-1">
              Mekanınızda bir şarkı çaldırmanın jeton maliyeti. Jeton fiyatı tüm mekanlarda aynıdır;
              burada sadece bir istek için kaç jeton harcanacağını belirlersiniz.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CostField
              label="Normal istek (jeton)"
              hint="Sıranın sonuna eklenir"
              value={requestCost}
              onChange={setRequestCost}
            />
            <CostField
              label="Öncelikli istek (jeton)"
              hint="Sıranın başına geçer"
              value={priorityCost}
              onChange={setPriorityCost}
            />
          </div>

          <p className="text-[#6b7280] text-xs">
            Varsayılan: normal 1 jeton, öncelikli 2 jeton. Değişiklik yalnızca bundan sonraki
            isteklere uygulanır.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
          style={{
            background: saved ? "rgba(34,197,94,0.15)" : ACCENT,
            color: saved ? "#22c55e" : "white",
          }}
        >
          {saved ? "Kaydedildi!" : saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </button>
      </form>
    </div>
  );
}
