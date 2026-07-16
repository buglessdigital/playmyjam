"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import Coin from "@/components/ui/Coin";
import type { TokenPackage } from "@/lib/pricing-cache";

type WalletTx = {
  id: string;
  amount: number;
  kind: "purchase" | "demo" | "spend" | "grant";
  balance_after: number;
  venue_name: string | null;
  song_title: string | null;
  song_artist: string | null;
  created_at: number;
};

const CUSTOM = "custom";
const MAX_LOOSE = 1000;

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function txLabel(tx: WalletTx) {
  if (tx.kind === "spend") return tx.song_title ? `Şarkı: ${tx.song_title}` : "Şarkı isteği";
  if (tx.kind === "demo") return "Demo jeton";
  if (tx.kind === "grant") return "Hediye jeton";
  return "Jeton satın alma";
}

interface Props {
  venueId: string;
  initialPackages: TokenPackage[];
  initialSelectedId: string;
  unitPrice: number;
}

export default function TokensClient({ venueId, initialPackages, initialSelectedId, unitPrice }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [packages] = useState<TokenPackage[]>(initialPackages);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<string>(initialSelectedId || CUSTOM);
  const [qty, setQty] = useState(1);

  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [txLoaded, setTxLoaded] = useState(false);

  const loadTxs = useCallback(async () => {
    // Jeton hareketleri tek RPC'de (mekan adı + şarkı bilgisiyle, RLS: kendi satırları)
    const { data } = await supabase.rpc("get_wallet_history");
    setTxs((data ?? []) as WalletTx[]);
    setTxLoaded(true);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Kullanıcı id'si lokal session'dan; global cüzdan tek sorgu (RLS: yalnızca kendi satırı)
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (cancelled || !userId) {
        if (!cancelled) {
          setBalanceLoaded(true);
          setTxLoaded(true);
        }
        return;
      }
      const [{ data }] = await Promise.all([
        supabase.from("user_wallets").select("balance").eq("user_id", userId).maybeSingle(),
        loadTxs(),
      ]);
      if (!cancelled) {
        setBalance(data?.balance ?? 0);
        setBalanceLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, loadTxs]);
  const [success, setSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const displayBalance = useAnimatedNumber(balance);

  const pkg = selected === CUSTOM ? null : packages.find((p) => p.id === selected);
  const buyTokens = pkg ? pkg.tokens : qty;
  const buyTotal = pkg ? pkg.price : qty * unitPrice;

  const handlePurchase = async () => {
    if (purchasing || buyTokens <= 0) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/venue/${venueId}/tokens/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg ? { package_id: pkg.id } : { tokens: qty }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Bir hata oluştu, tekrar dene.");
        return;
      }
      setBalance(typeof data?.balance === "number" ? data.balance : balance + buyTokens);
      setSuccess(true);
      loadTxs();
      setTimeout(() => router.back(), 1800);
    } catch {
      alert("Bağlantı hatası, tekrar dene.");
    } finally {
      setPurchasing(false);
    }
  };

  const unitLabel = (p: TokenPackage) => (p.price / p.tokens).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  const fmtPrice = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  const clampQty = (n: number) => Math.min(MAX_LOOSE, Math.max(1, Math.round(n)));

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
              <p className="mt-1.5 text-[11px] text-[#6b7280]">Tüm mekanlarda geçerli · 1 jeton = {fmtPrice(unitPrice)}₺</p>
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

        {packages.length > 0 && (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">Paket Seç</p>

            <div className="mb-4 grid grid-cols-2 gap-3">
              {packages.map((p, idx) => {
                const isSel = selected === p.id;
                const savings = unitPrice > 0 ? Math.round((1 - p.price / p.tokens / unitPrice) * 100) : 0;
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
                      <p className="text-base font-bold text-[#e91e8c]">{fmtPrice(p.price)}₺</p>
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
          </>
        )}

        {/* Tekli jeton: adet × global birim fiyat */}
        <button
          onClick={() => setSelected(CUSTOM)}
          className="mb-6 w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
          style={{
            background:
              selected === CUSTOM
                ? "linear-gradient(160deg, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 60%, #1a0e2a)"
                : "#1a0e2a",
            border: selected === CUSTOM ? "1px solid rgba(233,30,140,0.55)" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: selected === CUSTOM ? "0 0 28px rgba(233,30,140,0.22)" : "none",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Tek Jeton</p>
              <p className="mt-0.5 text-[11px] text-[#6b7280]">İstediğin adette · ₺{fmtPrice(unitPrice)}/jeton</p>
            </div>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all"
              style={{
                background: selected === CUSTOM ? "#e91e8c" : "transparent",
                border: selected === CUSTOM ? "1px solid #e91e8c" : "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {selected === CUSTOM && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </span>
          </div>
          {selected === CUSTOM && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span
                  role="button"
                  aria-label="Azalt"
                  onClick={() => setQty((q) => clampQty(q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white transition-transform active:scale-95"
                >
                  −
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_LOOSE}
                  value={qty}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setQty(Number.isFinite(n) && n >= 1 ? clampQty(n) : 1);
                  }}
                  className="h-9 w-16 rounded-xl bg-white/10 text-center text-sm font-bold text-white outline-none tabular-nums"
                />
                <span
                  role="button"
                  aria-label="Artır"
                  onClick={() => setQty((q) => clampQty(q + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white transition-transform active:scale-95"
                >
                  +
                </span>
              </div>
              <p className="text-base font-bold text-[#e91e8c] tabular-nums">{fmtPrice(qty * unitPrice)}₺</p>
            </div>
          )}
        </button>

        <div className="mb-4 rounded-2xl p-4" style={{ background: "#160d24", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex justify-between text-sm">
            <span className="text-[#9ca3af]">Seçilen</span>
            <span className="font-semibold text-white">{buyTokens} jeton{pkg ? ` · ${pkg.label}` : ""}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-[#9ca3af]">Birim fiyat</span>
            <span className="text-white">₺{pkg ? unitLabel(pkg) : fmtPrice(unitPrice)}/jeton</span>
          </div>
          <div className="my-3 border-t border-dashed border-white/10" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[#9ca3af]">Toplam</span>
            <span className="text-xl font-extrabold text-[#e91e8c]">{fmtPrice(buyTotal)}₺</span>
          </div>
        </div>

        <button
          onClick={handlePurchase}
          disabled={buyTokens <= 0 || success || purchasing}
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
            <>Satın Al · {fmtPrice(buyTotal)}₺</>
          )}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          Güvenli ödeme · Jetonlar anında yüklenir
        </div>

        {/* Jeton hareketleri */}
        <p className="mt-8 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">Son Hareketler</p>
        {!txLoaded ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ background: "#1a0e2a" }} />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div
            className="rounded-2xl py-8 text-center text-xs text-[#6b7280]"
            style={{ background: "#160d24", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            Henüz işlem yok
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl" style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.07)" }}>
            {txs.map((tx, i) => {
              const positive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : undefined}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={
                      positive
                        ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }
                        : { background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.2)" }
                    }
                  >
                    {positive ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10 6-10 6z" stroke="#e91e8c" strokeWidth="2" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{txLabel(tx)}</p>
                    <p className="mt-0.5 text-[11px] text-[#6b7280]">
                      {tx.venue_name ? `${tx.venue_name} · ` : ""}{timeAgo(tx.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold tabular-nums ${positive ? "text-[#4ade80]" : "text-[#e91e8c]"}`}>
                      {positive ? `+${tx.amount}` : tx.amount}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#6b7280] tabular-nums">bakiye {tx.balance_after}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
