"use client";

import { useRouter, useParams } from "next/navigation";
import Image from "next/image";

interface Song {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string;
}

function formatWait(ms: number): string {
  if (ms <= 0) return "Hemen";
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `~${secs} sn`;
  if (secs === 0) return `~${mins} dk`;
  return `~${mins} dk ${secs} sn`;
}

interface Props {
  song: Song | null;
  tokenBalance: number;
  cooldown?: { remainingMs: number; reason: "played" | "queued" | null };
  waitNormalMs?: number;
  waitPriorityMs?: number;
  onClose: () => void;
  onAdd: (priority: boolean) => void;
}

export default function AddSongSheet({ song, tokenBalance, cooldown, waitNormalMs = 0, waitPriorityMs = 0, onClose, onAdd }: Props) {
  const router = useRouter();
  const params = useParams<{ venueId: string }>();

  if (!song) return null;

  const inCooldown = !!cooldown && cooldown.remainingMs > 0;
  const cooldownMin = inCooldown ? Math.ceil(cooldown!.remainingMs / 60000) : 0;
  const cooldownReason = cooldown?.reason;
  const canNormal = tokenBalance >= 1 && !inCooldown;
  const canPriority = tokenBalance >= 2 && !inCooldown;

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
                {cooldownReason === "queued" ? "Bu şarkı zaten sırada" : "Bu şarkı yakın zamanda çaldı"}
              </p>
              <p className="text-[#d97706] text-xs mt-0.5">
                {cooldownReason === "queued"
                  ? <>Sıraya eklenebileceği en erken süre: <span className="font-bold text-[#fbbf24]">{cooldownMin} dakika</span> sonra (çalındıktan 30 dk geçince).</>
                  : <>Tekrar ekleyebilmek için <span className="font-bold text-[#fbbf24]">{cooldownMin} dakika</span> beklemeniz gerekiyor.</>
                }
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[#9ca3af] text-sm mb-4">
            Mevcut bakiye:{" "}
            <span className="text-white font-bold">{tokenBalance} Jeton</span>
          </p>
        )}

        <div className="space-y-3">
          {/* Normal Sıra */}
          <button
            onClick={() => canNormal && onAdd(false)}
            disabled={!canNormal}
            className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
            style={{
              background: canNormal ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
              borderColor: canNormal ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
              opacity: canNormal ? 1 : 0.5,
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
                <p className="text-white font-semibold text-sm">Normal Sıra</p>
                <p className="text-[#6b7280] text-xs">{formatWait(waitNormalMs)} bekleme</p>
              </div>
            </div>
            <span className="text-[#3b82f6] font-bold text-sm">1 Jeton</span>
          </button>

          {/* Öncelikli Sıra */}
          <button
            onClick={() => canPriority && onAdd(true)}
            disabled={!canPriority}
            className="w-full flex items-center justify-between p-4 rounded-2xl border transition-all"
            style={{
              background: canPriority ? "rgba(233,30,140,0.1)" : "rgba(255,255,255,0.03)",
              borderColor: canPriority ? "rgba(233,30,140,0.3)" : "rgba(255,255,255,0.08)",
              opacity: canPriority ? 1 : 0.5,
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
                  Öncelikli Sıra
                </p>
                <p className="text-[#6b7280] text-xs">{formatWait(waitPriorityMs)} bekleme</p>
              </div>
            </div>
            <span className="font-bold text-sm" style={{ color: "#e91e8c" }}>2 Jeton</span>
          </button>
        </div>

        {!canNormal && (
          <p className="text-center text-[#6b7280] text-xs mt-4">
            Yetersiz jeton.{" "}
            <span
              className="text-[#e91e8c] underline cursor-pointer"
              onClick={() => { onClose(); router.push(`/venue/${params.venueId}/tokens`); }}
            >Jeton Yükle</span>
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-2xl font-semibold text-[#9ca3af] border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm"
        >
          İptal
        </button>
      </div>
    </div>
  );
}
