"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { formatWait } from "@/lib/wait-time";
import type { Cooldown } from "./browse-types";
import { fmt, useI18n } from "@/lib/i18n";
import { savePendingAdd } from "@/lib/pending-add";

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

  // Normal sıra seçildiğinde araya giren onay adımı: sonradan eklenen öncelikli
  // şarkılar normal sıradakilerin önüne geçtiği için uyarıp yönlendiriyoruz.
  // Onay hangi şarkı için açıldığını tutar: sheet kapanınca/başka şarkı seçilince
  // kendiliğinden sıfırlanır.
  const [confirmForId, setConfirmForId] = useState<string | null>(null);
  const confirmNormal = !!song && confirmForId === song.youtube_video_id;
  const setConfirmNormal = (open: boolean) =>
    setConfirmForId(open && song ? song.youtube_video_id : null);

  if (!song) return null;

  const inCooldown = !!cooldown && cooldown.remainingMs > 0;
  const cooldownMin = inCooldown ? Math.ceil(cooldown!.remainingMs / 60000) : 0;
  const cooldownReason = cooldown?.reason;
  const affordNormal = tokenBalance >= normalCost;
  const affordPriority = tokenBalance >= priorityCost;
  const canNormal = affordNormal && !inCooldown;
  const canPriority = affordPriority && !inCooldown;
  // Jeton yetmediğinde seçenekler ölü buton gibi durmasın: tıklayınca yükleme
  // sayfasına götürsün ve altta ayrıca büyük bir yükleme çağrısı çıksın.
  // Jeton yüklemeye giderken hangi şarkı için gidildiği saklanır: müşteri geri
  // döndüğünde şarkıyı baştan aramak zorunda kalmasın, kart kendiliğinden açılsın.
  // Şarkı otomatik eklenmez — jeton harcaması yine müşterinin dokunuşuyla olur.
  const goTokens = () => {
    savePendingAdd(params.venueId, song.youtube_video_id);
    onClose();
    router.push(`/venue/${params.venueId}/tokens`);
  };
  const missingTokens = Math.max(0, (affordNormal ? priorityCost : normalCost) - tokenBalance);
  const showTopUpCta = !inCooldown && !affordPriority;
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
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-[#9ca3af] text-sm">
              {t.addSong.balance}{" "}
              <span className="text-white font-bold">{fmt(t.addSong.tokensValue, { n: tokenBalance })}</span>
            </p>
            <button
              onClick={goTokens}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-[#e91e8c] border border-[#e91e8c]/40 bg-[#e91e8c]/10 hover:bg-[#e91e8c]/20 transition-all"
            >
              + {t.addSong.topUp}
            </button>
          </div>
        )}

        {/* Jeton hiç yetmiyorsa seçeneklerin üstünde neden yetmediğini söyle */}
        {!inCooldown && !affordNormal && (
          <div
            className="flex items-start gap-3 p-4 rounded-2xl mb-4"
            style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.25)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="9" stroke="#e91e8c" strokeWidth="1.5" />
              <path d="M12 8v5M12 16h.01" stroke="#e91e8c" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-white text-sm font-semibold">{t.addSong.needTitle}</p>
              <p className="text-[#9ca3af] text-xs mt-1 leading-relaxed">
                {fmt(t.addSong.needDesc, { n: normalCost, balance: tokenBalance })}
              </p>
            </div>
          </div>
        )}

        {confirmNormal ? (
          <div className="space-y-3">
            <div
              className="flex items-start gap-3 p-4 rounded-2xl"
              style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.25)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
              </svg>
              <div>
                <p className="text-white text-sm font-semibold">{t.addSong.confirmTitle}</p>
                <p className="text-[#9ca3af] text-xs mt-1 leading-relaxed">
                  {t.addSong.confirmDescPrefix} <span className="text-[#e91e8c] font-semibold">{t.addSong.confirmDescPriority}</span>{" "}
                  {t.addSong.confirmDescMiddle}{" "}
                  <span className="text-white font-semibold">{formatWait(waitNormalMs)}</span>{t.addSong.confirmDescAfterWait}{" "}
                  <span className="text-white font-semibold">{formatWait(waitPriorityMs)}</span> {t.addSong.confirmDescEnd}
                </p>
              </div>
            </div>

            {canPriority ? (
              <button
                onClick={() => onAdd(true)}
                className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
                style={{ background: "rgba(233,30,140,0.16)", borderColor: "rgba(233,30,140,0.45)" }}
              >
                <span className="text-white font-semibold text-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" /></svg>
                  {t.addSong.addPriority}
                </span>
                {costLabel(priorityCost, "#e91e8c")}
              </button>
            ) : (
              <button
                onClick={goTokens}
                className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
                style={{ background: "rgba(233,30,140,0.16)", borderColor: "rgba(233,30,140,0.45)" }}
              >
                <span className="text-white font-semibold text-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" /></svg>
                  {t.addSong.buyForPriority}
                </span>
                {costLabel(priorityCost, "#e91e8c")}
              </button>
            )}

            {/* Normal sıra rengi (mavi) ana adımdakiyle aynı: "Geri" ile karışmasın,
                öncelikli butonun pembesiyle de yarışmasın */}
            <button
              onClick={() => canNormal && onAdd(false)}
              disabled={!canNormal}
              className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
              style={{
                background: "rgba(59,130,246,0.14)",
                borderColor: "rgba(59,130,246,0.4)",
                opacity: canNormal ? 1 : 0.5,
              }}
            >
              <span className="text-white font-semibold text-sm flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {t.addSong.addNormalAnyway}
              </span>
              {costLabel(normalCost, "#3b82f6")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Normal Sıra — jeton yetmiyorsa tıklayınca yükleme sayfasına gider */}
            <button
              onClick={() => (canNormal ? setConfirmNormal(true) : !inCooldown && goTokens())}
              disabled={inCooldown}
              className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
              style={{
                background: canNormal ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                borderColor: canNormal ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
                opacity: canNormal || !inCooldown ? 1 : 0.5,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(59,130,246,0.15)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-white font-semibold text-sm">{t.addSong.normalQueue}</p>
                  <p className="text-[#6b7280] text-xs">{fmt(t.addSong.waitSuffix, { wait: formatWait(waitNormalMs) })}</p>
                  {!inCooldown && !affordNormal && (
                    <p className="text-[#e91e8c] text-[11px] font-semibold mt-0.5">{t.addSong.lockedHint}</p>
                  )}
                </div>
              </div>
              {costLabel(normalCost, "#3b82f6")}
            </button>

            {/* Öncelikli Sıra */}
            <button
              onClick={() => (canPriority ? onAdd(true) : !inCooldown && goTokens())}
              disabled={inCooldown}
              className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
              style={{
                background: canPriority ? "rgba(233,30,140,0.1)" : "rgba(255,255,255,0.03)",
                borderColor: canPriority ? "rgba(233,30,140,0.3)" : "rgba(255,255,255,0.08)",
                opacity: canPriority || !inCooldown ? 1 : 0.5,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(233,30,140,0.15)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" /></svg>
                    {t.addSong.priorityQueue}
                  </p>
                  <p className="text-[#6b7280] text-xs">{fmt(t.addSong.waitSuffix, { wait: formatWait(waitPriorityMs) })}</p>
                  {prioritySurcharge && (
                    <p className="text-[#e91e8c]/80 text-[11px] mt-0.5">{t.addSong.priorityBusy}</p>
                  )}
                  {!inCooldown && !affordPriority && (
                    <p className="text-[#e91e8c] text-[11px] font-semibold mt-0.5">{t.addSong.lockedHint}</p>
                  )}
                </div>
              </div>
              {costLabel(priorityCost, "#e91e8c")}
            </button>

            {/* Eksik jeton varsa asıl çağrı: seçeneklerin hemen altında dolu bir buton */}
            {showTopUpCta && (
              <button
                onClick={goTokens}
                className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-lg"
                style={{ background: "linear-gradient(135deg,#e91e8c,#7c3aed)" }}
              >
                {t.addSong.topUp}
                {missingTokens > 0 && (
                  <span className="block text-[11px] font-semibold text-white/80 mt-0.5">
                    {fmt(t.addSong.needMore, { n: missingTokens })}
                    {tokenUnitPrice > 0 ? ` · ${priceLabel(missingTokens)}` : ""}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {inCooldown && !affordNormal && (
          <p className="text-center text-[#6b7280] text-xs mt-4">
            {t.addSong.insufficient}{" "}
            <span className="text-[#e91e8c] underline cursor-pointer" onClick={goTokens}>{t.addSong.topUp}</span>
          </p>
        )}

        <button
          onClick={() => (confirmNormal ? setConfirmNormal(false) : onClose())}
          className="w-full mt-4 py-3 rounded-2xl font-semibold text-[#9ca3af] border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm"
        >
          {confirmNormal ? t.common.back : t.common.cancel}
        </button>
      </div>
    </div>
  );
}
