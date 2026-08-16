"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import Coin from "@/components/ui/Coin";
import type { TokenPackage } from "@/lib/pricing-cache";
import { currentDict, fmt, useI18n } from "@/lib/i18n";
import { publishTokenBalance } from "@/lib/token-balance-store";

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

// Paket adedi: seçili paket kendi katları halinde artar (1'lik paket 1 jeton+birim
// fiyat, 3'lük paket 3 jeton+paket fiyatı adımlarla). Toplam jeton bu tavanı aşamaz.
const MAX_TOKENS = 1000;
const TX_PREVIEW = 3;

// Tek jeton her zaman satılabilir: super admin hiç paket tanımlamamış olsa da
// müşteri birim fiyattan istediği adette alabilsin diye sanal bir seçenek üretilir.
// Bu id sunucuya gönderilmez; checkout paketsiz istekte birim fiyatı DB'den okur.
const SINGLE_ID = "single";

const PINK = "#e91e8c";
const CARD = "#170e25";

function timeAgo(ms: number) {
  const d = currentDict().historyPage;
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 60) return fmt(d.minsAgo, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(d.hoursAgo, { n: h });
  return fmt(d.daysAgo, { n: Math.floor(h / 24) });
}

function txLabel(tx: WalletTx) {
  const d = currentDict().tokens;
  if (tx.kind === "spend") return tx.song_title ? fmt(d.txSong, { title: tx.song_title }) : d.txRequest;
  if (tx.kind === "demo") return d.txDemo;
  if (tx.kind === "grant") return d.txGrant;
  return d.txPurchase;
}

interface Props {
  venueId: string;
  initialPackages: TokenPackage[];
  initialSelectedId: string;
  unitPrice: number;
  /** Mekanda normal bir şarkı isteğinin jeton bedeli — başlangıç adedi buna göre gelir */
  requestCost: number;
}

// Eski sürümde ödeme formundan toplanan alıcı bilgisi; artık istenmiyor, kalıntı temizleniyor.
const LEGACY_BUYER_STORAGE_KEY = "pmj_buyer_info";

