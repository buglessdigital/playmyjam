"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Package = { id: string; label: string; tokens: number; price: number; popular: boolean };

interface Props {
  venueId: string;
  initialPackages: Package[];
  initialBalance: number;
  initialSelectedId: string;
}

export default function TokensClient({ venueId, initialPackages, initialBalance, initialSelectedId }: Props) {
  const router = useRouter();
  const [packages] = useState<Package[]>(initialPackages);
  const [balance, setBalance] = useState(initialBalance);
  const [selected, setSelected] = useState<string>(initialSelectedId);
  const [success, setSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handlePurchase = async () => {
    const pkg = packages.find((p) => p.id === selected);
    if (!pkg || purchasing) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/venue/${venueId}/tokens/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Bir hata oluştu, tekrar dene.");
        return;
      }
      setBalance(typeof data?.balance === "number" ? data.balance : balance + pkg.tokens);
      setSuccess(true);
      setTimeout(() => router.back(), 1800);
    } catch {
      alert("Bağlantı hatası, tekrar dene.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleDemo = async () => {
    if (demoLoading || demoSuccess) return;
    setDemoLoading(true);
    try {
      const res = await fetch(`/api/venue/${venueId}/tokens/demo`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) { alert(data?.error ?? "Bir hata oluştu."); return; }
      setBalance(typeof data?.balance === "number" ? data.balance : balance + 10);
      setDemoSuccess(true);
    } catch {
      alert("Bağlantı hatası, tekrar dene.");
    } finally {
      setDemoLoading(false);
    }
  };

  const pkg = packages.find((p) => p.id === selected);

  return (
    <div className="min-h-screen bg-[#0f0a18] px-5 pt-12 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="text-white font-bold text-lg">Jeton Satın Al</h1>
      </div>

      <div className="rounded-2xl p-4 mb-6 text-center" style={{ background: "#1a0e2a", border: "1px solid rgba(233,30,140,0.15)" }}>
        <p className="text-[#9ca3af] text-xs mb-1">Mevcut Jeton</p>
        <p className="text-white font-black text-4xl">{balance}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {packages.map((p) => (
          <button key={p.id} onClick={() => setSelected(p.id)} className="rounded-2xl p-4 text-left relative transition-all" style={{ background: selected === p.id ? "rgba(233,30,140,0.15)" : "#1a0e2a", border: selected === p.id ? "1px solid rgba(233,30,140,0.5)" : "1px solid rgba(255,255,255,0.08)" }}>
            {p.popular && <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#e91e8c", color: "white" }}>Popüler</span>}
            <p className="text-white font-bold text-2xl">{p.tokens}</p>
            <p className="text-[#9ca3af] text-xs">jeton</p>
            <p className="text-[#e91e8c] font-bold text-sm mt-2">{p.price}₺</p>
          </button>
        ))}
      </div>

      {pkg && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#1a0e2a" }}>
          <div className="flex justify-between text-sm"><span className="text-[#9ca3af]">{pkg.label}</span><span className="text-white font-medium">{pkg.tokens} jeton</span></div>
          <div className="flex justify-between text-sm mt-2"><span className="text-[#9ca3af]">Toplam</span><span className="text-[#e91e8c] font-bold">{pkg.price}₺</span></div>
        </div>
      )}

      <button onClick={handlePurchase} disabled={!selected || success || purchasing} className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all disabled:opacity-70" style={{ background: success ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg, #e91e8c, #c2185b)", color: success ? "#22c55e" : "white" }}>
        {success ? "Jetonlar eklendi!" : purchasing ? "İşleniyor..." : `Satın Al — ${pkg?.price ?? ""}₺`}
      </button>

      <div className="mt-4 rounded-2xl p-4" style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-[#9ca3af] text-xs text-center mb-3">Demo / Test Modu</p>
        <button
          onClick={handleDemo}
          disabled={demoLoading || demoSuccess}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
          style={{ background: demoSuccess ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: demoSuccess ? "#22c55e" : "#d1d5db" }}
        >
          {demoSuccess ? "✓ 10 demo jeton eklendi" : demoLoading ? "Ekleniyor..." : "Ücretsiz 10 Demo Jeton Al"}
        </button>
      </div>
    </div>
  );
}
