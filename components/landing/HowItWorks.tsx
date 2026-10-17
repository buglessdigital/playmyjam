"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Coin from "@/components/ui/Coin";
import LangToggle from "@/components/ui/LangToggle";
import SongRow from "@/components/browse/SongRow";
import AddSongSheet from "@/components/browse/AddSongSheet";
import type { DisplaySong } from "@/components/browse/browse-types";
import { formatWait } from "@/lib/wait-time";
import { fmt, useT } from "@/lib/i18n";

// "Nasıl çalışır": solda adımlar, sağda telefonda o adımın ekranı. Ekranlar
// müşteri panelinin kendisi: SongRow, AddSongSheet ve LangToggle gerçek
// bileşenler (demo verisiyle); kuyruk sayfası, arama başlığı ve alt gezinme tek
// parça sayfaların içinde olduğundan onların işaretlemesi buraya birebir
// kopyalandı (QueueClient, SearchView, BottomNav) — oralar değişirse burası da.
// Şarkılar katalogda gerçekten var; kapaklar uygulamanın da gösterdiği resmi
// YouTube küçük resimleri ("- Topic" kanalı = albüm kapağı).
//
// Ekran 390 px genişlikte (gerçek telefon) çizilip telefona sığacak kadar
// küçültülür; transform aynı zamanda içerideki "fixed" katmanların (alt menü,
// ekleme paneli) telefonun içinde kalmasını sağlar. Telefon `inert`: içindeki
// gerçek düğmeler tıklanamaz, odaklanamaz.
//
// Otomatik ilerleme JS sayacıyla değil, aktif adımın ilerleme çizgisinin CSS
// animasyonu bitince (onAnimationEnd) olur: bölüm görünmüyorken animasyon
// duraklatılır, "azaltılmış hareket" açıksa animasyon hiç yoktur ve adımlar
// yalnız tıklamayla değişir.

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff2d9c]";

