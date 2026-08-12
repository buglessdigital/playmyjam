"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { currentDict, fmt, useT } from "@/lib/i18n";

type Request = {
  id: string;
  status: string;
  requested_at: string;
  tokens_spent?: number;
  priority?: boolean;
  songs: { title: string; artist: string; album_cover_url: string };
};

// Mekana gönderilen serbest metin öneriler (song_id boş song_requests satırları).
// Mekan şarkıyı listesine ekleyince satır gerçek şarkıya bağlanır ve 'accepted' olur.
type Suggestion = {
  id: string;
  status: string;
  requested_at: string;
  expires_at: string | null;
  play_deadline: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
  songs: { title: string; artist: string; album_cover_url: string } | null;
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
  const d = currentDict().historyPage;
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return fmt(d.minsAgo, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(d.hoursAgo, { n: h });
  return fmt(d.daysAgo, { n: Math.floor(h / 24) });
}

export default function RequestsClient() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Talep pencerelerinin geri sayımı saniyede bir tazelensin
  const [tick, setTick] = useState(() => Date.now());
  const supabase = useMemo(() => createClient(), []);
  const t = useT();
  const statusLabel = (status: string) =>
    status === "played" ? t.requestsPage.statusPlayed : status === "queued" ? t.requestsPage.statusQueued : status;

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchSuggestions = async (userId: string) => {
      const { data } = await supabase
        .from("song_requests")
        .select("id, status, requested_at, expires_at, play_deadline, suggested_title, suggested_artist, songs(title, artist, album_cover_url)")
        .eq("user_id", userId)
        .not("suggested_title", "is", null)
        .order("requested_at", { ascending: false })
        .limit(10);
      if (!cancelled && data) setSuggestions(data as unknown as Suggestion[]);
    };

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
          status: q.status,
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
      fetchSuggestions(user.id);

      channel = supabase
        .channel(`my_queue:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "queue", filter: `user_id=eq.${user.id}` }, () => {
          fetchHistory(user.id);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "song_requests", filter: `user_id=eq.${user.id}` }, () => {
          fetchSuggestions(user.id);
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
        <h1 className="text-white font-bold text-lg">{t.requestsPage.title}</h1>
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
      ) : requests.length === 0 && suggestions.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">{t.requestsPage.empty}</div>
      ) : (
        <div className="px-5 space-y-3 pb-20">
          {suggestions.length > 0 && (
            <>
              <h2 className="text-white font-semibold text-sm pt-1">{t.requestsPage.suggestionsHeading}</h2>
              {suggestions.map((s) => {
                const added = s.status === "accepted";
                const rejected = s.status === "rejected";
                const expired = s.status === "expired";
                // İki ayrı 10 dakikalık pencere: mekanın karar süresi ve
                // onaydan sonra müşterinin şarkıyı çaldırma süresi (0045)
                const deadline = added ? s.play_deadline : s.status === "pending" ? s.expires_at : null;
                const leftMs = deadline ? new Date(deadline).getTime() - tick : 0;
                const clock = `${Math.floor(Math.max(0, leftMs) / 60000)}:${Math.floor((Math.max(0, leftMs) % 60000) / 1000).toString().padStart(2, "0")}`;
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#1a0e2a" }}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center">
                      {s.songs?.album_cover_url ? (
                        <Image src={s.songs.album_cover_url} alt="" width={48} height={48} className="w-full h-full object-cover" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{s.songs?.title ?? s.suggested_title}</p>
                      <p className="text-[#6b7280] text-xs">{s.songs?.artist ?? s.suggested_artist}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium" style={{ color: added ? "#22c55e" : rejected || expired ? "#6b7280" : "#fbbf24" }}>
                        {added ? t.requestsPage.added : rejected ? t.requestsPage.notAdded : expired ? t.requestsPage.expired : t.requestsPage.sent}
                      </p>
                      {/* Süre dolduysa geri sayım yerine tarih gösterilir */}
                      {deadline && leftMs > 0 ? (
                        <p className="mt-0.5 text-xs font-medium" style={{ color: added ? "#22c55e" : "#fbbf24" }}>
                          {fmt(added ? t.requestsPage.playWindow : t.requestsPage.decisionWindow, { t: clock })}
                        </p>
                      ) : (
                        <p className="text-[#6b7280] text-xs mt-0.5">{timeAgo(s.requested_at)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {requests.length > 0 && <h2 className="text-white font-semibold text-sm pt-3">{t.requestsPage.queuedHeading}</h2>}
            </>
          )}
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
                  <p className="text-[#9ca3af] text-xs mt-0.5">{fmt(t.requestsPage.tokensLine, { n: req.tokens_spent })}{req.priority ? t.requestsPage.prioritySuffix : ""}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[#9ca3af] text-xs">{statusLabel(req.status)}</p>
                <p className="text-[#6b7280] text-xs mt-0.5">{timeAgo(req.requested_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
