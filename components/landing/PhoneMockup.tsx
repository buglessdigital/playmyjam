"use client";

import { useT } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Şarkı/sanatçı adları evrensel — çevrilmez, olduğu gibi kalır.
const MOCK_QUEUE = [
  { pos: 1, title: "Billie Jean", artist: "Michael Jackson", priority: true },
  { pos: 2, title: "Hotel California", artist: "Eagles", priority: false },
  { pos: 3, title: "Sweet Child O' Mine", artist: "Guns N' Roses", priority: false },
];

export default function PhoneMockup() {
  const t = useT();

  return (
    <div aria-hidden className="relative mx-auto w-[290px] select-none">
      <div
        aria-hidden
        className="absolute -inset-10 rounded-full"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(233,30,140,0.22), transparent 70%)" }}
      />
      <div
        className="relative overflow-hidden rounded-[2.6rem] border border-white/10 p-2.5"
        style={{ background: "#05030a", boxShadow: "0 40px 80px -24px rgba(0,0,0,0.8), 0 0 50px rgba(233,30,140,0.12)" }}
      >
        <div className="overflow-hidden rounded-[2rem]" style={{ background: "#120b1e" }}>
          {/* Çentik */}
          <div className="flex justify-center pt-2.5">
            <div className="h-5 w-24 rounded-full bg-black" />
          </div>

          <div className="px-4 pb-5 pt-3">
            {/* Mekan başlığı */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">{t.home.mockup.venue}</p>
                <p className="text-sm font-extrabold text-white">Kovan Lounge</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[#22c55e]/10 px-2.5 py-1 text-[9px] font-bold text-[#4ade80]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                </span>
                {t.home.mockup.live}
              </span>
            </div>

            {/* Şu an çalıyor */}
            <div
              className="mt-3.5 rounded-2xl p-3.5"
              style={{
                background: "linear-gradient(140deg, rgba(233,30,140,0.18), rgba(139,92,246,0.1) 55%, #1a0e2a)",
                border: "1px solid rgba(233,30,140,0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "linear-gradient(140deg, #8b5cf6, #e91e8c)" }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" stroke="white" strokeWidth="2" />
                    <circle cx="18" cy="16" r="3" stroke="white" strokeWidth="2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#e91e8c]">{t.home.mockup.nowPlaying}</p>
                  <p className="truncate text-sm font-extrabold text-white">Bohemian Rhapsody</p>
                  <p className="truncate text-[11px] text-[#9ca3af]">Queen</p>
                </div>
                {/* Ekolayzer */}
                <div className="flex h-7 items-end gap-[3px]">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="eq-bar w-[3px] rounded-full"
                      style={{ height: "100%", background: "#e91e8c", animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[42%] rounded-full" style={{ background: PINK_GRADIENT }} />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-[#6b7280] tabular-nums">
                  <span>2:29</span>
                  <span>5:55</span>
                </div>
              </div>
            </div>

            {/* Sıradakiler */}
            <p className="mb-2 mt-4 text-[9px] font-bold uppercase tracking-[0.16em] text-[#9ca3af]">{t.home.mockup.upNext}</p>
            <div className="space-y-1.5">
              {MOCK_QUEUE.map((q) => (
                <div
                  key={q.pos}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                  style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span className="w-4 text-center text-[11px] font-black text-[#6b7280] tabular-nums">{q.pos}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-white">{q.title}</p>
                    <p className="truncate text-[9px] text-[#6b7280]">{q.artist}</p>
                  </div>
                  {q.priority && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#e91e8c" />
                    </svg>
                  )}
                </div>
              ))}
            </div>

            {/* İstek butonu */}
            <div
              className="mt-4 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white"
              style={{ background: PINK_GRADIENT, boxShadow: "0 8px 24px -8px rgba(233,30,140,0.6)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {t.home.mockup.requestSong}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
