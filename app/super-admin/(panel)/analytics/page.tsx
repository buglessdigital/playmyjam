"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ACCENT, Card, Empty, ErrorBox, FilterChips, PageHeader, Select, Stat, api } from "@/components/super-admin/ui";
import type { UiAnalytics, UiHeatmap } from "@/app/api/super-admin/ui-analytics/route";

// Müşteri paneli arayüz analizi: mekan mekan hangi sayfaya gidildiği, nereye
// tıklandığı, nerede takılındığı. Kayıt: lib/ui-track.ts → 0058 ui_events.

type Venue = { id: string; slug: string; name: string; status: string };
type Response = { venues: Venue[]; stats: UiAnalytics };

type HeatMode = "screen" | "page";
type HeatFilter = "all" | "dead" | "rage";
type TargetView = "label" | "group";
type TargetIssue = "all" | "dead" | "rage";

const RED = "#f87171";
const MUTED = "#6b7280";
// Isı haritası tek tonlu (sıralı): yoğunluk opaklıkla artar
const HEAT = "249,115,22";
// Önizleme çerçevesi: yaygın telefon ekranı
const FRAME_W = 390;
const FRAME_H = 844;
const PREVIEW_W = 300;

const PAGE_NAMES: Record<string, string> = {
  "/": "Mekan ana adresi",
  "/browse": "Gözat",
  "/queue": "Sıra",
  "/tokens": "Jeton al",
  "/song/:id": "Şarkı detayı",
  "/login": "Giriş",
  "/onay": "Onay",
  "/profile": "Profil",
  "/history": "Geçmiş",
  "/favorites": "Favoriler",
  "/requests": "İsteklerim",
  "/settings": "Ayarlar",
  "/payment-methods": "Kayıtlı kartlar",
};
const pageName = (p: string) => PAGE_NAMES[p] ?? p;

const pct = (n: number, d: number) => (d > 0 ? `%${Math.round((n / d) * 100)}` : "—");

function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} dk ${s % 60} sn` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-white font-semibold text-sm">{children}</h2>
      {hint && <p className="text-[#6b7280] text-xs mt-0.5">{hint}</p>}
    </div>
  );
}

function Bar({ value, max, color = ACCENT }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// --- Huni ------------------------------------------------------------------

function Funnel({ f, actions }: { f: UiAnalytics["funnel"]; actions: Record<string, number> }) {
  const steps = [
    { label: "Paneli açan oturum", n: f.sessions },
    { label: "Herhangi bir yere tıklayan", n: f.interacted },
    { label: "Gözat'a giden", n: f.browse },
    { label: "Sıraya şarkı ekleyen", n: f.added, note: actions.song_added ? `${actions.song_added} şarkı` : undefined },
    { label: "İstek / öneri gönderen", n: f.requested },
    { label: "Jeton sayfasını açan", n: f.tokens },
    { label: "Ödemeye geçen", n: f.checkout, note: actions.checkout_started ? `${actions.checkout_started} deneme` : undefined },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s) => (
        <div key={s.label} title={`${s.n} oturum · ${pct(s.n, f.sessions)}`}>
          <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
            <span className="text-[#d1d5db] truncate">{s.label}</span>
            <span className="text-white font-medium tabular-nums whitespace-nowrap">
              {s.n} <span className="text-[#6b7280] font-normal">{pct(s.n, f.sessions)}</span>
              {s.note && <span className="text-[#6b7280] font-normal"> · {s.note}</span>}
            </span>
          </div>
          <Bar value={s.n} max={f.sessions} />
        </div>
      ))}
    </div>
  );
}

// --- Saat dağılımı -----------------------------------------------------------

function Hours({ hours }: { hours: Record<string, number> }) {
  const values = Array.from({ length: 24 }, (_, h) => hours[String(h)] ?? 0);
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-end gap-[2px] h-28" onMouseLeave={() => setHover(null)}>
        {values.map((v, h) => (
          <div key={h} className="flex-1 h-full flex items-end" onMouseEnter={() => setHover(h)}>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(v / max) * 100}%`,
                minHeight: v > 0 ? 2 : 0,
                background: ACCENT,
                opacity: hover === null || hover === h ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-[#6b7280] mt-1 tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="text-xs text-[#9ca3af] mt-2 h-4">
        {hover !== null ? `${String(hover).padStart(2, "0")}:00–${String(hover).padStart(2, "0")}:59 · ${values[hover]} oturum başladı` : " "}
      </p>
    </div>
  );
}

