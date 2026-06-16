"use client";

import { useState, useEffect, useMemo, use } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Tab = "pending" | "history";

type Request = {
  id: string;
  status: string;
  requested_by: string;
  requested_at: string;
  resolved_at: string | null;
  songs: {
    title: string;
    artist: string;
    album_cover_url: string;
    spotify_track_id: string;
    duration_ms: number;
  };
};

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  return `${Math.floor(diff / 3600)} sa önce`;
}

export default function RequestsPage({ params }: Props) {
  const { venueId } = use(params);
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<Request[]>([]);
  const [history, setHistory] = useState<Request[]>([]);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchRequests = async (venueDbId: string) => {
      const { data: p } = await supabase
        .from("song_requests")
        .select("id, status, requested_by, requested_at, resolved_at, songs(title, artist, album_cover_url, spotify_track_id, duration_ms)")
        .eq("venue_id", venueDbId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (!cancelled && p) setPending(p as unknown as Request[]);

      const { data: h } = await supabase
        .from("song_requests")
        .select("id, status, requested_by, requested_at, resolved_at, songs(title, artist, album_cover_url, spotify_track_id, duration_ms)")
        .eq("venue_id", venueDbId)
        .neq("status", "pending")
        .order("resolved_at", { ascending: false })
        .limit(30);
      if (!cancelled && h) setHistory(h as unknown as Request[]);
    };

    const load = async () => {
      const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (cancelled || !venue) return;

      await fetchRequests(venue.id);

      channel = supabase
        .channel(`song_requests:${venue.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "song_requests", filter: `venue_id=eq.${venue.id}` }, () => {
          fetchRequests(venue.id);
        })
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [venueId, supabase]);

  const resolve = async (id: string, status: "accepted" | "rejected") => {
    const req = pending.find((r) => r.id === id);

    // Kabul edilen istek sunucu tarafında playlist'e de eklenir — tek çağrı yeterli
    const res = await fetch("/api/admin/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: id, status }),
    });
    if (!res.ok) return;

    if (req) {
      setPending((prev) => prev.filter((r) => r.id !== id));
      setHistory((prev) => [{ ...req, status, resolved_at: new Date().toISOString() }, ...prev]);
    }
  };

  const list = tab === "pending" ? pending : history;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-white font-bold text-2xl mb-6">İstekler</h1>

      <div className="flex gap-2 mb-6">
        {(["pending", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2 rounded-xl text-sm font-medium transition-all" style={{ background: tab === t ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.06)", color: tab === t ? "#e91e8c" : "#9ca3af" }}>
            {t === "pending" ? `Bekleyen (${pending.length})` : "Geçmiş"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {list.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">{tab === "pending" ? "Bekleyen istek yok" : "Geçmiş boş"}</div>
        ) : (
          list.map((req, i) => (
            <div key={req.id} className="flex items-center gap-3 px-5 py-4" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
              {req.songs.album_cover_url ? (
                <Image src={req.songs.album_cover_url} alt="" width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{req.songs.title}</p>
                <p className="text-[#6b7280] text-xs">{req.songs.artist}</p>
                <p className="text-[#6b7280] text-xs">{req.requested_by} · {timeAgo(req.requested_at)}</p>
              </div>
              {tab === "pending" ? (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => resolve(req.id, "accepted")} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>Kabul</button>
                  <button onClick={() => resolve(req.id, "rejected")} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>Reddet</button>
                </div>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full shrink-0" style={{ background: req.status === "accepted" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: req.status === "accepted" ? "#22c55e" : "#ef4444" }}>
                  {req.status === "accepted" ? "Kabul" : "Reddedildi"}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
