"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmt, useT } from "@/lib/i18n";

// Talebin akıbetini müşteriye GİTMEDEN gösterir: panelin her sayfasında, alt
// gezinmenin hemen üstünde duran şerit. Onay 10 dakikalık bir pencere açıyor
// ve herkes PWA kurup bildirime izin vermiyor — push tek kanal kalırsa onay
// kaçıyordu. Burada uygulama açıksa görmemek mümkün değil.
//
// Veri /venue/[venueId]/requests sayfasıyla aynı: song_requests'in serbest
// metin satırları (suggested_title dolu).
//
// Tazeleme ÜÇ kanaldan: (1) realtime — song_requests Supabase yayınında
// olmayabilir (migration'larda eklenmemiş, panelden açılması bir düğme), o
// yüzden tek başına güvenilmez; (2) aktif talep varken 15 sn'lik yoklama;
// (3) sekmeye geri dönüldüğünde anında. Yoklama yalnızca ekranda gösterilecek
// bir satır varken döner — boştaysa hiç sorgu çıkmaz.

type ActiveRequest = {
  id: string;
  status: string;
  expires_at: string | null;
  play_deadline: string | null;
  suggested_title: string | null;
  suggested_artist: string | null;
  songs: {
    youtube_video_id: string;
    title: string;
    artist: string;
    album_cover_url: string;
  } | null;
};

function clock(ms: number): string {
  const safe = Math.max(0, ms);
  return `${Math.floor(safe / 60000)}:${Math.floor((safe % 60000) / 1000).toString().padStart(2, "0")}`;
}

export default function RequestStatusBar({ venueId }: { venueId: string }) {
  const t = useT();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ActiveRequest[]>([]);
  const [tick, setTick] = useState(() => Date.now());

  // İsteklerim sayfası aynı bilgiyi zaten ayrıntılı gösteriyor — çift geri sayım olmasın
  const onRequestsPage = pathname === `/venue/${venueId}/requests`;

  const load = useCallback(
    async (userId: string, venueDbId: string) => {
      const { data } = await supabase
        .from("song_requests")
        .select(
          "id, status, expires_at, play_deadline, suggested_title, suggested_artist, songs(youtube_video_id, title, artist, album_cover_url)"
        )
        .eq("user_id", userId)
        .eq("venue_id", venueDbId)
        .not("suggested_title", "is", null)
        .in("status", ["pending", "accepted"])
        .order("requested_at", { ascending: false })
        .limit(5);
      setRows((data ?? []) as unknown as ActiveRequest[]);
    },
    [supabase]
  );

  // Yoklama efekti aynı sorguyu tekrar kurmasın diye tazeleyici ref'te durur
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (onRequestsPage) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cleanupListeners = () => {};

    (async () => {
      // getSession lokal cache'ten okur — ağ çağrısı yapmaz
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || cancelled) return;

      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .or(`id.eq.${venueId},slug.eq.${venueId}`)
        .single();
      if (!venue || cancelled) return;

      await load(user.id, venue.id as string);
      if (cancelled) return;

      const refresh = () => load(user.id, venue.id as string);

      channel = supabase
        .channel(`req_bar:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "song_requests", filter: `user_id=eq.${user.id}` },
          refresh
        )
        .subscribe();

      // Sekmeye/uygulamaya dönüş: bekletilen soru "onaylandı mı" — hemen sor
      const onVisible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", refresh);
      // Talep gönderildiği anda şerit belirsin (bkz. BrowseClient)
      window.addEventListener("pmj-suggestion-sent", refresh);
      cleanupListeners = () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", refresh);
        window.removeEventListener("pmj-suggestion-sent", refresh);
      };
      refreshRef.current = refresh;
    })();

    return () => {
      cancelled = true;
      cleanupListeners();
      refreshRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, venueId, load, onRequestsPage]);

  // Geri sayım ve yoklama yalnızca gösterilecek satır varken döner
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (!hasRows) return;
    const ticker = setInterval(() => setTick(Date.now()), 1000);
    const poller = setInterval(() => {
      if (document.visibilityState === "visible") refreshRef.current?.();
    }, 15000);
    return () => {
      clearInterval(ticker);
      clearInterval(poller);
    };
  }, [hasRows]);

  if (onRequestsPage) return null;

  // Onaylanan talep beklemedekinin önüne geçer: süresi işleyen ve aksiyon
  // isteyen tek durum o
  const approved = rows.find(
    (r) => r.status === "accepted" && r.play_deadline && new Date(r.play_deadline).getTime() > tick
  );
  const pending = rows.find(
    (r) => r.status === "pending" && (!r.expires_at || new Date(r.expires_at).getTime() > tick)
  );
  const row = approved ?? pending;
  if (!row) return null;

  const isApproved = row === approved;
  const deadline = isApproved ? row.play_deadline : row.expires_at;
  const left = deadline ? new Date(deadline).getTime() - tick : 0;
  const title = row.songs?.title ?? row.suggested_title ?? "";
  const artist = row.songs?.artist ?? row.suggested_artist ?? "";
  const cover = row.songs?.album_cover_url;

  // Onaylanan şarkının kendi sayfası: jeton seçimi ve ekleme orada
  const href = isApproved && row.songs?.youtube_video_id
    ? `/venue/${venueId}/song/${row.songs.youtube_video_id}`
    : `/venue/${venueId}/requests`;

  return (
    <Link
      href={href}
      // Alt gezinme 4rem; şerit onun hemen üstünde durur
      className="fixed inset-x-0 bottom-16 z-40 block px-3 pb-2"
    >
      <div
        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur-md ${
          isApproved
            ? "border-[#22c55e]/40 shadow-[0_10px_30px_-14px_rgba(34,197,94,0.9)]"
            : "border-[#fbbf24]/30"
        }`}
        style={{
          background: isApproved
            ? "linear-gradient(120deg, rgba(34,197,94,0.22), rgba(15,10,24,0.96) 65%)"
            : "linear-gradient(120deg, rgba(251,191,36,0.14), rgba(15,10,24,0.96) 65%)",
        }}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
          {cover ? (
            <Image src={cover} alt="" width={40} height={40} sizes="40px" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold ${isApproved ? "text-[#22c55e]" : "text-[#fbbf24]"}`}>
            {isApproved ? t.requestBar.approvedTitle : t.requestBar.pendingTitle}
          </p>
          <p className="truncate text-xs text-white">
            {title}
            {artist ? <span className="text-[#9ca3af]"> · {artist}</span> : null}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9ca3af]">
            {fmt(isApproved ? t.requestBar.approvedCountdown : t.requestBar.pendingCountdown, { t: clock(left) })}
          </p>
        </div>

        {isApproved ? (
          <span
            className="flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
          >
            {t.requestBar.addCta}
          </span>
        ) : (
          <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </div>
    </Link>
  );
}
