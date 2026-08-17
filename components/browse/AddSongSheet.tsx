"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { formatWait } from "@/lib/wait-time";
import type { Cooldown } from "./browse-types";
import { fmt, useI18n } from "@/lib/i18n";
import { savePendingAdd } from "@/lib/pending-add";
import { isGuestAccount } from "@/lib/guest-session";
import { ConsentNotice } from "@/components/ui/ConsentChecks";

interface Song {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
}

interface Props {
  song: Song | null;
  tokenBalance: number;
  cooldown?: Cooldown;
  waitNormalMs?: number;
  waitPriorityMs?: number;
  normalCost?: number;
  /** Kuyruğa göre hesaplanmış güncel öncelikli ücret (bkz. lib/pricing.ts) */
  priorityCost?: number;
  /** Mekanın taban öncelikli ücreti — fark varsa "sıra kalabalık" notu gösterilir */
  basePriorityCost?: number;
  /** Jeton başına TL (app_settings.token_unit_price) — jeton tutarının altında para karşılığı */
  tokenUnitPrice?: number;
  onClose: () => void;
  onAdd: (priority: boolean) => void;
}

export default function AddSongSheet({
  song, tokenBalance, cooldown, waitNormalMs = 0, waitPriorityMs = 0,
  normalCost = 1, priorityCost = 2, basePriorityCost = priorityCost, tokenUnitPrice = 0,
  onClose, onAdd,
}: Props) {
  const router = useRouter();
  const params = useParams<{ venueId: string }>();
  const { lang, t } = useI18n();

  // Jeton tutarı + altında TL karşılığı. Fiyat bilinmiyorsa (0) yalnızca jeton yazılır.
  const priceLabel = (tokens: number) =>
    tokenUnitPrice > 0
      ? `${(tokens * tokenUnitPrice).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 2 })}₺`
      : null;
  const costLabel = (tokens: number, color: string) => (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-bold text-sm" style={{ color }}>{fmt(t.addSong.tokensValue, { n: tokens })}</span>
      {priceLabel(tokens) && (
        <span className="text-[#6b7280] text-[11px] font-semibold tabular-nums">{priceLabel(tokens)}</span>
      )}
    </span>
  );

  // Ödemeye yönlendirilirken hangi seçeneğe basıldığı: o butonda dönen simge çıkar,
  // ikinci dokunuş ikinci sipariş açmasın diye ikisi de kilitlenir.
  const [buying, setBuying] = useState<null | "normal" | "priority">(null);

  // Giriş ekranından geçmeden devam eden müşteri onay metnini burada görür:
  // zorunlu onaylar aşağıdaki dokunuşla verilmiş sayılır (bkz. lib/guest-session.ts).
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    if (!song) return;
    let cancelled = false;
    isGuestAccount().then((guest) => {
      if (!cancelled) setIsGuest(guest);
    });
    return () => {
      cancelled = true;
    };
  }, [song]);

  if (!song) return null;

  const inCooldown = !!cooldown && cooldown.remainingMs > 0;
  const cooldownMin = inCooldown ? Math.ceil(cooldown!.remainingMs / 60000) : 0;
  const cooldownReason = cooldown?.reason;
  const affordNormal = tokenBalance >= normalCost;
  const affordPriority = tokenBalance >= priorityCost;
  const canNormal = affordNormal && !inCooldown;
  const canPriority = affordPriority && !inCooldown;
  // Toplu jeton almak isteyen için jeton sayfası: şarkı saklanır, dönüşte kart
  // kendiliğinden açılır ama şarkı EKLENMEZ — orada ne kadar jeton alındığı
  // bilinmediği için son dokunuş müşterinin olmalı.
  const goTokens = () => {
    savePendingAdd(params.venueId, song.youtube_video_id);
    onClose();
    router.push(`/venue/${params.venueId}/tokens`);
  };

  // Jeton yetmiyorsa asıl yol bu: jeton sayfasına hiç uğramadan, tam bu şarkı ve
  // bu öncelik için eksik jeton kadar sipariş açılıp doğrudan ödemeye gidilir.
  // Ödeme onayı zaten "bu şarkıyı şu fiyata çaldır" demek olduğu için dönüşte
  // şarkı kendiliğinden sıraya girer (bkz. lib/pending-add.ts + SongDetailClient).
  const buyAndPlay = async (priority: boolean) => {
    if (buying) return;
    const need = Math.max(0, (priority ? priorityCost : normalCost) - tokenBalance);
    // Arada başka bir sekmeden jeton geldiyse ödemeye hiç gitme
    if (need <= 0) {
      onAdd(priority);
      return;
    }
    setBuying(priority ? "priority" : "normal");
    savePendingAdd(params.venueId, song.youtube_video_id, { priority, autoAdd: true });
    try {
      const res = await fetch(`/api/venue/${params.venueId}/tokens/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: need }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.paymentPageUrl) {
        // Ödeme başlatılamadı: müşteri açıkta kalmasın, bildiğimiz jeton sayfasına düşsün
        setBuying(null);
        goTokens();
        return;
      }
      window.location.href = data.paymentPageUrl;
    } catch {
      setBuying(null);
      goTokens();
    }
  };
  // Seçeneğin tek alt satırı: beklemesi ve —jeton yetmiyorsa— dokununca ödemeye
  // gidileceği. Ayrı satırlara bölünmüş hâli kartı okunmaz yapıyordu.
  const subLine = (waitMs: number, cost: number, afford: boolean) => {
    const wait = fmt(t.addSong.waitSuffix, { wait: formatWait(waitMs) });
    if (afford || inCooldown) return wait;
    // Tutar sağdaki sütunda zaten yazıyor; burada yalnızca bakiyenin bir kısmı
    // varken (ödenecek tutar sütundakinden az) tekrar edilir.
    const price = tokenBalance > 0 ? priceLabel(cost - tokenBalance) : null;
    return `${wait} · ${price ? fmt(t.addSong.payHint, { price }) : t.addSong.payHintPlain}`;
  };
  // Sıra kalabalıklaştıkça öncelikli pahalılaşır: taban ücretin üstüne çıkıldığında
  // müşteri fiyatın neden yükseldiğini görsün
  const prioritySurcharge = priorityCost > basePriorityCost;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none" />
      <div
        className="absolute inset-0"
        onClick={onClose}
        onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="relative w-full max-w-md rounded-t-3xl p-6 pb-24 max-h-[90vh] overflow-y-auto"
        style={{ background: "#1a0e2a", touchAction: "manipulation" }}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

        <div className="flex items-center gap-4 mb-6">
          {song.album_cover_url ? (
            <Image
              src={song.album_cover_url}
              alt={song.title}
              width={56}
              height={56}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/10" />
          )}
          <div>
            <h3 className="text-white font-bold text-base">{song.title}</h3>
            <p className="text-[#9ca3af] text-sm">{song.artist}</p>
          </div>
        </div>

        {inCooldown ? (
          <div
            className="flex items-start gap-3 p-4 rounded-2xl mb-4"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" stroke="#fbbf24" strokeWidth="1.5" />
              <path d="M12 7v5l3 3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-[#fbbf24] text-sm font-semibold">
                {cooldownReason === "playing"
                  ? t.addSong.playingTitle
                  : cooldownReason === "queued"
                  ? t.addSong.queuedTitle
                  : t.addSong.playedTitle}
              </p>
              <p className="text-[#d97706] text-xs mt-0.5">
                {cooldownReason === "playing"
                  ? <>{t.addSong.playingDescPrefix} <span className="font-bold text-[#fbbf24]">{t.addSong.playingDescBold}</span> {t.addSong.playingDescSuffix}</>
                  : cooldownReason === "queued"
                  ? <>{t.addSong.queuedDescPrefix} <span className="font-bold text-[#fbbf24]">{fmt(t.addSong.minutesBold, { n: cooldownMin })}</span> {t.addSong.queuedDescSuffix}</>
                  : <>{t.addSong.playedDescPrefix} <span className="font-bold text-[#fbbf24]">{fmt(t.addSong.minutesBold, { n: cooldownMin })}</span> {t.addSong.playedDescSuffix}</>
                }
              </p>
            </div>
          </div>
        ) : (
          // Bakiye yalnızca VARSA yazılır: sıfır bakiye satırı hiçbir şey
          // anlatmıyordu, "jetonun yetmiyor" kutusuyla birlikte kartı
          // gereksiz yere uzatıyordu. Ne ödeneceği zaten düğmelerin üstünde.
          tokenBalance > 0 && (
            <p className="text-[#6b7280] text-xs mb-4">
              {t.addSong.balance}{" "}
              <span className="text-white font-semibold">{fmt(t.addSong.tokensValue, { n: tokenBalance })}</span>
            </p>
          )
        )}

        <div className="space-y-3">
          {/* Öncelikli sıra önce ve daha görünür duruyor: normal sıraya sonradan
              eklenen öncelikliler önüne geçtiği için tercihi burada yönlendiriyoruz.
              Eskiden bunu ayrı bir onay ekranı anlatıyordu — aynı bilgi artık iki
              butonun kendisinde, bir dokunuş eksiğine. */}
          <button
            onClick={() => {
              if (inCooldown || buying) return;
              if (canPriority) onAdd(true);
              else buyAndPlay(true);
            }}
            disabled={inCooldown || buying !== null}
            className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
            style={{
              background: inCooldown ? "rgba(255,255,255,0.03)" : "rgba(233,30,140,0.12)",
              borderColor: inCooldown ? "rgba(255,255,255,0.08)" : "rgba(233,30,140,0.45)",
              opacity: inCooldown ? 0.5 : 1,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(233,30,140,0.15)" }}
              >
                {buying === "priority" ? (
                  <span className="w-5 h-5 border-2 border-[#e91e8c]/30 border-t-[#e91e8c] rounded-full animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
                  </svg>
                )}
              </div>
              <div className="text-left">
                <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                  {t.addSong.priorityQueue}
                  <span className="rounded-full bg-[#e91e8c]/20 px-2 py-[1px] text-[9px] font-extrabold uppercase tracking-wider text-[#e91e8c]">
                    {t.addSong.recommended}
                  </span>
                </p>
                <p className="text-[#6b7280] text-xs">{subLine(waitPriorityMs, priorityCost, affordPriority)}</p>
                {prioritySurcharge && (
                  <p className="text-[#e91e8c]/80 text-[11px] mt-0.5">{t.addSong.priorityBusy}</p>
                )}
              </div>
            </div>
            {costLabel(priorityCost, "#e91e8c")}
          </button>

          {/* Normal Sıra */}
          <button
            onClick={() => {
              if (inCooldown || buying) return;
              if (canNormal) onAdd(false);
              else buyAndPlay(false);
            }}
            disabled={inCooldown || buying !== null}
            className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
            style={{
              background: inCooldown ? "rgba(255,255,255,0.03)" : "rgba(59,130,246,0.1)",
              borderColor: inCooldown ? "rgba(255,255,255,0.08)" : "rgba(59,130,246,0.3)",
              opacity: inCooldown ? 0.5 : 1,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.15)" }}
              >
                {buying === "normal" ? (
                  <span className="w-5 h-5 border-2 border-[#3b82f6]/30 border-t-[#3b82f6] rounded-full animate-spin" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="text-left">
                <p className="text-white font-semibold text-sm">{t.addSong.normalQueue}</p>
                <p className="text-[#6b7280] text-xs">{subLine(waitNormalMs, normalCost, affordNormal)}</p>
                {/* Onay ekranının tek gerçek bilgisi buydu: sonradan gelen öncelikliler öne geçer */}
                {!inCooldown && <p className="text-[#6b7280] text-[11px] mt-0.5">{t.addSong.normalWarn}</p>}
              </div>
            </div>
            {costLabel(normalCost, "#3b82f6")}
          </button>

        </div>

        {isGuest && (
          <ConsentNotice variant="continue" className="mt-4 text-center text-[10px] leading-relaxed text-[#6b7280]" />
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-2xl font-semibold text-[#9ca3af] border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
