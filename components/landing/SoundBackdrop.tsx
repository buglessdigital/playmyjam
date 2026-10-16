"use client";

import { useEffect, useRef } from "react";

// Açılış ekranının arka planı: ritimle atan spektrum çubukları + yavaş akan ses
// dalgaları. Ses yok, tamamen sentetik — sabit bir tempoda (BPM) vuruş üretip
// her çubuğa kendi frekans bandına göre tepki veriyoruz, böylece "rastgele
// zıplayan çubuklar" yerine gerçek bir şarkının analizörü gibi görünüyor.
//
// Maliyet: tek canvas, ekran dışındayken ve sekme gizliyken durur; "hareketi
// azalt" tercihi olan kullanıcıya tek bir sabit kare çizilir.

const BPM = 112;
const BAR_GAP = 4;
const MIN_BAR_WIDTH = 6;

// Bas tarafı pembe, tizler mora kayar (marka renkleri)
const LOW = [255, 45, 156];
const HIGH = [139, 92, 246];

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export default function SoundBackdrop({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let bars: { level: number; vel: number; target: number; nextAt: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(24, Math.floor(width / (MIN_BAR_WIDTH + BAR_GAP + 6)));
      bars = Array.from({ length: count }, () => ({ level: 0.2, vel: 0, target: 0.3, nextAt: 0 }));
    };

    // Vuruş zarfı: ani sıçrama yerine kısa ve yumuşak bir yükselişle tepe yapıp
    // yavaşça söner — çubuklar "kesilip oynamasın", nefes alır gibi kabarsın.
    const pulse = (phase: number) => {
      const ATTACK = 0.12;
      if (phase < ATTACK) {
        const x = phase / ATTACK;
        return x * x * (3 - 2 * x);
      }
      return Math.exp(-(phase - ATTACK) * 2.6);
    };

    let lastMs = 0;

    const draw = (ms: number) => {
      const t = ms / 1000;
      // Kare hızından bağımsız yumuşatma: 60 Hz'de de 120 Hz'de de aynı akış
      const dt = lastMs ? Math.min(0.1, (ms - lastMs) / 1000) : 1 / 60;
      lastMs = ms;
      const beat = (t * BPM) / 60;
      const accent = Math.floor(beat) % 4 === 0 ? 1 : 0.65;
      const kick = pulse(beat % 1) * accent;

      ctx.clearRect(0, 0, width, height);

      // Ses dalgaları: ekranın ortasından akan üç ince çizgi
      for (let w = 0; w < 3; w++) {
        const amp = height * (0.05 + w * 0.025) * (0.8 + kick * 0.25);
        const freq = 0.006 - w * 0.0012;
        const speed = 0.6 + w * 0.25;
        const yBase = height * (0.42 + w * 0.07);
        ctx.beginPath();
        for (let x = 0; x <= width; x += 6) {
          const y =
            yBase +
            Math.sin(x * freq + t * speed) * amp * Math.sin(x * 0.0017 + t * 0.3 + w) +
            Math.sin(x * freq * 2.7 - t * speed * 1.3) * amp * 0.25;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const [r, g, b] = mix(LOW, HIGH, w / 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.16 - w * 0.03})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Spektrum: her çubuk bağımsız ve rastgele, ama sıçramadan. Çubuk arada
      // bir yeni rastgele hedef seçer ve oraya sönümlü bir yayla süzülür
      // (taşma yok, kare hızından bağımsız). Bas tarafı biraz daha yüksek
      // seçer, vuruş basları hafifçe kabartır.
      const n = bars.length;
      const now = t;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const bar = bars[i];
        if (now >= bar.nextAt) {
          const ceiling = 0.55 + 0.4 * Math.pow(1 - f, 1.2);
          bar.target = 0.1 + Math.random() * ceiling;
          bar.nextAt = now + 0.25 + Math.random() * 0.65;
        }
        const bass = Math.pow(Math.max(0, 1 - f * 1.8), 1.5);
        const goal = bar.target + kick * bass * 0.18;
        // Kritik sönümlü yay: k yayın sertliği, c sönüm
        const k = 28;
        const c = 2 * Math.sqrt(k) * 0.95;
        // Büyük kare aralığında (yavaş cihaz, sekmeye dönüş) yay hedefi aşıp
        // sıfırın altına düşmesin: adımı 1/120 sn'lik parçalara böl
        const steps = Math.ceil(dt * 120);
        const h = dt / steps;
        for (let st = 0; st < steps; st++) {
          const acc = k * (goal - bar.level) - c * bar.vel;
          bar.vel += acc * h;
          bar.level += bar.vel * h;
        }
      }

      const barW = Math.max(MIN_BAR_WIDTH, (width - BAR_GAP * (n - 1)) / n);
      const maxH = height * 0.34;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const h = Math.max(3, Math.min(1, Math.max(0, bars[i].level)) * maxH);
        const x = i * (barW + BAR_GAP);
        const [r, g, b] = mix(LOW, HIGH, f);
        const grad = ctx.createLinearGradient(0, height - h, 0, height);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.04)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, height - h, barW, h);
        // Tepe çizgisi
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.fillRect(x, height - h - 3, barW, 2);
      }
    };

    // Hareketsiz kare: çubuklar düz durmasın diye birkaç saniyelik akış
    // görünmeden hesaplanıp son hali çizilir
    const staticFrame = () => {
      lastMs = 0;
      for (let m = 0; m <= 3000; m += 16) draw(m);
    };

    resize();
    let raf = 0;
    let running = false;
    const loop = (ms: number) => {
      draw(ms);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      lastMs = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    if (reduced) staticFrame();

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(canvas);

    const onVisibility = () => (document.hidden || !visible ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) staticFrame();
    });
    ro.observe(canvas);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none block ${className}`} />;
}
