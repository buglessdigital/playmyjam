"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, FilterChips, PageHeader, ResolveBar, RowCheckbox, Select, Stat, api, useNow } from "@/components/super-admin/ui";
import type { OpsSummary, PushDeliveryRow, PushFilter, SystemEventRow } from "@/app/api/super-admin/issues/route";

// Sorunlar ekranı: mekanda sessizce ters giden her şey — bildirimlerin akıbeti
// (gitti mi, telefonda göründü mü, neden gitmedi) ve sunucunun yakaladığı
// hatalar (ödeme, cron, kuyruk, yakalanmamış istek hataları). Müziğin susması
// ve sıra hataları Sağlık ekranında. Ayrıntı: app/api/super-admin/issues/route.ts.

type Tab = "push" | "events";

type IssuesResponse = {
  now: string;
  venues: { id: string; name: string }[];
  summary: OpsSummary;
  deliveries: PushDeliveryRow[];
  events: SystemEventRow[];
};

const REFRESH_MS = 30_000;
// API'nin "doğrulanmadı" eşiğiyle aynı
const UNCONFIRMED_AFTER_MS = 5 * 60_000;
const RED = "#f87171";
const AMBER = "#fbbf24";
const GREEN = "#34d399";
const MUTED = "#6b7280";

const KIND_TEXT: Record<string, string> = {
  song_playing: "Şarkın çalıyor",
  request_new: "Yeni şarkı talebi",
  request_approved: "Talep onaylandı",
  request_rejected: "Talep reddedildi",
  suggestion_added: "Öneri listeye eklendi",
  subscribe_test: "Bildirim açma testi",
};

const AREA_TEXT: Record<string, string> = {
  push: "Bildirim",
  payment: "Ödeme",
  cron: "Zamanlanmış iş",
  queue: "Kuyruk",
  server: "Sunucu hatası",
};

