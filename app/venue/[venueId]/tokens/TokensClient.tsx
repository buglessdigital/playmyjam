"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import Coin from "@/components/ui/Coin";

type Package = { id: string; label: string; tokens: number; price: number; popular: boolean };

interface Props {
  venueId: string;
  venueDbId: string;
  initialPackages: Package[];
  initialSelectedId: string;
}

export default function TokensClient({ venueId, venueDbId, initialPackages, initialSelectedId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [packages] = useState<Package[]>(initialPackages);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<string>(initialSelectedId);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    const load = async () => {
      // Kullanıcı id'si lokal session'dan; bakiye tek sorgu (RLS: yalnızca kendi satırı)
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (cancelled || !userId) {
        if (!cancelled) setBalanceLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("user_tokens")
        .select("balance")
        .eq("user_id", userId)
        .eq("venue_id", venueDbId)
        .maybeSingle();
      if (!cancelled) {
        setBalance(data?.balance ?? 0);
        setBalanceLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [venueDbId, supabase]);
  const [success, setSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const displayBalance = useAnimatedNumber(balance);

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
  const maxUnit = packages.reduce((m, p) => Math.max(m, p.price / p.tokens), 0);
  const unitLabel = (p: Package) => (p.price / p.tokens).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0f0a18] px-5 pt-12 pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: "radial-gradient(70% 60% at 50% 0%, rgba(233,30,140,0.14), rgba(139,92,246,0.07) 45%, transparent 75%)" }}
      />

      <div className="relative">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Geri"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="text-lg font-bold text-white">Jeton Satın Al</h1>
        </div>

        <div
          className="relative mb-7 overflow-hidden rounded-3xl p-5"
          style={{
            background: "linear-gradient(135deg, #241238 0%, #1a0e2a 55%, #150c22 100%)",
            border: "1px solid rgba(233,30,140,0.18)",
            boxShadow: "0 18px 40px -18px rgba(233,30,140,0.35)",
          }}
        >
          <div aria-hidden className="absolute -right-7 -top-9 rotate-12 opacity-[0.06]">
            <Coin size={150} />
          </div>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "radial-gradient(120% 80% at 85% 0%, rgba(233,30,140,0.12), transparent 55%)" }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">Mevcut Bakiye</p>
              <div className="mt-2 flex items-baseline gap-2">
                {balanceLoaded ? (
                  <span className="text-[42px] font-black leading-none text-white tabular-nums">{displayBalance}</span>
                ) : (
                  <span className="inline-block h-10 w-16 animate-pulse rounded-lg bg-white/10" />
                )}
                <span className="text-sm font-medium text-[#9ca3af]">jeton</span>
              </div>
            </div>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(233,30,140,0.1)",
                border: "1px solid rgba(233,30,140,0.25)",
                boxShadow: "0 0 24px rgba(233,30,140,0.18)",
              }}
            >
              <Coin size={30} />
            </div>
          </div>
        </div>

        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">Paket Seç</p>

        <div className="mb-6 grid grid-cols-2 gap-3">
          {packages.map((p, idx) => {
            const isSel = selected === p.id;
            const savings = maxUnit > 0 ? Math.round((1 - p.price / p.tokens / maxUnit) * 100) : 0;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="relative rounded-2xl p-4 text-left transition-all active:scale-[0.97]"
                style={{
                  background: isSel
                    ? "linear-gradient(160deg, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 60%, #1a0e2a)"
                    : "#1a0e2a",
                  border: isSel ? "1px solid rgba(233,30,140,0.55)" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isSel ? "0 0 28px rgba(233,30,140,0.22)" : "none",
                }}
              >
                {p.popular && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[9px] font-extrabold uppercase tracking-wider text-white"
                    style={{ background: "linear-gradient(135deg, #ff2d9c, #b3126d)", boxShadow: "0 4px 14px rgba(233,30,140,0.45)" }}
                  >
                    En Popüler
                  </span>
                )}
                <div className="flex items-start justify-between">
                  <div className="flex">
                    {Array.from({ length: Math.min(idx + 1, 4) }).map((_, i) => (
                      <span key={i} className={`relative inline-flex ${i > 0 ? "-ml-2.5" : ""}`} style={{ zIndex: 4 - i }}>
                        <Coin size={22} />
                      </span>
                    ))}
                  </div>
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full transition-all"
                    style={{
                      background: isSel ? "#e91e8c" : "transparent",
                      border: isSel ? "1px solid #e91e8c" : "1px solid rgba(255,255,255,0.25)",
                    }}
                  >
                    {isSel && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                </div>
                <p className="mt-3 text-[26px] font-black leading-none text-white">
                  {p.tokens} <span className="text-xs font-medium text-[#9ca3af]">jeton</span>
                </p>
                <p className="mt-1 text-[11px] text-[#6b7280]">₺{unitLabel(p)}/jeton</p>
                <div className="mt-3 flex items-center justify-between gap-1">
                  <p className="text-base font-bold text-[#e91e8c]">{p.price}₺</p>
                  {savings > 0 && (
                    <span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold text-[#4ade80]">
                      %{savings} avantaj
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {pkg && (
          <div className="mb-4 rounded-2xl p-4" style={{ background: "#160d24", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex justify-between text-sm">
              <span className="text-[#9ca3af]">Seçilen paket</span>
              <span className="font-semibold text-white">{pkg.tokens} jeton</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-[#9ca3af]">Birim fiyat</span>
              <span className="text-white">₺{unitLabel(pkg)}/jeton</span>
            </div>
            <div className="my-3 border-t border-dashed border-white/10" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[#9ca3af]">Toplam</span>
              <span className="text-xl font-extrabold text-[#e91e8c]">{pkg.price}₺</span>
            </div>
          </div>
        )}

        <button
          onClick={handlePurchase}
          disabled={!selected || success || purchasing}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-all active:scale-[0.98] disabled:pointer-events-none"
          style={
            success
              ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" }
              : {
                  background: "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)",
                  boxShadow: "0 10px 32px -8px rgba(233,30,140,0.55)",
                  color: "white",
                  opacity: purchasing ? 0.8 : 1,
                }
          }
        >
          {success ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Jetonlar eklendi!
            </>
          ) : purchasing ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
              İşleniyor...
            </>
          ) : (
            <>Satın Al · {pkg?.price ?? ""}₺</>
          )}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          Güvenli ödeme · Jetonlar anında yüklenir
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] text-[#9ca3af]">veya</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Demo / Test modu</p>
            <p className="mt-0.5 text-xs text-[#9ca3af]">Uygulamayı denemek için ücretsiz jeton</p>
          </div>
          <button
            onClick={handleDemo}
            disabled={demoLoading || demoSuccess}
            className="shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95 disabled:pointer-events-none"
            style={
              demoSuccess
                ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" }
                : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", opacity: demoLoading ? 0.6 : 1 }
            }
          >
            {demoSuccess ? "✓ Eklendi" : demoLoading ? "Ekleniyor..." : "+10 jeton"}
          </button>
        </div>
      </div>
    </div>
  );
}
