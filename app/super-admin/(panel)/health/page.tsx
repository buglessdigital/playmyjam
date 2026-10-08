"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, FilterChips, PageHeader, ResolveBar, RowCheckbox, Select, api, useNow } from "@/components/super-admin/ui";
import type { HealthIncident } from "@/app/api/super-admin/health/route";

// Mekan sağlık ekranı YALNIZCA iki şeyi gösterir: kontrol dışı sessizlik
// (mekan müzik isterken ses yok — bilerek duraklatma ve cihazın uyuması
// sayılmaz) ve hatalı sıra (müşteri isteği sırası geldiği hâlde çalmadı).
// Ayrıntı: app/api/super-admin/health/route.ts.

type Tab = "silence" | "queue" | "order";

type VenueHealth = {
  id: string;
  slug: string;
  name: string;
  status: string;
  live: { is_playing: boolean; has_song: boolean; song: string | null; last_heartbeat_at: string | null };
  last24h: { silence: number; order: number };
};

type HealthResponse = { now: string; venues: VenueHealth[]; incidents: HealthIncident[]; suppressed: number };

const REFRESH_MS = 15_000;
// Panelin "oynatıcı çevrimdışı" eşiğiyle aynı
const OFFLINE_MS = 45_000;
const RED = "#f87171";
const MUTED = "#6b7280";