// --- Isı haritası ----------------------------------------------------------

function Heatmap({
  venue,
  days,
  page,
  pages,
  onPage,
}: {
  venue: string;
  days: string;
  page: string;
  pages: string[];
  onPage: (p: string) => void;
}) {
  const [mode, setMode] = useState<HeatMode>("screen");
  const [filter, setFilter] = useState<HeatFilter>("all");
  const [data, setData] = useState<UiHeatmap | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; n: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!page) return;
    let alive = true;
    const q = new URLSearchParams({ days, heatmap: page, mode, filter });
    if (venue) q.set("venue", venue);
    api<UiHeatmap>(`/api/super-admin/ui-analytics?${q}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Yüklenemedi"));
    return () => {
      alive = false;
    };
  }, [venue, days, page, mode, filter]);

  const frameH = mode === "page" ? Math.min(8000, Math.max(FRAME_H, (data?.max_py ?? 0) + 120)) : FRAME_H;
  const scale = PREVIEW_W / FRAME_W;
  const viewH = Math.round(frameH * scale);
  // Koordinatlar: x binde (ekran genişliği), y binde (ekran) ya da piksel (sayfa)
  const toView = (bx: number, by: number) => ({
    x: (bx / 1000) * PREVIEW_W,
    y: mode === "page" ? by * scale : (by / 1000) * FRAME_H * scale,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PREVIEW_W * dpr;
    canvas.height = viewH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, viewH);
    const points = data?.points ?? [];
    const max = Math.max(1, ...points.map((p) => p[2]));
    const r = 14;
    for (const [bx, by, n] of points) {
      const { x, y } = toView(bx, by);
      const a = 0.18 + 0.7 * Math.sqrt(n / max);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${HEAT},${a})`);
      g.addColorStop(1, `rgba(${HEAT},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // toView yalnızca mode/viewH'ye bağlı; ikisi de bağımlılıkta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, viewH, mode]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: { x: number; y: number; n: number; d: number } | null = null;
    for (const [bx, by, n] of data?.points ?? []) {
      const { x, y } = toView(bx, by);
      const d = Math.hypot(x - mx, y - my);
      if (d < 16 && (!best || d < best.d)) best = { x, y, n, d };
    }
    setHover(best ? { x: best.x, y: best.y, n: best.n } : null);
  };

  const src = data?.sample_path ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
      <div className="mx-auto" style={{ width: PREVIEW_W }}>
        <div
          className="relative rounded-2xl overflow-hidden border border-white/15 bg-black"
          style={{ width: PREVIEW_W, height: viewH }}
        >
          {src ? (
            <iframe
              key={`${src}-${frameH}`}
              src={src}
              title="Sayfa önizlemesi"
              tabIndex={-1}
              className="absolute top-0 left-0 origin-top-left pointer-events-none"
              style={{ width: FRAME_W, height: frameH, transform: `scale(${scale})`, border: 0, opacity: 0.55 }}
            />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-[#6b7280] p-6 text-center">
              Bu sayfa için önizleme adresi yok
            </p>
          )}
          <canvas
            ref={canvasRef}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            className="absolute top-0 left-0"
            style={{ width: PREVIEW_W, height: viewH }}
          />
          {hover && (
            <div
              className="absolute pointer-events-none text-[11px] px-2 py-1 rounded-md bg-black/85 text-white whitespace-nowrap border border-white/15"
              style={{ left: Math.min(hover.x + 10, PREVIEW_W - 90), top: Math.max(hover.y - 30, 4) }}
            >
              {hover.n} tıklama
            </div>
          )}
        </div>
        <p className="text-[11px] text-[#6b7280] mt-2 text-center">
          {data ? `${data.total} tıklama` : "Yükleniyor…"} · önizleme bugünkü hâli gösterir
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <Select
          label="Sayfa"
          value={page}
          onChange={onPage}
          options={pages.map((p) => ({ value: p, label: `${pageName(p)} (${p})` }))}
        />
        <div>
          <p className="text-[#9ca3af] text-xs mb-1.5">Konum</p>
          <FilterChips<HeatMode>
            value={mode}
            onChange={setMode}
            options={[
              { key: "screen", label: "Ekrana göre" },
              { key: "page", label: "Sayfa boyunca" },
            ]}
          />
          <p className="text-[#6b7280] text-xs mt-2">
            {mode === "screen"
              ? "Parmağın ekranın neresine gittiği — alt menü gibi sabit öğeler ve başparmak erişimi için. Kaydırılmış içerik üst üste biner."
              : "Sayfanın başından itibaren konum — uzun listelerde ne kadar aşağı inildiğini gösterir. Sabit öğeler burada dağınık görünür."}
          </p>
        </div>
        <div>
          <p className="text-[#9ca3af] text-xs mb-1.5">Tıklama türü</p>
          <FilterChips<HeatFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { key: "all", label: "Tümü" },
              { key: "dead", label: "Ölü tıklama", color: RED },
              { key: "rage", label: "Öfke tıklaması", color: RED },
            ]}
          />
          <p className="text-[#6b7280] text-xs mt-2">
            Ölü tıklama: tıklanabilir olmayan bir yere dokunma — müşteri orayı düğme sanıyor. Öfke tıklaması: 1 sn içinde aynı
            noktaya 3+ dokunma — bir şey tepki vermiyor ya da yavaş.
          </p>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </div>
  );
}

// --- Tıklanan öğeler -----------------------------------------------------------

type TargetRow = { key: string; page: string; label: string; examples: string[]; clicks: number; sessions: number; dead: number; rage: number };

function Targets({ rows, page }: { rows: UiAnalytics["targets"]; page: string }) {
  const [view, setView] = useState<TargetView>("label");
  const [issue, setIssue] = useState<TargetIssue>("all");
  const [onlyPage, setOnlyPage] = useState(false);

  const shown = useMemo(() => {
    const base = onlyPage ? rows.filter((r) => r.page === page) : rows;
    let out: TargetRow[];
    if (view === "label") {
      const m = new Map<string, TargetRow>();
      for (const r of base) {
        const label = r.target ?? "(adsız)";
        const key = `${r.page}|${label}`;
        const cur = m.get(key) ?? { key, page: r.page, label, examples: [], clicks: 0, sessions: 0, dead: 0, rage: 0 };
        cur.clicks += r.clicks;
        cur.sessions += r.sessions;
        cur.dead += r.dead;
        cur.rage += r.rage;
        m.set(key, cur);
      }
      out = [...m.values()];
    } else {
      // Aynı yapıdaki öğeler (ör. her şarkı satırı) tek satır
      const m = new Map<string, TargetRow>();
      for (const r of base) {
        const key = `${r.page}|${r.sel ?? "?"}`;
        const cur = m.get(key) ?? { key, page: r.page, label: r.sel ?? "?", examples: [], clicks: 0, sessions: 0, dead: 0, rage: 0 };
        cur.clicks += r.clicks;
        cur.sessions += r.sessions;
        cur.dead += r.dead;
        cur.rage += r.rage;
        if (r.target && cur.examples.length < 3 && !cur.examples.includes(r.target)) cur.examples.push(r.target);
        m.set(key, cur);
      }
      out = [...m.values()];
    }
    if (issue === "dead") out = out.filter((r) => r.dead > 0).sort((a, b) => b.dead - a.dead);
    else if (issue === "rage") out = out.filter((r) => r.rage > 0).sort((a, b) => b.rage - a.rage);
    else out.sort((a, b) => b.clicks - a.clicks);
    return out.slice(0, 60);
  }, [rows, view, issue, onlyPage, page]);

  const max = Math.max(1, ...shown.map((r) => (issue === "dead" ? r.dead : issue === "rage" ? r.rage : r.clicks)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChips<TargetIssue>
          value={issue}
          onChange={setIssue}
          options={[
            { key: "all", label: "En çok tıklanan" },
            { key: "dead", label: "Ölü tıklama alan", color: RED },
            { key: "rage", label: "Öfke tıklaması alan", color: RED },
          ]}
        />
        <span className="w-px h-5 bg-white/10 mx-1" />
        <FilterChips<TargetView>
          value={view}
          onChange={setView}
          options={[
            { key: "label", label: "Öğe adına göre" },
            { key: "group", label: "Benzer öğeleri birleştir" },
          ]}
        />
        <button
          type="button"
          onClick={() => setOnlyPage((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-xl font-medium"
          style={{
            background: onlyPage ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
            color: onlyPage ? ACCENT : "#9ca3af",
          }}
        >
          Yalnız {pageName(page) || "seçili sayfa"}
        </button>
      </div>
      {shown.length === 0 ? (
        <Empty>Bu filtrede tıklama yok.</Empty>
      ) : (
        <Card className="divide-y divide-white/5">
          {shown.map((r) => {
            const v = issue === "dead" ? r.dead : issue === "rage" ? r.rage : r.clicks;
            const bad = r.dead + r.rage;
            return (
              <div key={r.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-white break-words min-w-0" style={view === "group" ? { fontFamily: "monospace", fontSize: 12 } : undefined}>
                    {r.label}
                  </p>
                  <p className="text-xs tabular-nums whitespace-nowrap text-white">
                    {r.clicks} <span className="text-[#6b7280]">tık · {r.sessions} oturum</span>
                  </p>
                </div>
                {r.examples.length > 0 && (
                  <p className="text-xs text-[#9ca3af] mt-0.5 truncate">ör. {r.examples.join(" · ")}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1">
                    <Bar value={v} max={max} color={issue === "all" ? ACCENT : RED} />
                  </div>
                  <p className="text-[11px] whitespace-nowrap text-[#6b7280]">
                    {pageName(r.page)}
                    {bad > 0 && (
                      <span style={{ color: RED }}>
                        {r.dead > 0 && ` · ${r.dead} ölü`}
                        {r.rage > 0 && ` · ${r.rage} öfke`}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

// --- Sayfa -------------------------------------------------------------------

function AnalyticsContent() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [venue, setVenue] = useState("");
  const [days, setDays] = useState("7");
  const [page, setPage] = useState("");

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ days });
    if (venue) q.set("venue", venue);
    api<Response>(`/api/super-admin/ui-analytics?${q}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Yüklenemedi"));
    return () => {
      alive = false;
    };
  }, [venue, days]);

  const s = data?.stats;
  const pages = useMemo(() => (s?.pages ?? []).map((p) => p.page), [s?.pages]);
  // Seçili sayfa bu aralıkta yoksa en çok görüntülenene düş
  const heatPage = page && pages.includes(page) ? page : pages[0] ?? "";
  const maxViews = Math.max(1, ...(s?.pages ?? []).map((p) => p.views));
  const maxFlow = Math.max(1, ...(s?.flows ?? []).map((f) => f.n));
  const t = s?.totals;
  const dev = s?.devices;
  const devTotal = dev ? dev.pwa + dev.browser : 0;

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Arayüz Analizi"
        subtitle="Müşteri panelinde hangi sayfaya gidildiği, nereye tıklandığı, nerede takılındığı. Anonim: kimlik ve yazılan metin kaydedilmez."
        action={
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
                { value: "90", label: "Son 90 gün" },
              ]}
            />
          </div>
        }
      />

      {error && <ErrorBox>{error}</ErrorBox>}

      {s && t && t.sessions === 0 ? (
        <Empty>
          Bu aralıkta kayıt yok. Kayıt, müşteri panelinin bu özellikle yayımlanmasından sonra başlar.
        </Empty>
      ) : s && t ? (
        <div className="space-y-8">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Stat label="Oturum" value={t.sessions} sub={`${pct(t.bounce, t.sessions)} hemen çıktı`} />
            <Stat label="Oturum başına sayfa" value={(t.views / Math.max(1, t.sessions)).toFixed(1)} sub={`${t.views} görüntüleme`} />
            <Stat label="Ort. oturum süresi" value={duration(t.avg_session_seconds)} sub={`${t.clicks} tıklama`} />
            <Stat
              label="Sorunlu tıklama"
              value={pct(t.problem, t.clicks)}
              sub={`${t.dead} ölü · ${t.rage} öfke`}
              tone={t.clicks > 0 && t.problem / t.clicks > 0.1 ? "danger" : undefined}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <SectionTitle hint="Oturumların yüzde kaçı her adıma ulaştı. Büyük düşüş olan adım iyileştirilecek yer.">
                Huni
              </SectionTitle>
              <Funnel f={s.funnel} actions={s.actions} />
            </Card>
            <Card className="p-5">
              <SectionTitle hint="Oturumun başladığı saat (Türkiye saati)">Saat dağılımı</SectionTitle>
              <Hours hours={s.hours} />
              {dev && devTotal > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[#6b7280]">Uygulama olarak</p>
                    <p className="text-white font-medium mt-0.5">{pct(dev.pwa, devTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[#6b7280]">İngilizce</p>
                    <p className="text-white font-medium mt-0.5">{pct(dev.en, devTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[#6b7280]">Masaüstü / tablet</p>
                    <p className="text-white font-medium mt-0.5">{pct(dev.wide, devTotal)}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <section>
            <SectionTitle hint="Satıra tıklayınca aşağıdaki ısı haritası o sayfaya geçer. Çıkış oranı yüksek sayfa, müşterinin vazgeçtiği yer.">
              Sayfalar
            </SectionTitle>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-[#6b7280] text-xs text-left">
                    <th className="px-4 py-3 font-medium">Sayfa</th>
                    <th className="px-3 py-3 font-medium text-right">Görüntüleme</th>
                    <th className="px-3 py-3 font-medium text-right">Ort. süre</th>
                    <th className="px-3 py-3 font-medium text-right">Giriş</th>
                    <th className="px-3 py-3 font-medium text-right">Çıkış oranı</th>
                    <th className="px-4 py-3 font-medium text-right">Sorunlu tık</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {s.pages.map((p) => {
                    const selected = p.page === heatPage;
                    return (
                      <tr
                        key={p.page}
                        onClick={() => setPage(p.page)}
                        className="cursor-pointer hover:bg-white/[0.03]"
                        style={selected ? { background: "rgba(245,158,11,0.06)" } : undefined}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white" style={selected ? { color: ACCENT } : undefined}>
                            {pageName(p.page)}
                          </p>
                          <div className="mt-1.5 w-32">
                            <Bar value={p.views} max={maxViews} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-white">
                          {p.views}
                          <span className="block text-[11px] text-[#6b7280]">{p.sessions} oturum</span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{duration(p.avg_seconds)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{p.entries}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#d1d5db]">{pct(p.exits, p.views)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: p.problem > 0 ? RED : MUTED }}>
                          {p.problem}
                          <span className="block text-[11px] text-[#6b7280]">{p.clicks} tıktan</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {heatPage && (
            <section>
              <SectionTitle hint="Koyu turuncu = çok tıklanan. Arkadaki sayfa canlı önizlemedir; kayıt anındaki içerik farklı olabilir.">
                Isı haritası
              </SectionTitle>
              <Card className="p-5">
                <Heatmap venue={venue} days={days} page={heatPage} pages={pages} onPage={setPage} />
              </Card>
            </section>
          )}

          <section>
            <SectionTitle hint="Adı değişen öğeler (şarkı satırları gibi) için “Benzer öğeleri birleştir”. Adı olmayan ikon düğmeler için koda data-track eklenebilir.">
              Tıklanan öğeler
            </SectionTitle>
            <Targets rows={s.targets} page={heatPage} />
          </section>

          <section>
            <SectionTitle hint="Bir sayfadan sonra en sık gidilen sayfa">Gezinme akışı</SectionTitle>
            {s.flows.length === 0 ? (
              <Empty>Henüz sayfalar arası geçiş yok.</Empty>
            ) : (
              <Card className="divide-y divide-white/5">
                {s.flows.slice(0, 20).map((f) => (
                  <div key={`${f.from}-${f.to}`} className="px-4 py-3 flex items-center gap-4">
                    <p className="text-sm text-white w-1/2 min-w-0 truncate">
                      {pageName(f.from)} <span className="text-[#6b7280]">→</span> {pageName(f.to)}
                    </p>
                    <div className="flex-1">
                      <Bar value={f.n} max={maxFlow} />
                    </div>
                    <p className="text-xs tabular-nums text-white w-10 text-right">{f.n}</p>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      ) : (
        !error && <p className="text-sm text-[#6b7280]">Yükleniyor…</p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsContent />
    </Suspense>
  );
}
