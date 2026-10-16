"use client";

import { useState, useEffect } from "react";

type Stats = {
  days: number;
  total_requests: number;
  total_tokens: number;
  unique_users: number;
  priority_count: number;
  top_songs: { title: string; artist: string; album_cover_url: string | null; count: number }[];
  hourly: number[];
};

const RANGES = [
  { days: 1, label: "Son 24 saat" },
  { days: 7, label: "Son 7 gün" },
  { days: 30, label: "Son 30 gün" },
];

export default function AdminStatsPage() {
  const [days, setDays] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/stats?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Stats;
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("İstatistikler yüklenemedi");
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxHour = stats ? Math.max(...stats.hourly, 1) : 1;
  const peakHour = stats ? stats.hourly.indexOf(Math.max(...stats.hourly)) : -1;

  const tiles = stats
    ? [
        { label: "İstek", value: stats.total_requests },
        { label: "Harcanan Jeton", value: stats.total_tokens },
        { label: "Tekil Dinleyici", value: stats.unique_users },
        { label: "Öncelikli İstek", value: stats.priority_count },
      ]
    : [];

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-white font-bold text-2xl">İstatistikler</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: days === r.days ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.06)",
                color: days === r.days ? "#e91e8c" : "#9ca3af",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {!stats && !error && (
        <div className="rounded-2xl border border-white/10 p-8 text-center text-[#6b7280] text-sm">
          Yükleniyor…
        </div>
      )}

      {stats && (
        <>
          {/* Özet kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-2xl border border-white/10 px-4 py-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-white font-bold text-2xl tabular-nums">{t.value.toLocaleString("tr-TR")}</p>
                <p className="text-[#6b7280] text-xs mt-1">{t.label}</p>
              </div>
            ))}
          </div>

          {/* Saatlik aktivite */}
          <div className="rounded-2xl border border-white/10 p-5 mb-6" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-white font-semibold text-sm mb-1">Saatlik Aktivite</p>
            <p className="text-[#6b7280] text-xs mb-4">İsteklerin gün içindeki saatlere dağılımı</p>
            {stats.total_requests === 0 ? (
              <p className="text-[#6b7280] text-sm py-8 text-center">Bu dönemde istek yok.</p>
            ) : (
              <div className="flex items-end gap-[2px] h-36" role="img" aria-label="Saatlik istek dağılımı çubuk grafiği">
                {stats.hourly.map((count, hour) => (
                  <div key={hour} className="group relative flex-1 h-full flex flex-col justify-end items-center">
                    {/* Hover değeri: yalnızca seçici etiket; zirve saat kalıcı etiketli */}
                    <span
                      className={`absolute -top-1 text-[10px] tabular-nums whitespace-nowrap transition-opacity ${
                        hour === peakHour && count > 0 ? "text-white" : "text-[#9ca3af] opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {count}
                    </span>
                    <div
                      className="w-full max-w-[14px] rounded-t-[4px] transition-all group-hover:brightness-125"
                      style={{
                        height: count > 0 ? `${Math.max((count / maxHour) * 100, 4)}%` : "2px",
                        background: count > 0 ? "#e91e8c" : "rgba(255,255,255,0.08)",
                      }}
                    />
                    <span className="mt-1.5 text-[9px] text-[#6b7280] tabular-nums">
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : " "}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* En çok istenenler */}
          <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="px-5 pt-5 pb-3">
              <p className="text-white font-semibold text-sm">En Çok İstenenler</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Dönem içinde en çok istek alan 10 şarkı</p>
            </div>
            {stats.top_songs.length === 0 ? (
              <p className="text-[#6b7280] text-sm px-5 pb-6 pt-2">Bu dönemde istek yok.</p>
            ) : (
              <ul>
                {stats.top_songs.map((song, i) => (
                  <li key={`${song.title}-${i}`} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="text-[#6b7280] text-xs font-semibold w-5 text-right tabular-nums">{i + 1}</span>
                    {song.album_cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={song.album_cover_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{song.title}</p>
                      <p className="text-[#6b7280] text-xs truncate">{song.artist}</p>
                    </div>
                    <span className="text-[#9ca3af] text-xs tabular-nums flex-shrink-0">{song.count} istek</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
