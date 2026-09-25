"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, FilterChips, PageHeader, Select, api, useNow } from "@/components/super-admin/ui";
import type { HealthIncident } from "@/app/api/super-admin/health/route";

// Mekan sağlık ekranı YALNIZCA iki şeyi gösterir: kontrol dışı sessizlik
// (mekan müzik isterken ses yok — bilerek duraklatma ve cihazın uyuması
// sayılmaz) ve hatalı sıra (müşteri isteği sırası geldiği hâlde çalmadı).
// Ayrıntı: app/api/super-admin/health/route.ts.

type Tab = "silence" | "order";

type VenueHealth = {
  id: string;
  slug: string;
  name: string;
  status: string;
  live: { is_playing: boolean; has_song: boolean; song: string | null; last_heartbeat_at: string | null };
  last24h: { silence: number; order: number };
};

type HealthResponse = { now: string; venues: VenueHealth[]; incidents: HealthIncident[] };

const REFRESH_MS = 15_000;
// Panelin "oynatıcı çevrimdışı" eşiğiyle aynı
const OFFLINE_MS = 45_000;
const RED = "#f87171";
const MUTED = "#6b7280";

// Sessizlik sırasında player'ın gördüğü olaylar → sade dilde olası sebep
const CAUSE_TEXT: Record<string, string> = {
  network_offline: "mekanın interneti koptu",
  network_error: "player sunucuya ulaşamadı",
  offline_fallback: "player sunucuya ulaşamadı",
  page_frozen: "tarayıcı player sayfasını dondurdu",
  tab_throttled: "tarayıcı player sayfasını dondurdu",
  skip_deferred: "pencere arkadaydı, tarayıcı şarkıyı başlatmadı",
  stall: "şarkı YouTube'dan yüklenemedi",
  stall_reload: "şarkı YouTube'dan yüklenemedi",
  stall_gave_up: "şarkı YouTube'dan yüklenemedi",
  youtube_error: "YouTube şarkıyı çalmadı (hata)",
  transient_skip: "YouTube şarkıyı çalmadı (hata)",
  external_pause: "müzik dışarıdan duraklatıldı (YouTube / medya tuşu)",
  idle_silence: "kuyruk boşaldı",
  session_lost: "mekan oturumu düştü",
};

const END_TEXT: Record<string, string> = {
  recovered: "Müzik kendiliğinden geri geldi",
  paused: "Mekan duraklatınca bitti",
  sleep: "Cihaz uykuya geçince/kapanınca bitti",
  closed: "Player penceresi kapatıldı",
  handoff: "Çalma başka cihaza geçti",
  ongoing: "SÜRÜYOR",
  unknown: "Bitişi kaydedilemedi (player kapandı ya da çöktü)",
};

function causeText(causes: string[]): string | null {
  const texts = [...new Set(causes.map((c) => CAUSE_TEXT[c]).filter(Boolean))];
  return texts.length > 0 ? texts.join(", ") : null;
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} sn`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} dk ${seconds % 60} sn`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