function clock(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} ${time}`;
}

function percent(part: number, total: number): string {
  return total > 0 ? `%${Math.round((part / total) * 100)}` : "—";
}

// Teslimin tek bakışta durumu + neden
function deliveryState(d: PushDeliveryRow, now: number): { label: string; color: string; why: string | null } {
  switch (d.status) {
    case "no_device":
      return {
        label: "Cihaz yok",
        color: AMBER,
        why:
          d.error ??
          (d.audience === "admin"
            ? "Mekan panelinde bildirimler hiç açılmamış"
            : "Müşteri bildirim izni vermemiş"),
      };
    case "not_configured":
      return { label: "Yapılandırma yok", color: RED, why: d.error };
    case "failed":
      return { label: "Gönderilemedi", color: RED, why: d.error };
    case "partial":
      return { label: "Kısmen gitti", color: AMBER, why: `${d.accepted}/${d.devices} cihaz · ${d.error ?? ""}` };
  }
  if (d.clicked_at) return { label: "Açıldı", color: GREEN, why: null };
  if (d.shown_at) return { label: "Telefonda göründü", color: GREEN, why: null };
  if (now - Date.parse(d.created_at) > UNCONFIRMED_AFTER_MS) {
    return {
      label: "Doğrulanmadı",
      color: AMBER,
      why: "Push servisi kabul etti ama cihazdan gösterim onayı gelmedi (telefon kapalı/çevrimdışı, pil tasarrufu ya da eski uygulama sürümü)",
    };
  }
  return { label: "Gönderildi", color: MUTED, why: "Gösterim onayı bekleniyor" };
}

function IssuesPageContent() {
  const [data, setData] = useState<IssuesResponse | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("push");
  const [pushFilter, setPushFilter] = useState<PushFilter>("problems");
  const [area, setArea] = useState<string>("");
  const [venue, setVenue] = useState<string>("");
  const [days, setDays] = useState<string>("7");
  const now = useNow(15_000);
  // Seçim, açık sekmenin kayıtlarıdır (bildirim uuid'si ya da sistem olayı id'si)
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Çözüldü işaretinden sonra özet sayıları tazelemek için
  const [reload, setReload] = useState(0);

  // Veri yalnızca promise zincirinde yazılır (efekt içinde senkron setState yok)
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ days, push: pushFilter });
    if (venue) q.set("venue", venue);
    if (area) q.set("area", area);
    if (showResolved) q.set("resolved", "1");
    const load = () =>
      api<IssuesResponse>(`/api/super-admin/issues?${q}`)
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
  }, [venue, days, pushFilter, area, showResolved, reload]);

  const venueName = useMemo(() => new Map((data?.venues ?? []).map((v) => [v.id, v.name])), [data?.venues]);
  const s = data?.summary;
  const push = s?.push;
  const pushProblems = push?.open_problems ?? 0;

  const deliveries = data?.deliveries ?? [];
  const events = data?.events ?? [];
  const rowIds = tab === "push" ? deliveries.filter((d) => !d.resolved_at).map((d) => d.id) : events.filter((e) => !e.resolved_at).map((e) => String(e.id));
  const picked = rowIds.filter((id) => selected.has(id));

  // Süzgeç/sekme değişince seçim sıfırlanır: görünmeyen kayıt işaretlenmesin
  const resetting =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setSelected(new Set());
    };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(picked.length === rowIds.length ? new Set() : new Set(rowIds));

  const resolve = async () => {
    if (picked.length === 0) return;
    setResolving(true);
    try {
      await api(
        "/api/super-admin/issues",
        "POST",
        tab === "push" ? { push: picked } : { events: picked.map(Number) }
      );
      const ids = new Set(picked);
      const at = new Date().toISOString();
      // İyimser: listeden düşür (ya da çözülenler açıksa soldur); sayılar tazelenir
      setData(
        (d) =>
          d && {
            ...d,
            deliveries:
              tab === "push"
                ? showResolved
                  ? d.deliveries.map((x) => (ids.has(x.id) ? { ...x, resolved_at: at } : x))
                  : d.deliveries.filter((x) => !ids.has(x.id))
                : d.deliveries,
            events:
              tab === "events"
                ? showResolved
                  ? d.events.map((x) => (ids.has(String(x.id)) ? { ...x, resolved_at: at } : x))
                  : d.events.filter((x) => !ids.has(String(x.id)))
                : d.events,
          }
      );
      setSelected(new Set());
      setReload((n) => n + 1);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setResolving(false);
    }
  };

  const resolveBar = data && (
    <ResolveBar
      selectable={rowIds.length}
      picked={picked.length}
      onToggleAll={toggleAll}
      onResolve={resolve}
      resolving={resolving}
      showResolved={showResolved}
      onToggleShowResolved={() => {
        setShowResolved((v) => !v);
        setSelected(new Set());
      }}
    />
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Sorunlar"
        subtitle={
          <>
            Bildirimlerin akıbeti ve sunucunun yakaladığı hatalar. Müziğin susması ve sıra hataları{" "}
            <Link href="/super-admin/health" className="underline text-[#9ca3af]">
              Sağlık
            </Link>{" "}
            ekranında. Ekran 30 sn&apos;de bir yenilenir.
          </>
        }
        action={
          <div className="flex gap-2">
            <Select
              value={venue}
              onChange={resetting(setVenue)}
              options={[{ value: "", label: "Tüm mekanlar" }, ...(data?.venues ?? []).map((v) => ({ value: v.id, label: v.name }))]}
            />
            <Select
              value={days}
              onChange={resetting(setDays)}
              options={[
                { value: "1", label: "Son 24 saat" },
                { value: "7", label: "Son 7 gün" },
                { value: "30", label: "Son 30 gün" },
              ]}
            />
          </div>
        }
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {s && push && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-8">
          <Stat
            label="Telefonda göründü"
            value={percent(push.shown, push.total)}
            sub={`${push.shown} / ${push.total} bildirim`}
            tone={push.total === 0 ? undefined : push.shown / push.total >= 0.8 ? "good" : "warn"}
          />
          <Stat label="Cihazı yok" value={push.no_device} sub="izin yok / abonelik düşmüş" tone={push.no_device ? "warn" : undefined} />
          <Stat label="Gönderilemedi" value={push.failed} sub="push servisi reddetti" tone={push.failed ? "danger" : undefined} />
          <Stat label="Doğrulanmadı" value={push.unconfirmed} sub="gitti, gösterim onayı yok" tone={push.unconfirmed ? "warn" : undefined} />
          <Stat
            label="Sistem hataları"
            value={s.events.error}
            sub={`+ ${s.events.warn} uyarı`}
            tone={s.events.error ? "danger" : s.events.warn ? "warn" : undefined}
          />
        </div>
      )}

      <div className="mb-4">
        <FilterChips<Tab>
          value={tab}
          onChange={resetting(setTab)}
          options={[
            { key: "push", label: "Bildirimler", count: pushProblems, color: pushProblems ? AMBER : undefined },
            { key: "events", label: "Sistem hataları", count: s?.events.open ?? 0, color: s?.events.error ? RED : undefined },
          ]}
        />
      </div>

      {tab === "push" ? (
        <>
          {s && s.push_by_kind.length > 0 && (
            <Card className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6b7280]">
                    <th className="px-4 py-2 font-medium">Bildirim</th>
                    <th className="px-3 py-2 font-medium text-right">Toplam</th>
                    <th className="px-3 py-2 font-medium text-right">Göründü</th>
                    <th className="px-3 py-2 font-medium text-right">Cihaz yok</th>
                    <th className="px-4 py-2 font-medium text-right">Başarısız</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {s.push_by_kind.map((k) => (
                    <tr key={`${k.kind}-${k.audience}`}>
                      <td className="px-4 py-2 text-white">
                        {KIND_TEXT[k.kind] ?? k.kind}
                        <span className="text-[#6b7280]"> · {k.audience === "admin" ? "mekan" : "müşteri"}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#d1d5db]">{k.total}</td>
                      <td className="px-3 py-2 text-right text-[#d1d5db]">
                        {k.shown} <span className="text-[#6b7280]">({percent(k.shown, k.total)})</span>
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: k.no_device ? AMBER : MUTED }}>{k.no_device}</td>
                      <td className="px-4 py-2 text-right" style={{ color: k.failed ? RED : MUTED }}>{k.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="mb-3">
            <FilterChips<PushFilter>
              value={pushFilter}
              onChange={resetting(setPushFilter)}
              options={[
                { key: "problems", label: "Sorunlu olanlar" },
                { key: "no_device", label: "Cihaz yok" },
                { key: "failed", label: "Gönderilemedi" },
                { key: "unconfirmed", label: "Doğrulanmadı" },
                { key: "all", label: "Hepsi" },
              ]}
            />
          </div>

          {resolveBar}

          {data && deliveries.length === 0 ? (
            <Empty>
              {pushFilter === "all" ? "Bu aralıkta bildirim gönderilmedi." : "Bu aralıkta sorunlu bildirim yok — hepsi telefona ulaştı."}
            </Empty>
          ) : (
            <Card className="divide-y divide-white/5">
              {deliveries.map((d) => {
                const st = deliveryState(d, now);
                return (
                  <div key={d.id} className="flex gap-3 px-4 py-3" style={d.resolved_at ? { opacity: 0.5 } : undefined}>
                    <RowCheckbox checked={selected.has(d.id)} onChange={() => toggle(d.id)} disabled={!!d.resolved_at} />
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: st.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-white">{KIND_TEXT[d.kind] ?? d.kind}</p>
                        <Badge label={st.label} color={st.color} />
                      </div>
                      {d.title && <p className="mt-0.5 text-xs text-[#9ca3af] break-words">{d.title}</p>}
                      {st.why && <p className="mt-1 text-xs break-words" style={{ color: st.color === MUTED ? MUTED : "#d1d5db" }}>{st.why}</p>}
                      <p className="mt-1 text-xs text-[#6b7280]">
                        {clock(d.created_at)}
                        {!venue && d.venue_id && <> · {venueName.get(d.venue_id) ?? "?"}</>}
                        {" · "}
                        {d.audience === "admin" ? "Mekan admini" : "Müşteri"}
                        {d.recipient && <>: {d.recipient}</>}
                        {d.devices > 0 && <> · {d.devices} cihaz</>}
                        {d.shown_at && <> · göründü {clock(d.shown_at)}</>}
                        {d.resolved_at && <> · çözüldü {clock(d.resolved_at)}</>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="mb-3">
            <FilterChips<string>
              value={area}
              onChange={resetting(setArea)}
              options={[
                { key: "", label: "Tümü" },
                ...Object.entries(s?.events_by_area ?? {}).map(([key, count]) => ({
                  key,
                  label: AREA_TEXT[key] ?? key,
                  count,
                })),
              ]}
            />
          </div>

          {resolveBar}

          {data && events.length === 0 ? (
            <Empty>Bu aralıkta sistem hatası yok.</Empty>
          ) : (
            <Card className="divide-y divide-white/5">
              {events.map((e) => (
                <div key={e.id} className="flex gap-3 px-4 py-3" style={e.resolved_at ? { opacity: 0.5 } : undefined}>
                  <RowCheckbox
                    checked={selected.has(String(e.id))}
                    onChange={() => toggle(String(e.id))}
                    disabled={!!e.resolved_at}
                  />
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.severity === "error" ? RED : AMBER }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label={AREA_TEXT[e.area] ?? e.area} color={e.severity === "error" ? RED : AMBER} />
                      <p className="text-sm text-white break-words">{e.message}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {clock(e.at)}
                      {!venue && e.venue_id && <> · {venueName.get(e.venue_id) ?? "?"}</>}
                      {" · "}
                      <span className="font-mono">{e.kind}</span>
                      {e.resolved_at && <> · çözüldü {clock(e.resolved_at)}</>}
                    </p>
                    {e.detail && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-[#9ca3af]">Ayrıntı</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 text-[11px] text-[#9ca3af]">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function IssuesPage() {
  return (
    <Suspense>
      <IssuesPageContent />
    </Suspense>
  );
}