export function HowItWorksSection() {
  const t = useT();
  const s = t.home.steps;
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const steps = [
    { side: "A1", title: s.scanTitle, desc: s.scanDesc },
    { side: "A2", title: s.pickTitle, desc: s.pickDesc },
    { side: "B1", title: s.payTitle, desc: s.payDesc },
    { side: "B2", title: s.listenTitle, desc: s.listenDesc },
  ];

  const screens = [ScanScreen, PickScreen, PayScreen, ListenScreen];
  const Screen = screens[active];

  return (
    <section
      ref={ref}
      id="nasil-calisir"
      className="mx-auto grid w-full max-w-6xl scroll-mt-24 gap-x-16 gap-y-10 px-5 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:grid-rows-[auto_1fr] lg:py-28"
    >
      {/* Sıra: başlık → telefon → adımlar (mobil); masaüstünde telefon sağda iki satırı kaplar */}
      <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
        <p className="font-tag text-xs uppercase tracking-[0.18em] text-[#ff8fd0]">{s.kicker}</p>
        <h2 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{s.heading}</h2>
      </div>

      <div aria-hidden inert className="mx-auto w-[290px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-[320px] lg:self-center">
        <div className="rounded-[46px] border border-white/15 bg-[#07040c] p-2.5 shadow-[0_40px_90px_-30px_rgba(233,30,140,0.45)]">
          {/* 270×576 / 300×640 = 390×832 sanal ekranın 0.6923 / 0.7692 ölçeği */}
          <div className="relative isolate h-[576px] overflow-hidden rounded-[38px] bg-canvas [clip-path:inset(0_round_38px)] lg:h-[640px]">
            <div className="absolute left-1/2 top-2.5 z-[60] h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div className="absolute left-0 top-0 h-[832px] w-[390px] origin-top-left scale-[0.6923] lg:scale-[0.7692]">
              <div key={active} className="hiw-fade absolute inset-0 overflow-hidden bg-canvas">
                <Screen />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="lg:col-start-1 lg:row-start-2">
        <ol className="border-t border-white/15">
          {steps.map((step, i) => {
            const on = i === active;
            return (
              <li key={step.side} className="relative border-b border-white/15">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={on}
                  className={`grid w-full grid-cols-[56px_minmax(0,1fr)] gap-x-4 py-6 text-left sm:grid-cols-[72px_minmax(0,1fr)] ${FOCUS_RING} focus-visible:outline-offset-0`}
                >
                  <span className={`font-tag pt-1.5 text-sm transition-colors ${on ? "text-[#ff8fd0]" : "text-white/30"}`}>
                    {step.side}
                  </span>
                  <span>
                    <span
                      className={`font-display block text-2xl font-bold transition-colors sm:text-3xl ${on ? "text-white" : "text-white/35 hover:text-white/70"}`}
                    >
                      {step.title}
                    </span>
                    {/* Açıklama DOM'da kalır (arama motoru + ekran okuyucu), yalnız görsel olarak kapanır */}
                    <span
                      className={`grid transition-[grid-template-rows,opacity] duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    >
                      <span className="overflow-hidden">
                        <span className="block max-w-md pt-3 text-base leading-relaxed text-[#9ca3af]">{step.desc}</span>
                      </span>
                    </span>
                  </span>
                </button>
                {on && (
                  <span
                    key={active}
                    aria-hidden
                    onAnimationEnd={() => setActive((a) => (a + 1) % steps.length)}
                    style={{ animationPlayState: inView ? "running" : "paused" }}
                    className="hiw-progress absolute bottom-[-1px] left-0 h-[2px] w-full bg-[#ff2d9c]"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

    </section>
  );
}

// ---- Ekranlar (390×832 sanal piksel) ----

function delay(ms: number) {
  return { animationDelay: `${ms}ms` };
}

// Kapak: uygulamanın kullandığı YouTube küçük resmi
function yt(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Örnek şarkılar — katalogdaki gerçek kayıtlar (video kimliğiyle), mekan verisi değil
function demoSong(videoId: string, title: string, artist: string, playCount = 0): DisplaySong {
  return {
    id: `demo-${videoId}`,
    youtube_video_id: videoId,
    title,
    artist,
    album_cover_url: yt(videoId),
    duration_ms: 240_000,
    play_count: playCount,
    in_venue_list: true,
  };
}

const MY_SONG = demoSong("BSTsnWoslP4", "Bohemian Rhapsody", "Queen", 14);
const RESULTS = [
  MY_SONG,
  demoSong("CU3mc0yvRNk", "Bohemian Like You", "The Dandy Warhols", 6),
  demoSong("YKeMjPHf93I", "La Boheme", "Candan Erçetin", 9),
  demoSong("qrMg3fvCRdc", "Bohemio", "Nicky Jam"),
];
const NOW = demoSong("HzdD8kbDzZA", "Take on Me", "a-ha");
const QUEUE_OTHERS = [
  { song: demoSong("oMfMUfgjiLg", "Sweet Child O' Mine", "Guns N' Roses"), tokens: true },
  { song: demoSong("Kr4EQDVETuA", "Billie Jean", "Michael Jackson"), tokens: false },
];

const noop = () => {};
const ADD = { kind: "add" } as const;

// Dokunma halkası: animasyon yoksa hiç görünmez (bkz. globals.css .hiw-tap)
function Tap({ className, ms, style }: { className?: string; ms: number; style?: React.CSSProperties }) {
  return (
    <span
      className={`hiw-tap pointer-events-none absolute z-[70] -ml-7 -mt-7 h-14 w-14 rounded-full bg-white ${className ?? ""}`}
      style={{ ...style, ...delay(ms) }}
    />
  );
}

// Gerçek, okutulabilir karekod: "https://playmyjam.com.tr" (25×25, hata düzeltme M).
// Bir kez üretildi (qrcode paketi) ve jsQR ile okunarak doğrulandı; bağımlılık eklenmesin diye sabit.
const QR_ROWS = [
  "1111111001000100001111111", "1000001000010111101000001", "1011101010110001101011101", "1011101010110110001011101",
  "1011101011100000101011101", "1000001011010101101000001", "1111111010101010101111111", "0000000010000011000000000",
  "1011111000011111001111100", "0000010100011100100100010", "0011001000100111010001011", "0001100111101010001000001",
  "0100011101110110011110111", "1101110001101100100101010", "1010101001000011101111011", "1010000000101011011110001",
  "1011001010001100111110100", "0000000010000100100011000", "1111111001011110101010111", "1000001011110000100011001",
  "1011101010111111111110100", "1011101010001010011011111", "1011101011101010110001101", "1000001001111001100111001",
  "1111111010000110011111111",
];
const QR_PATH = QR_ROWS.flatMap((row, y) => [...row].map((c, x) => (c === "1" ? `M${x} ${y}h1v1h-1z` : ""))).join("");

// Kameradaki mekan ışıkları (bulanık bokeh)
const BOKEH = [
  { c: "#f59e0b", x: 8, y: 10, s: 120, d: 0 },
  { c: "#e91e8c", x: 70, y: 6, s: 150, d: 1.2 },
  { c: "#8b5cf6", x: 82, y: 58, s: 130, d: 0.6 },
  { c: "#f97316", x: -6, y: 66, s: 160, d: 1.8 },
  { c: "#fbbf24", x: 46, y: 86, s: 110, d: 0.9 },
];

// A1: telefonun kamerası masadaki plakete tutuluyor — panelde karşılığı olmayan
// tek ekran. Karekod bulununca iOS kamerasındaki gibi sarı bağlantı balonu çıkar.
function ScanScreen() {
  const s = useT().home.steps;
  return (
    <div className="relative h-full overflow-hidden bg-[#140b10]">
      {BOKEH.map((b) => (
        <span
          key={b.c + b.x}
          className="hiw-bokeh absolute rounded-full opacity-60 blur-2xl"
          style={{ background: b.c, left: `${b.x}%`, top: `${b.y}%`, width: b.s, height: b.s, animationDelay: `${b.d}s` }}
        />
      ))}
      {/* Masa yüzeyi */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent via-[#2a160c]/70 to-[#3b2112]" />

      {/* Plaket — elde tutulan kameranın hafif sallantısıyla */}
      <div className="hiw-sway absolute left-1/2 top-[150px] w-[250px] -translate-x-1/2">
        <div className="rounded-[22px] border border-white/10 bg-[#1d1030] px-6 pb-6 pt-5 shadow-[0_30px_60px_-10px_rgba(0,0,0,0.8)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük statik logo */}
          <img src="/logo.png" alt="" className="mx-auto h-8 w-auto" />
          <div className="relative mx-auto mt-5 w-[176px] rounded-xl bg-white p-3">
            <svg viewBox="0 0 25 25" className="block w-full" shapeRendering="crispEdges">
              <path d={QR_PATH} fill="#0f0a18" />
            </svg>
            {/* Kameranın karekoda kilitlenmesi */}
            <span className="hiw-lock absolute -inset-3" style={delay(1100)}>
              {["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl", "left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-xl", "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-xl"].map((c) => (
                <span key={c} className={`absolute h-8 w-8 border-[#facc15] ${c}`} />
              ))}
            </span>
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-white/85">{s.demoScanPlaque}</p>
        </div>
      </div>

      {/* Sarı bağlantı balonu */}
      <div className="hiw-rise absolute inset-x-0 top-[560px] flex justify-center" style={delay(1600)}>
        <span className="relative flex items-center gap-2 rounded-full bg-[#facc15] px-5 py-3 text-[15px] font-semibold text-black shadow-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M10 14a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1 1M14 10a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1-1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          {s.demoScanOpen} · playmyjam.com.tr
          <Tap ms={2700} style={{ left: "50%", top: "50%" }} />
        </span>
      </div>

      {/* Kamera altı: deklanşör */}
      <div className="absolute inset-x-0 bottom-0 flex h-[150px] items-center justify-center bg-black/70">
        <span className="h-[70px] w-[70px] rounded-full border-4 border-white/90 p-1">
          <span className="block h-full w-full rounded-full bg-white" />
        </span>
      </div>
    </div>
  );
}

// Panel alt gezinmesi (components/ui/BottomNav.tsx işaretlemesi)
function DemoBottomNav({ active }: { active: "queue" | "browse" }) {
  const t = useT();
  const c = (on: boolean) => (on ? "#e91e8c" : "var(--pmj-subtle)");
  const tabs = [
    {
      key: "queue",
      label: t.panelNav.queue,
      icon: (on: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="2" rx="1" fill={c(on)} />
          <rect x="3" y="10" width="14" height="2" rx="1" fill={c(on)} />
          <rect x="3" y="15" width="10" height="2" rx="1" fill={c(on)} />
          <circle cx="20" cy="15" r="3" stroke={c(on)} strokeWidth="1.5" />
          <path d="M20 12v3" stroke={c(on)} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: "browse",
      label: t.panelNav.browse,
      icon: (on: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke={c(on)} strokeWidth="2" />
          <path d="M20 20l-3-3" stroke={c(on)} strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: "map",
      label: t.panelNav.map,
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" stroke={c(false)} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.5" stroke={c(false)} strokeWidth="1.8" />
        </svg>
      ),
    },
    {
      key: "tokens",
      label: t.panelNav.tokens,
      icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke={c(false)} strokeWidth="2" />
          <circle cx="12" cy="12" r="3.5" stroke={c(false)} strokeWidth="1.6" />
          <path d="M12 8.5v-3M12 18.5v-3" stroke={c(false)} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-ink/10"
      style={{ background: "rgb(var(--pmj-bg-rgb) / 0.96)" }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <span key={tab.key} className="flex h-full flex-1 flex-col items-center justify-center gap-1">
            {tab.icon(on)}
            <span className="whitespace-nowrap text-[10px] font-semibold tracking-wider" style={{ color: on ? "var(--pmj-pink-text)" : "var(--pmj-subtle)" }}>
              {tab.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

// A2: arama ekranı (components/browse/SearchView.tsx başlığı) + gerçek SongRow'lar
function SearchScreen({ animate = true }: { animate?: boolean }) {
  return (
    <div className="h-full bg-canvas">
      <div className="flex items-center gap-2 px-4 pb-3 pt-12">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="var(--pmj-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div className="relative flex min-w-0 flex-1 items-center rounded-2xl border border-[#e91e8c] bg-surface py-3.5 pl-4 pr-10 text-sm text-ink shadow-[0_0_16px_rgba(233,30,140,0.2)]">
          <span className={`${animate ? "hiw-type" : ""} overflow-hidden whitespace-nowrap`}>bohemian</span>
          {animate && <span className="hiw-caret ml-px h-4 w-px bg-[#e91e8c]" />}
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
        </div>
        <LangToggle />
      </div>
      <div className="px-5">
        {RESULTS.map((song, i) => (
          <div key={song.youtube_video_id} className={`relative ${animate ? "hiw-rise" : ""}`} style={animate ? delay(1300 + i * 120) : undefined}>
            <SongRow song={song} action={ADD} isFav={i === 0} onOpen={noop} onToggleFavorite={noop} onAdd={noop} onRequest={noop} />
            {animate && i === 0 && <Tap ms={2700} style={{ right: -6, top: "50%" }} />}
          </div>
        ))}
      </div>
      <DemoBottomNav active="browse" />
    </div>
  );
}

function PickScreen() {
  return <SearchScreen />;
}

// B1: gerçek AddSongSheet, arkada arama ekranı
function PayScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [tap, setTap] = useState<{ left: number; top: number } | null>(null);

  // Dokunma halkası "Öncelikli sıra" düğmesinin ortasına — panelin yüksekliği
  // metne (dil, bekleme süresi) göre değiştiği için ölçülerek konur
  // (offset'ler transform'u yok sayar: hem ölçek hem kayma animasyonu dışarıda kalır).
  // Misafir oturumunda panelin altına onay metni sonradan eklenir ve düğmeler
  // yukarı kayar — bu yüzden panel boyu değiştikçe yeniden ölçülür.
  useLayoutEffect(() => {
    const root = ref.current;
    const sheet = root?.querySelector<HTMLElement>(".hiw-sheet");
    if (!root || !sheet) return;
    const measure = () => {
      const btn = sheet.querySelector<HTMLElement>("button");
      if (!btn) return;
      let x = btn.offsetWidth * 0.75;
      let y = btn.offsetHeight / 2;
      for (let el: HTMLElement | null = btn; el && el !== root; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft;
        y += el.offsetTop;
      }
      setTap({ left: x, top: y });
    };
    measure();
    const ro = new ResizeObserver(measure);
    sheet.querySelectorAll("div").forEach((d) => ro.observe(d));
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative h-full">
      <SearchScreen animate={false} />
      <div className="hiw-sheet absolute inset-0 z-50">
        <AddSongSheet
          song={MY_SONG}
          tokenBalance={5}
          waitNormalMs={9 * 60_000}
          waitPriorityMs={2 * 60_000}
          normalCost={1}
          priorityCost={2}
          onClose={noop}
          onAdd={noop}
        />
      </div>
      {tap && <Tap ms={2400} style={tap} />}
    </div>
  );
}

// B2: kuyruk sayfası (app/venue/[venueId]/queue/QueueClient.tsx işaretlemesi)
function QueueRow({ song, priority, tokens, waitMs }: { song: DisplaySong; priority: boolean; tokens: boolean; waitMs: number }) {
  const t = useT();
  return (
    <div
      className="flex h-[72px] items-center gap-3 rounded-2xl p-3"
      style={
        tokens
          ? priority
            ? { background: "linear-gradient(90deg, rgba(233,30,140,0.16), var(--pmj-surface) 55%)", borderLeft: "3px solid #e91e8c" }
            : { background: "linear-gradient(90deg, rgba(139,92,246,0.16), var(--pmj-surface) 55%)", borderLeft: "3px solid #8b5cf6" }
          : { background: "var(--pmj-surface)", borderLeft: "3px solid transparent" }
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI kapak */}
      <img src={song.album_cover_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{song.title}</p>
        <p className="truncate text-xs text-subtle">{song.artist}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {tokens && (
          <span
            className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs font-bold"
            style={priority ? { background: "rgba(233,30,140,0.15)", color: "var(--pmj-pink-text)" } : { background: "rgba(139,92,246,0.15)", color: "var(--pmj-violet)" }}
          >
            <Coin size={14} />
            {priority ? t.queue.priorityBadge : t.queue.tokenBadge}
          </span>
        )}
        <span className="text-xs font-bold" style={{ color: priority ? "var(--pmj-pink-text)" : "var(--pmj-muted)" }}>
          {formatWait(waitMs)}
        </span>
      </div>
    </div>
  );
}

function ListenScreen() {
  const t = useT();
  return (
    <div className="h-full bg-canvas">
      <div className="flex items-center justify-between px-5 pb-4 pt-12">
        <h1 className="min-w-0 truncate text-lg font-bold text-ink">Jam Bar</h1>
        <div className="flex shrink-0 items-center gap-2">
          <LangToggle />
          <span className="flex h-8 items-center rounded-full border border-[#e91e8c]/40 bg-[#e91e8c]/15 px-3 text-xs font-bold text-ink">
            {t.queue.login}
          </span>
        </div>
      </div>

      <div className="mx-5 mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--pmj-surface)" }}>
        <div className="flex">
          <div className="flex flex-1 items-center gap-3 border-r border-ink/10 px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#9ca3af" strokeWidth="1.5" />
              <path d="M12 7v5l3 3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-[10px] text-subtle">{t.queue.normalWait}</p>
              <p className="text-sm font-bold text-ink">{formatWait(11 * 60_000)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
            </svg>
            <div>
              <p className="text-[10px] text-subtle">{t.queue.priorityWait}</p>
              <p className="text-sm font-bold" style={{ color: "var(--pmj-pink-text)" }}>{formatWait(3 * 60_000)}</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mx-5 mb-5 rounded-3xl p-5"
        style={{ background: "linear-gradient(145deg, var(--pmj-hero) 0%, var(--pmj-surface) 100%)", border: "1px solid rgba(233,30,140,0.15)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-4 items-end gap-0.5">
              {[3, 5, 4, 6, 3].map((h, i) => (
                <div key={i} className="eq-bar w-1 rounded-full" style={{ height: `${h * 3}px`, background: "#e91e8c", animationDuration: `${0.5 + i * 0.12}s` }} />
              ))}
            </div>
            <span className="text-sm font-bold text-ink">{t.queue.nowPlaying}</span>
          </div>
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(233,30,140,0.2)", color: "var(--pmj-pink-text)" }}>
            {t.queue.live}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <div
              className="vinyl-spin h-40 w-40 rounded-full"
              style={{ animationDuration: "8s", background: "radial-gradient(circle at 50% 50%, #3d1a5e 0%, #1a0e2a 40%, #0a0612 70%)", boxShadow: "0 0 40px rgba(233,30,140,0.3)" }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URI kapak */}
                <img src={NOW.album_cover_url} alt="" className="h-16 w-16 rounded-full object-cover" style={{ boxShadow: "0 0 0 3px rgb(var(--pmj-ink-rgb) / 0.1)" }} />
              </div>
            </div>
          </div>
          <h2 className="text-center text-xl font-bold text-ink">{NOW.title}</h2>
          <p className="mb-4 text-sm text-muted">{NOW.artist}</p>
          <div className="w-full">
            <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-ink/10">
              <div className="hiw-track h-full w-full origin-left rounded-full" style={{ background: "linear-gradient(90deg, #e91e8c, #8b5cf6)" }} />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-subtle">2:07</span>
              <span className="text-xs text-subtle">3:45</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">{t.queue.upNext}</h3>
          <span className="text-xs text-muted">{fmt(t.queue.countInQueue, { n: 3 })}</span>
        </div>
        {/* Satır adımı 80 px: öncelikli şarkı iki satır yukarı tırmanır, diğerleri birer iner */}
        <div className="relative h-[240px]">
          <div className="hiw-climb absolute inset-x-0 top-0 z-10" style={delay(900)}>
            <QueueRow song={MY_SONG} priority tokens waitMs={2 * 60_000} />
          </div>
          {QUEUE_OTHERS.map((o, i) => (
            <div key={o.song.id} className="hiw-drop absolute inset-x-0" style={{ top: 80 * (i + 1), ...delay(900) }}>
              <QueueRow song={o.song} priority={false} tokens={o.tokens} waitMs={(6 + i * 4) * 60_000} />
            </div>
          ))}
        </div>
      </div>
      <DemoBottomNav active="queue" />
    </div>
  );
}
