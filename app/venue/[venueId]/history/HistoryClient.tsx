"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type PlayedRow = {
  id: string;
  song_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  venue_name: string;
  venue_slug: string;
  played_at: number | null;
};

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function HistoryClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<PlayedRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Tüm mekanlardaki çaldırma geçmişi tek RPC'de (auth.uid() ile kendi satırları)
      const { data } = await supabase.rpc("get_played_history");
      if (!cancelled) {
        setRows((data ?? []) as PlayedRow[]);
        setLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center gap-3 px-5 pt-12 pb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="text-white font-bold text-lg">Son Çaldırılanlar</h1>
      </div>

      {!loaded ? (
        <div className="px-5 space-y-3 pb-20">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl animate-pulse" style={{ background: "#1a0e2a" }}>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/2 rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">Henüz hiç şarkı çaldırmadın</div>
      ) : (
        <div className="px-5 space-y-3 pb-20">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#1a0e2a" }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                {row.album_cover_url && (
                  <Image src={row.album_cover_url} alt="" width={48} height={48} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{row.title}</p>
                <p className="text-[#6b7280] text-xs truncate">{row.artist}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className="max-w-[110px] truncate rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}
                >
                  {row.venue_name}
                </span>
                <span className="text-[10px] text-[#6b7280]">
                  {row.played_at != null ? timeAgo(row.played_at) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
