"use client";

import { useState, useEffect, useMemo, use, Suspense, useCallback } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminPushBanner from "@/components/admin/AdminPushBanner";

interface Props {
  params: Promise<{ venueId: string }>;
}

type Tab = "pending" | "history";

// song_id boş satırlar müşterinin elle yazdığı taleplerdir (bkz. 0023 + 0045):
// onaylanınca şarkı YouTube'da aranıp TEK SEFERLİK çalma hakkı olarak açılır.
type Request = {
  id: string;
  status: string;
  requested_by: string;
  requested_at: string;
  resolved_at: string | null;
  expires_at: string | null;
  play_deadline: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
  songs: {
    title: string;
    artist: string;
    album_cover_url: string;
    youtube_video_id: string;
    duration_ms: number;
  } | null;
};

const SELECT =
  "id, status, requested_by, requested_at, resolved_at, expires_at, play_deadline, suggested_title, suggested_artist, songs(title, artist, album_cover_url, youtube_video_id, duration_ms)";

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  return `${Math.floor(diff / 3600)} sa önce`;
}

function countdown(deadline: string, now: number) {
  const left = Math.max(0, new Date(deadline).getTime() - now);
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function RequestsPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <RequestsPageContent params={params} />
    </Suspense>
  );
}

function RequestsPageContent({ params }: Props) {
  const { venueId } = use(params);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<Request[]>([]);
  const [history, setHistory] = useState<Request[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bildirim üstünden gelinen talep (?act=...): kart en üstte vurgulanır
  const highlightId = searchParams.get("act");
  const actionToken = searchParams.get("t");

  // Geri sayımlar saniyede bir tazelensin
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchRequests = async (venueDbId: string) => {
      const { data: p } = await supabase
        .from("song_requests")
        .select(SELECT)
        .eq("venue_id", venueDbId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (!cancelled && p) setPending(p as unknown as Request[]);

      const { data: h } = await supabase
        .from("song_requests")
        .select(SELECT)
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

  const resolve = useCallback(
    async (id: string, status: "accepted" | "rejected") => {
      const req = pending.find((r) => r.id === id);
      if (!req || busyId) return;
      setError("");
      setBusyId(id);

      // Onay sunucuda YouTube araması yapabiliyor: satır yanıt gelene kadar
      // listede kalır ama düğmeler kilitlenir (yanlışlıkla ikinci karar olmasın).
      const res = await fetch("/api/admin/requests/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          action: status === "accepted" ? "approve" : "reject",
          // Bildirimden gelindiyse jeton da yollanır (oturum düşmüş olsa bile geçer)
          token: highlightId === id ? actionToken ?? undefined : undefined,
        }),
      });

      setBusyId(null);

      if (res.ok) {
        setPending((prev) => prev.filter((r) => r.id !== id));
        setHistory((prev) => [{ ...req, status, resolved_at: new Date().toISOString() }, ...prev]);
        return;
      }

      const body = await res.json().catch(() => null);
      setError(body?.error ?? "İşlem tamamlanamadı");
    },
    [pending, busyId, highlightId, actionToken]
  );

  const list = tab === "pending" ? pending : history;
  // Vurgulanan talep her zaman en üstte
  const orderedList = useMemo(() => {
    if (!highlightId) return list;
    const idx = list.findIndex((r) => r.id === highlightId);
    if (idx <= 0) return list;
    return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  }, [list, highlightId]);

  const suggestionCount = pending.filter((r) => !r.songs).length;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-white font-bold text-2xl mb-2">İstekler</h1>
      <p className="text-[#9ca3af] text-sm mb-6">
        Müşteriler listende olmayan şarkıları <span className="text-white font-medium">talep</span> olarak
        gönderiyor. Onaylarsan şarkı YouTube&apos;dan bulunup{" "}
        <span className="text-white font-medium">10 dakikalığına tek seferlik</span> çalınabilir hale gelir —
        kalıcı listene eklenmez. Karar için senin de 10 dakikan var.
      </p>

      <AdminPushBanner />

      {error && (
        <div className="mb-4 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm text-[#fca5a5]">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(["pending", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2 rounded-xl text-sm font-medium transition-all" style={{ background: tab === t ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.06)", color: tab === t ? "#e91e8c" : "#9ca3af" }}>
            {t === "pending"
              ? `Bekleyen (${pending.length}${suggestionCount > 0 ? ` · ${suggestionCount} talep` : ""})`
              : "Geçmiş"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {orderedList.length === 0 ? (
          <div className="py-10 text-center text-[#6b7280] text-sm">{tab === "pending" ? "Bekleyen istek yok" : "Geçmiş boş"}</div>
        ) : (
          orderedList.map((req, i) => {
            const isSuggestion = !req.songs;
            const title = req.songs?.title ?? req.suggested_title ?? "";
            const artist = req.songs?.artist ?? req.suggested_artist ?? "";
            const highlighted = req.id === highlightId;
            const timeLeft = req.expires_at ? new Date(req.expires_at).getTime() - now : null;
            const outOfTime = timeLeft !== null && timeLeft <= 0;

            return (
              <div
                key={req.id}
                className="flex items-center gap-3 px-5 py-4"
                style={{
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  background: highlighted ? "rgba(233,30,140,0.08)" : undefined,
                }}
              >
                {req.songs?.album_cover_url ? (
                  <Image src={req.songs.album_cover_url} alt="" width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/10 shrink-0 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{title}</p>
                    {isSuggestion && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>Talep</span>
                    )}
                  </div>
                  <p className="text-[#6b7280] text-xs">{artist}</p>
                  <p className="text-[#6b7280] text-xs">
                    {req.requested_by} · {timeAgo(req.requested_at)}
                    {tab === "pending" && req.expires_at && (
                      <span style={{ color: outOfTime ? "#ef4444" : "#fbbf24" }}>
                        {" · "}
                        {outOfTime ? "süre doldu" : `${countdown(req.expires_at, now)} kaldı`}
                      </span>
                    )}
                  </p>
                </div>
                {tab === "pending" ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resolve(req.id, "accepted")}
                      disabled={busyId !== null || outOfTime}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                    >
                      {busyId === req.id ? "..." : "Onayla"}
                    </button>
                    <button
                      onClick={() => resolve(req.id, "rejected")}
                      disabled={busyId !== null}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    >
                      Reddet
                    </button>
                  </div>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full shrink-0" style={{ background: req.status === "accepted" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: req.status === "accepted" ? "#22c55e" : req.status === "expired" ? "#9ca3af" : "#ef4444" }}>
                    {req.status === "accepted" ? "Onaylandı" : req.status === "expired" ? "Süre doldu" : "Reddedildi"}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