// Sessizliğin öncelikli sebebi (route.ts primaryCause) → sade dil
const CAUSE_TEXT: Record<string, string> = {
  network: "mekan cihazının interneti koptu",
  session: "mekan oturumu düştü",
  youtube: "şarkı YouTube'dan yüklenemedi",
  frozen: "tarayıcı player sayfasını dondurdu",
  external_pause: "müzik dışarıdan duraklatıldı (YouTube / medya tuşu)",
  queue_empty: "kuyruk boşaldı",
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState(false);

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
  const allIncidents = data?.incidents ?? [];
  const allSilences = allIncidents.filter((i) => i.type === "silence");
  const ongoingBy = new Map(
    allSilences.filter((i) => i.type === "silence" && i.ended_by === "ongoing").map((i) => [i.venue_id, i])
  );
  // Sekme sayaçları yalnızca çözülmemişleri sayar
  const open = allIncidents.filter((i) => !i.resolved_at);
  const silences = open.filter((i) => i.type === "silence" && !i.queue_empty);
  const queueEmpty = open.filter((i) => i.type === "silence" && i.queue_empty);
  const orders = open.filter((i) => i.type === "order");
  const inTab = (i: HealthIncident) =>
    tab === "order" ? i.type === "order" : i.type === "silence" && i.queue_empty === (tab === "queue");
  const resolvedInTab = allIncidents.filter((i) => i.resolved_at && inTab(i)).length;
  const shown = allIncidents.filter((i) => inTab(i) && (showResolved || !i.resolved_at));
  // Süren sessizlik henüz bitmedi; çözülmüş olan yeniden işaretlenmez
  const selectable = (i: HealthIncident) => !i.resolved_at && !(i.type === "silence" && i.ended_by === "ongoing");
  const selectableShown = shown.filter(selectable);
  const picked = selectableShown.filter((i) => selected.has(i.id));
  const allPicked = selectableShown.length > 0 && picked.length === selectableShown.length;

  const resetSelection = () => setSelected(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(selectableShown.map((i) => i.id)));

  const resolve = async () => {
    if (picked.length === 0) return;
    setResolving(true);
    try {
      await api("/api/super-admin/health", "POST", {
        incidents: picked.map((i) => ({ id: i.id, venue_id: i.venue_id })),
      });
      const ids = new Set(picked.map((i) => i.id));
      const at = new Date().toISOString();
      // İyimser: bir sonraki yenilemeyi beklemeden listeden düşür
      setData((d) =>
        d && {
          ...d,
          incidents: d.incidents.map((i) => (ids.has(i.id) ? { ...i, resolved_at: at } : i)),
          venues: d.venues.map((v) => {
            const day = Date.now() - 86_400_000;
            let silence = v.last24h.silence;
            let order = v.last24h.order;
            for (const i of d.incidents) {
              if (!ids.has(i.id) || i.venue_id !== v.id) continue;
              if (Date.parse(i.type === "silence" ? i.started_at : i.at) < day) continue;
              if (i.type === "order") order--;
              else if (!i.queue_empty) silence--;
            }
            return { ...v, last24h: { silence: Math.max(0, silence), order: Math.max(0, order) } };
          }),
        }
      );
      resetSelection();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Sağlık"
        subtitle="Yalnızca iki şey: müziğin kontrol dışı durması ve müşteri isteklerinin sırasının bozulması. Bilerek duraklatma, bilgisayarın uyuması/kapatılması ve uyandıktan sonraki ilk 90 sn sayılmaz. Ekran 15 sn'de bir yenilenir."
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
              onClick={() => {
                setVenue(selected ? "" : v.id);
                resetSelection();
              }}
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
          onChange={(t) => {
            setTab(t);
            resetSelection();
          }}
          options={[
            { key: "silence", label: "Kontrol dışı sessizlik", count: silences.length, color: silences.length ? RED : undefined },
            { key: "queue", label: "Kuyruk boş", count: queueEmpty.length },
            { key: "order", label: "Hatalı sıra", count: orders.length, color: orders.length ? RED : undefined },
          ]}
        />
        <div className="flex gap-2">
          <Select
            value={venue}
            onChange={(v) => {
              setVenue(v);
              resetSelection();
            }}
            options={[
              { value: "", label: "Tüm mekanlar" },
              ...(data?.venues ?? []).map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          <Select
            value={days}
            onChange={(d) => {
              setDays(d);
              resetSelection();
            }}
            options={[
              { value: "1", label: "Son 24 saat" },
              { value: "7", label: "Son 7 gün" },
              { value: "30", label: "Son 30 gün" },
            ]}
          />
        </div>
      </div>

      {tab === "silence" && !!data?.suppressed && (
        <p className="mb-3 text-xs text-[#6b7280]">
          Bilgisayar uykudan uyandıktan sonraki ilk 90 sn&apos;deki {data.suppressed} kısa sessizlik sayılmadı
          (Wi-Fi yeniden bağlanırken şarkı baştan yükleniyor).
        </p>
      )}
      {tab === "queue" && queueEmpty.length > 0 && (
        <p className="mb-3 text-xs text-[#6b7280]">
          Çalacak şarkı kalmadığı için müzik durdu. Arıza değil, ayar: mekanın aktif playlist&apos;i yok ya da bitti.
        </p>
      )}

      {data && (
        <ResolveBar
          selectable={selectableShown.length}
          picked={picked.length}
          onToggleAll={toggleAll}
          onResolve={resolve}
          resolving={resolving}
          showResolved={showResolved}
          onToggleShowResolved={() => setShowResolved((v) => !v)}
          resolvedCount={resolvedInTab}
        />
      )}

      {data && shown.length === 0 ? (
        <Empty>
          {resolvedInTab > 0
            ? "Çözülmemiş kayıt kalmadı."
            : tab === "silence"
            ? "Bu aralıkta kontrol dışı sessizlik yok — müzik istendiği sürece çaldı."
            : tab === "queue"
              ? "Bu aralıkta kuyruk hiç tükenmedi."
              : "Bu aralıkta sıra hatası yok — müşteri istekleri sırasıyla çaldı."}
        </Empty>
      ) : (
        <Card className="divide-y divide-white/5">
          {shown.map((i) => (
            <div key={i.id} className="flex gap-3 px-4 py-3" style={i.resolved_at ? { opacity: 0.5 } : undefined}>
              <RowCheckbox checked={selected.has(i.id)} onChange={() => toggle(i.id)} disabled={!selectable(i)} />
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: i.resolved_at ? "#34d399" : i.type === "silence" && i.queue_empty ? MUTED : RED }}
              />
              <div className="min-w-0 flex-1">
                {i.type === "silence" ? (
                  <>
                    <p className="text-sm text-white break-words">
                      {i.seconds === null ? "Müzik sustu (süresi bilinmiyor)" : `Müzik ${duration(i.seconds)} sustu`}
                      {i.song && <span className="text-[#9ca3af]"> · {i.song}</span>}
                    </p>
                    <p className="mt-1 text-xs text-[#9ca3af] break-words">
                      Olası sebep:{" "}
                      {(i.cause && CAUSE_TEXT[i.cause]) ??
                        (i.playing_frozen
                          ? "player çalıyor görünüyordu ama şarkı ilerlemedi"
                          : i.ended_by === "ongoing"
                            ? "sessizlik bitince yazılacak"
                            : i.ended_by === "unknown"
                              ? "bilinmiyor (bitiş kaydı gelmedi)"
                              : "kayıtta sebep yok")}
                    </p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {clock(i.started_at)}
                      {!venue && <> · {venueName.get(i.venue_id) ?? "?"}</>}
                      {" · "}
                      <span style={i.ended_by === "ongoing" ? { color: RED, fontWeight: 600 } : undefined}>
                        {END_TEXT[i.ended_by] ?? END_TEXT.unknown}
                      </span>
                      {i.resolved_at && <> · çözüldü {clock(i.resolved_at)}</>}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white break-words">{i.message}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {clock(i.at)}
                      {!venue && <> · {venueName.get(i.venue_id) ?? "?"}</>}
                      {i.offline && <> · internet kesintisinde player kendi tamponundan çaldı</>}
                      {i.resolved_at && <> · çözüldü {clock(i.resolved_at)}</>}
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