/** Seçilebilir satır kabuğu: paketler ve tek jeton aynı görsel dilde. */
function OptionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer rounded-2xl p-4 transition-all active:scale-[0.99]"
      style={{
        background: selected ? "rgba(233,30,140,0.07)" : CARD,
        border: selected ? `1px solid rgba(233,30,140,0.5)` : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {children}
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all"
      style={{
        background: selected ? PINK : "transparent",
        border: selected ? `1px solid ${PINK}` : "1px solid rgba(255,255,255,0.22)",
      }}
    >
      {selected && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export default function TokensClient({ venueId, initialPackages, initialSelectedId, unitPrice, requestCost }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Alt gezinmedeki JETON AL sekmesi ?tab=1 ile açar (bkz. BottomNav)
  const fromTab = searchParams.get("tab") === "1";
  const supabase = useMemo(() => createClient(), []);
  const { lang, t } = useI18n();
  // Tek jeton satırı listenin başında; super admin 1'lik paket tanımlamışsa
  // tekrar etmesin diye sanal satır atlanır.
  const packages = useMemo<TokenPackage[]>(() => {
    if (initialPackages.some((p) => p.tokens === 1)) return initialPackages;
    return [
      { id: SINGLE_ID, label: "1", tokens: 1, price: unitPrice, popular: false },
      ...initialPackages,
    ];
  }, [initialPackages, unitPrice]);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<string>(initialSelectedId || SINGLE_ID);

  // Başlangıç adedi: mekandaki bir normal şarkı isteğini karşılayacak en küçük kat
  // (1'lik satırda doğrudan request_cost kadar jeton seçili gelir).
  const defaultMultiplier = useCallback(
    (p: TokenPackage | undefined) => {
      if (!p || p.tokens <= 0) return 1;
      const needed = Math.ceil(Math.max(1, requestCost) / p.tokens);
      return Math.min(Math.max(1, needed), Math.max(1, Math.floor(MAX_TOKENS / p.tokens)));
    },
    [requestCost]
  );

  // Seçili paketin kaç kez alınacağı; paket değişince yine bir şarkılık adede döner
  const [multiplier, setMultiplier] = useState(() =>
    defaultMultiplier(packages.find((p) => p.id === (initialSelectedId || SINGLE_ID)))
  );

  const selectPackage = (id: string) => {
    setSelected(id);
    setMultiplier(defaultMultiplier(packages.find((p) => p.id === id)));
  };

  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [txLoaded, setTxLoaded] = useState(false);
  const [txExpanded, setTxExpanded] = useState(false);

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

  // Alt gezinmedeki jeton rozeti anında güncellensin (satın alma sonrası dahil)
  useEffect(() => {
    if (balanceLoaded) publishTokenBalance(balance);
  }, [balanceLoaded, balance]);
  const [purchasing, setPurchasing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<"success" | "fail" | null>(null);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_BUYER_STORAGE_KEY);
    } catch {
      // localStorage yok/erişilemez — sorun değil
    }
  }, []);

  // iyzico'dan dönüş: ?payment=success|fail — bakiyeyi yenile, banner göster, URL'i temizle
  useEffect(() => {
    (async () => {
      const payment = searchParams.get("payment");
      if (payment !== "success" && payment !== "fail") return;
      setPaymentResult(payment);
      if (payment === "success") {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (uid) {
          const { data: w } = await supabase.from("user_wallets").select("balance").eq("user_id", uid).maybeSingle();
          if (typeof w?.balance === "number") setBalance(w.balance);
          loadTxs();
        }
      }
      router.replace(`/venue/${venueId}/tokens`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayBalance = useAnimatedNumber(balance);

  const pkg = packages.find((p) => p.id === selected) ?? null;
  const buyTokens = pkg ? pkg.tokens * multiplier : 0;
  const buyTotal = pkg ? pkg.price * multiplier : 0;

  const handlePurchase = async () => {
    if (purchasing || !pkg || buyTokens <= 0) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/venue/${venueId}/tokens/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pkg.id === SINGLE_ID ? { quantity: multiplier } : { package_id: pkg.id, quantity: multiplier }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? t.tokens.genericError);
        return;
      }
      window.location.href = data.paymentPageUrl;
    } catch {
      alert(t.tokens.connectionError);
      setPurchasing(false);
    }
  };

  const locale = lang === "tr" ? "tr-TR" : "en-US";
  const unitLabel = (p: TokenPackage) => (p.price / p.tokens).toLocaleString(locale, { maximumFractionDigits: 1 });
  const fmtPrice = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  // Adet tavanı pakete göre: toplam jeton MAX_TOKENS'ı aşamaz
  const clampMultiplier = (n: number, p: TokenPackage) =>
    Math.min(Math.max(1, Math.floor(MAX_TOKENS / p.tokens)), Math.max(1, Math.round(n)));

  const visibleTxs = txExpanded ? txs : txs.slice(0, TX_PREVIEW);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0f0a18] px-5 pt-12 pb-44">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{ background: "radial-gradient(70% 60% at 50% 0%, rgba(233,30,140,0.12), rgba(139,92,246,0.05) 45%, transparent 75%)" }}
      />

      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          {/* Sayfa alt gezinmedeki sekmeden açıldıysa (?tab=1) geri oku anlamsız:
              sekmeler zaten altta duruyor. Bir şarkı/kuyruk akışından gelindiyse kalır. */}
          {!fromTab && (
            <button
              onClick={() => router.back()}
              aria-label={t.common.back}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          <h1 className="text-lg font-bold text-white">{t.tokens.title}</h1>
        </div>

        {/* Bakiye: tek satır, sade */}
        <div
          className="mb-6 flex items-center gap-4 rounded-3xl px-5 py-4"
          style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.22)" }}
          >
            <Coin size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{t.tokens.currentBalance}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              {balanceLoaded ? (
                <span className="text-[30px] font-black leading-none text-white tabular-nums">{displayBalance}</span>
              ) : (
                <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-white/10" />
              )}
              <span className="text-sm font-medium text-[#9ca3af]">{t.tokens.tokenUnit}</span>
            </div>
          </div>
          <p className="max-w-[7.5rem] shrink-0 text-right text-[10px] leading-tight text-[#6b7280]">
            {fmt(t.tokens.balanceNote, { price: fmtPrice(unitPrice) })}
          </p>
        </div>

        {paymentResult && (
          <div
            className="mb-6 flex items-center gap-2 rounded-2xl p-4 text-sm font-semibold"
            style={
              paymentResult === "success"
                ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" }
                : { background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.4)", color: PINK }
            }
          >
            {paymentResult === "success" ? t.tokens.paySuccess : t.tokens.payFail}
          </div>
        )}

        {/* Miktar seçimi: yalnızca paketler; seçili paket kendi katlarıyla artar */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{t.tokens.chooseAmount}</p>

        <div className="space-y-2.5" role="radiogroup" aria-label={t.tokens.chooseAmount}>
          {packages.map((p) => {
            const isSel = selected === p.id;
            const savings = unitPrice > 0 ? Math.round((1 - p.price / p.tokens / unitPrice) * 100) : 0;
            // Seçili satırda gösterilen değerler adede göre katlanır
            const mult = isSel ? multiplier : 1;
            const rowTokens = p.tokens * mult;
            const rowPrice = p.price * mult;
            return (
              <OptionRow key={p.id} selected={isSel} onSelect={() => selectPackage(p.id)}>
                <div className="flex items-center gap-3.5">
                  <Radio selected={isSel} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[19px] font-extrabold leading-none text-white tabular-nums">
                        {rowTokens} <span className="text-xs font-medium text-[#9ca3af]">{t.tokens.tokenUnit}</span>
                      </p>
                      {p.popular && (
                        <span
                          className="rounded-full px-2 py-[2px] text-[9px] font-extrabold uppercase tracking-wider text-white"
                          style={{ background: "linear-gradient(135deg, #ff2d9c, #b3126d)" }}
                        >
                          {t.tokens.mostPopular}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#6b7280]">{fmt(t.tokens.perToken, { price: unitLabel(p) })}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-white tabular-nums">{fmtPrice(rowPrice)}₺</p>
                    {savings > 0 && (
                      <span className="mt-1 inline-block rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold text-[#4ade80]">
                        {fmt(t.tokens.savings, { percent: savings })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Adet: her dokunuş paketin kendi katı kadar jeton ve fiyat ekler */}
                {isSel && (
                  <div
                    className="mt-4 flex items-center justify-center gap-4 rounded-xl bg-black/20 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={t.tokens.decreaseAria}
                      onClick={() => setMultiplier((m) => clampMultiplier(m - 1, p))}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
                      disabled={multiplier <= 1}
                    >
                      −
                    </button>
                    <span className="min-w-20 text-center text-lg font-extrabold text-white tabular-nums">
                      {rowTokens}
                    </span>
                    <button
                      type="button"
                      aria-label={t.tokens.increaseAria}
                      onClick={() => setMultiplier((m) => clampMultiplier(m + 1, p))}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
                      disabled={rowTokens + p.tokens > MAX_TOKENS}
                    >
                      +
                    </button>
                  </div>
                )}
              </OptionRow>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
            </svg>
            {t.tokens.secureNote}
          </div>
        </div>
        {/* iyzico resmi ödeme rozeti: kart bilgilerinin iyzico güvencesiyle alındığını gösterir (marka kiti şartı) */}
        <div className="mt-3 flex items-center justify-center">
          <Image
            src="/payment/iyzico-ile-ode-horizontal-white.svg"
            alt="iyzico ile Öde"
            width={210}
            height={31}
            className="h-5 w-auto opacity-70"
          />
        </div>

        {/* Jeton hareketleri */}
        <p className="mt-9 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{t.tokens.recentActivity}</p>
        {!txLoaded ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl" style={{ background: CARD }} />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div
            className="rounded-2xl py-8 text-center text-xs text-[#6b7280]"
            style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {t.tokens.noActivity}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.07)" }}>
              {visibleTxs.map((tx, i) => {
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10 6-10 6z" stroke={PINK} strokeWidth="2" strokeLinejoin="round" /></svg>
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
                      <p className="mt-0.5 text-[10px] text-[#6b7280] tabular-nums">{fmt(t.tokens.balanceAfter, { n: tx.balance_after })}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {txs.length > TX_PREVIEW && (
              <button
                onClick={() => setTxExpanded((v) => !v)}
                className="mt-3 w-full rounded-xl py-2.5 text-xs font-semibold text-[#9ca3af] transition-colors active:text-white"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                {txExpanded ? t.tokens.showLess : fmt(t.tokens.showAll, { n: txs.length })}
              </button>
            )}
          </>
        )}
      </div>

      {/* Ödeme çubuğu: alt gezinmenin (h-16) hemen üstünde sabit */}
      <div
        className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 px-5 py-3 backdrop-blur-xl"
        style={{ background: "rgba(15,10,24,0.9)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">{t.tokens.selected}</p>
            <p className="mt-1 text-lg font-extrabold leading-none text-white tabular-nums">
              {fmt(t.tokens.selectedValue, { n: buyTokens })}
            </p>
          </div>
          <button
            onClick={handlePurchase}
            disabled={buyTokens <= 0 || purchasing}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-bold transition-all active:scale-[0.98] disabled:pointer-events-none"
            style={{
              background: "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)",
              boxShadow: "0 10px 28px -10px rgba(233,30,140,0.6)",
              color: "white",
              opacity: purchasing ? 0.8 : 1,
            }}
          >
            {purchasing ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
                </svg>
                {t.tokens.redirecting}
              </>
            ) : (
              <>{fmt(t.tokens.payWith, { total: fmtPrice(buyTotal) })}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