function clock(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} ${time}`;
}

// Canlı durum: heartbeat tazeliği + çalma durumu. Sinyali kesilen player burada
// "kapalı" görünür — bilgisayarın kapatılması kontrol dışı sayılmaz.
function liveState(
  v: VenueHealth,
  now: number,
  ongoing: HealthIncident | undefined
): { label: string; color: string; note: string | null } {
  const beat = v.live.last_heartbeat_at;
  if (beat && now - Date.parse(beat) <= OFFLINE_MS) {
    if (ongoing?.type === "silence") {
      const seconds = Math.round((now - Date.parse(ongoing.started_at)) / 1000);
      return { label: "Sessiz", color: RED, note: `Ses yok: ${duration(seconds)}` };
    }
    if (v.live.is_playing) return { label: "Çalıyor", color: "#34d399", note: v.live.song };
    if (v.live.has_song) return { label: "Duraklatıldı", color: "#fbbf24", note: v.live.song };
    return { label: "Açık, çalmıyor", color: RED, note: "Kuyrukta şarkı yok" };
  }
  return { label: "Player kapalı", color: MUTED, note: beat ? `Son sinyal ${ago(beat, now)}` : null };
}

function HealthPageContent() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("silence");
  const [venue, setVenue] = useState<string>("");
  const [days, setDays] = useState<string>("7");
  const now = useNow(5_000);

  // Veri yalnızca promise zincirinde yazılır (efekt içinde senkron setState yok)
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ days });
    if (venue) q.set("venue", venue);
    const load = () =>
      api<HealthResponse>(`/api/super-admin/health?${q}`)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError("");
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : "Yüklenemedi");
        });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [venue, days]);

  const venueName = useMemo(
    () => new Map((data?.venues ?? []).map((v) => [v.id, v.name])),
    [data?.venues]
  );
  const activeVenues = (data?.venues ?? []).filter((v) => v.status === "active");
  const incidents = data?.incidents ?? [];
  const silences = incidents.filter((i) => i.type === "silence");
  const orders = incidents.filter((i) => i.type === "order");
  const shown = tab === "silence" ? silences : orders;
  const ongoingBy = new Map(
    silences.filter((i) => i.type === "silence" && i.ended_by === "ongoing").map((i) => [i.venue_id, i])
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Sağlık"
        subtitle="Yalnızca iki şey: müziğin kontrol dışı durması ve müşteri isteklerinin sırasının bozulması. Bilerek duraklatma ve bilgisayarın kapatılması sayılmaz. Ekran 15 sn'de bir yenilenir."
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {activeVenues.map((v) => {
          const st = liveState(v, now, ongoingBy.get(v.id));
          const selected = venue === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVenue(selected ? "" : v.id)}
              className="text-left"
            >
              <Card
                className="p-4 h-full transition-colors"
                style={selected ? { borderColor: "#f59e0b", background: "rgba(245,158,11,0.06)" } : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold truncate">{v.name}</p>
                  <Badge label={st.label} color={st.color} />
                </div>
                <p className="mt-1 text-xs text-[#9ca3af] truncate min-h-4">{st.note ?? " "}</p>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span style={{ color: v.last24h.silence ? RED : MUTED }}>{v.last24h.silence} sessizlik</span>
                  <span style={{ color: v.last24h.order ? RED : MUTED }}>{v.last24h.order} sıra hatası</span>
                  <span className="text-[#6b7280]">son 24 saat</span>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <FilterChips<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: "silence", label: "Kontrol dışı sessizlik", count: silences.length, color: silences.length ? RED : undefined },
            { key: "order", label: "Hatalı sıra", count: orders.length, color: orders.length ? RED : undefined },
          ]}
        />
        <div className="flex gap-2">
          <Select
            value={venue}
            onChange={setVenue}
            options={[
              { value: "", label: "Tüm mekanlar" },
              ...(data?.venues ?? []).map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          <Select
            value={days}
            onChange={setDays}
            options={[
              { value: "1", label: "Son 24 saat" },
              { value: "7", label: "Son 7 gün" },
              { value: "30", label: "Son 30 gün" },
            ]}
          />
        </div>
      </div>

      {data && shown.length === 0 ? (
        <Empty>
          {tab === "silence"
            ? "Bu aralıkta kontrol dışı sessizlik yok — müzik istendiği sürece çaldı."
            : "Bu aralıkta sıra hatası yok — müşteri istekleri sırasıyla çaldı."}
        </Empty>
      ) : (
        <Card className="divide-y divide-white/5">
          {shown.map((i) => (
            <div key={i.id} className="flex gap-3 px-4 py-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: RED }} />
              <div className="min-w-0 flex-1">
                {i.type === "silence" ? (
                  <>
                    <p className="text-sm text-white break-words">
                      {i.seconds === null ? "Müzik sustu (süresi bilinmiyor)" : `Müzik ${duration(i.seconds)} sustu`}
                      {i.song && <span className="text-[#9ca3af]"> · {i.song}</span>}
                    </p>
                    <p className="mt-1 text-xs text-[#9ca3af] break-words">
                      Olası sebep:{" "}
                      {causeText(i.causes) ??
                        (i.playing_frozen
                          ? "player çalıyor görünüyordu ama şarkı ilerlemedi"
                          : i.ended_by === "ongoing"
                            ? "sessizlik bitince yazılacak"
                            : i.ended_by === "unknown"
                              ? "bilinmiyor (bitiş kaydı gelmedi)"
                              : "player bir aksilik görmedi")}
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {clock(i.started_at)}
                      {!venue && <> · {venueName.get(i.venue_id) ?? "?"}</>}
                      {" · "}
                      <span style={i.ended_by === "ongoing" ? { color: RED, fontWeight: 600 } : undefined}>
                        {END_TEXT[i.ended_by] ?? END_TEXT.unknown}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white break-words">{i.message}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {clock(i.at)}
                      {!venue && <> · {venueName.get(i.venue_id) ?? "?"}</>}
                      {i.offline && <> · internet kesintisinde player kendi tamponundan çaldı</>}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function HealthPage() {
  return (
    <Suspense>
      <HealthPageContent />
    </Suspense>
  );
}
