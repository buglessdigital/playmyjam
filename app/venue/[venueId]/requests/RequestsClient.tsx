"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Request = {
  id: string;
  status: string;
  requested_at: string;
  tokens_spent?: number;
  priority?: boolean;
  songs: { title: string; artist: string; album_cover_url: string };
};

type QueueHistoryRow = {
  id: string;
  tokens_spent: number;
  priority: boolean;
  status: string;
  added_at: string;
  songs: { title: string; artist: string; album_cover_url: string } | null;
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function RequestsClient() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchHistory = async (userId: string) => {
      const { data: queueHistory } = await supabase
        .from("queue")
        .select("id, tokens_spent, priority, status, added_at, songs(title, artist, album_cover_url)")
        .eq("user_id", userId)
        .order("added_at", { ascending: false })
        .limit(20);

      if (!cancelled && queueHistory) {
        const rows = queueHistory as unknown as QueueHistoryRow[];
        setRequests(rows.filter((q) => q.songs).map((q) => ({
          id: q.id,
          status: q.status === "played" ? "Çalındı" : q.status === "queued" ? "Sırada" : q.status,
          requested_at: q.added_at,
          tokens_spent: q.tokens_spent,
          priority: q.priority,
          songs: q.songs!,
        })));
      }
      if (!cancelled) setLoaded(true);
    };

    const subscribe = async () => {
      // getSession lokal cache'ten okur — ağ çağrısı yapmaz
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (cancelled || !user) {
        if (!cancelled) setLoaded(true);
        return;
      }

      fetchHistory(user.id);

      channel = supabase
        .channel(`my_queue:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `user_id=eq.${user.id}` }, () => {
          fetchHistory(user.id);
        })
        .subscribe();
    };

    subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center gap-3 px-5 pt-12 pb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="text-white font-bold text-lg">İsteklerim</h1>
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
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">Henüz istek yapılmadı</div>
      ) : (
        <div className="px-5 space-y-3 pb-20">
          {requests.map((req) => (
            <div key={req.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#1a0e2a" }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                {req.songs.album_cover_url && (
                  <Image src={req.songs.album_cover_url} alt="" width={48} height={48} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{req.songs.title}</p>
                <p className="text-[#6b7280] text-xs">{req.songs.artist}</p>
                {req.tokens_spent && (
                  <p className="text-[#9ca3af] text-xs mt-0.5">{req.tokens_spent} jeton{req.priority ? " · Öncelikli" : ""}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[#9ca3af] text-xs">{req.status}</p>
                <p className="text-[#6b7280] text-xs mt-0.5">{timeAgo(req.requested_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
