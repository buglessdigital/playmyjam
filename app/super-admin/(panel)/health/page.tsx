"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, FilterChips, PageHeader, Select, api, useNow } from "@/components/super-admin/ui";

// Mekan sağlık ekranı: "müzik beklenmedik şekilde durdu mu, sıra karıştı mı?"
// Kayıtlar 0055 venue_events'ten: player olayları heartbeat'le gelir, kuyruk
// olaylarını veritabanı tetikleyicisi yazar.

type Severity = "info" | "warn" | "error";
type Level = "problems" | "errors" | "all";

type VenueHealth = {
  id: string;
  slug: string;
  name: string;
  status: string;
  live: { is_playing: boolean; has_song: boolean; song: string | null; last_heartbeat_at: string | null };
  last24h: { warn: number; error: number; last: { at: string; message: string } | null };
};

type HealthEvent = {
  id: number;
  venue_id: string;
  at: string;
  category: "player" | "queue";
  kind: string;
  severity: Severity;
  actor: string | null;
  message: string;
  detail: Record<string, unknown> | null;
};

type HealthResponse = { now: string; venues: VenueHealth[]; events: HealthEvent[] };

const REFRESH_MS = 15_000;
// Panelin "oynatıcı çevrimdışı" eşiğiyle aynı
const OFFLINE_MS = 45_000;
// Bundan eski son sinyal "kesinti" değil, player o gün hiç açılmamış demek
// (kapanmadan susan eski oturumlar sinyali sonsuza dek "çalıyor" bırakıyor)
const SIGNAL_LOST_WINDOW_MS = 12 * 60 * 60 * 1000;

const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  error: { label: "Hata", color: "#f87171" },
  warn: { label: "Uyarı", color: "#fbbf24" },
  info: { label: "Bilgi", color: "#9ca3af" },
};

function actorLabel(actor: string | null): string {
  if (!actor) return "";
  if (actor.startsWith("admin-")) return "Mekan paneli";
  if (actor === "autofill") return "Otomatik dolum";
  if (actor === "customer-request") return "Müşteri";
  if (actor.startsWith("player-")) return "Player";
  if (actor.startsWith("cron-")) return "Zamanlanmış iş";
  return actor;
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

// Canlı durum: heartbeat tazeliği + çalma durumu
function liveState(v: VenueHealth, now: number): { label: string; color: string; note: string | null } {
  const beat = v.live.last_heartbeat_at;
  if (beat && now - Date.parse(beat) <= OFFLINE_MS) {
    if (v.live.is_playing) return { label: "Çalıyor", color: "#34d399", note: v.live.song };
    if (v.live.has_song) return { label: "Duraklatıldı", color: "#fbbf24", note: v.live.song };
    return { label: "Açık, çalmıyor", color: "#f87171", note: "Kuyrukta şarkı yok" };
  }
  // Sinyal düzgün kapanışta (sekme kapandı) sıfırlanır; duruyorsa player
  // kapanmadan sustu demektir
  if (beat && now - Date.parse(beat) <= SIGNAL_LOST_WINDOW_MS) {
    return { label: "Sinyal kesildi", color: "#f87171", note: `Son sinyal ${ago(beat, now)}` };
  }
  return { label: "Player kapalı", color: "#6b7280", note: beat ? `Son sinyal ${ago(beat, now)}` : null };
}

function HealthPageContent() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<Level>("problems");
  const [venue, setVenue] = useState<string>("");
  const [days, setDays] = useState<string>("7");
  const now = useNow(5_000);

  // Veri yalnızca promise zincirinde yazılır (efekt içinde senkron setState yok)
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ level, days });
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
  }, [level, venue, days]);

  const venueName = useMemo(
    () => new Map((data?.venues ?? []).map((v) => [v.id, v.name])),
    [data?.venues]
  );
  const activeVenues = (data?.venues ?? []).filter((v) => v.status === "active");

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Sağlık"
        subtitle="Mekanlarda müzik beklenmedik şekilde durdu mu, sıra karıştı mı? Ekran 15 sn'de bir yenilenir."
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {activeVenues.map((v) => {
          const st = liveState(v, now);
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
                  <span style={{ color: v.last24h.error ? "#f87171" : "#6b7280" }}>
                    {v.last24h.error} hata
                  </span>
                  <span style={{ color: v.last24h.warn ? "#fbbf24" : "#6b7280" }}>
                    {v.last24h.warn} uyarı
                  </span>
                  <span className="text-[#6b7280]">son 24 saat</span>
                </div>
                {v.last24h.last && (
                  <p className="mt-2 text-xs text-[#9ca3af] line-clamp-2">
                    {ago(v.last24h.last.at, now)}: {v.last24h.last.message}
                  </p>
                )}
              </Card>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <FilterChips<Level>
          value={level}
          onChange={setLevel}
          options={[
            { key: "problems", label: "Sorunlar" },
            { key: "errors", label: "Yalnızca hatalar", color: "#f87171" },
            { key: "all", label: "Tüm kayıt" },
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

      {data && data.events.length === 0 ? (
        <Empty>
          {level === "all" ? "Bu aralıkta kayıt yok." : "Bu aralıkta sorun kaydı yok — müzik kesintisiz, sıra düzgün."}
        </Empty>
      ) : (
        <Card className="divide-y divide-white/5">
          {(data?.events ?? []).map((e) => {
            const sev = SEVERITY_META[e.severity];
            return (
              <div key={e.id} className="flex gap-3 px-4 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: sev.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white break-words">{e.message}</p>
                  <p className="mt-1 text-xs text-[#6b7280]">
                    {clock(e.at)}
                    {!venue && <> · {venueName.get(e.venue_id) ?? "?"}</>}
                    {" · "}
                    {e.category === "player" ? "Player" : "Sıra"}
                    {actorLabel(e.actor) && <> · {actorLabel(e.actor)}</>}
                  </p>
                </div>
                <div className="shrink-0">
                  <Badge label={sev.label} color={sev.color} />
                </div>
              </div>
            );
          })}
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
