"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

// Tarayıcıda ve PWA'da karekod okutma (uygulamada eklenti var, bkz.
// lib/native-app.ts scanQrCode). Arka kamerayı açar, kareleri tarar:
// BarcodeDetector varsa onunla (Android Chrome), yoksa jsQR ile (iOS Safari).
// jsQR yalnız gerektiğinde yüklenir. body'ye portal: düğme haritanın kendi
// katmanında (fixed z-0), içeride kalsa alt menü okuyucunun üstüne çıkıyordu.

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Taranan karenin uzun kenarı (px): jsQR için yeterli, CPU'yu yormaz */
const SCAN_SIZE = 640;
const SCAN_INTERVAL_MS = 150;

export default function WebQrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [denied, setDenied] = useState(false);
  // Sonuç bir kez bildirilir; ebeveynin geri çağrıları değişse de tarama yeniden başlamaz
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        if (!stopped) setDenied(true);
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Ctor) {
        try {
          detector = new Ctor({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (stopped) return;
        let text: string | null = null;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            if (detector) {
              text = (await detector.detect(video))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const scale = Math.min(1, SCAN_SIZE / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            // tek karelik hata: sonrakini dene
          }
        }
        if (stopped) return;
        if (text?.trim()) {
          stop();
          onResultRef.current(text.trim());
          return;
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    })();

    return stop;
  }, []);

  // Geri tuşu / Esc ile kapanır, arkadaki sayfa kaymaz
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.nativeApp.qrScan} className="fixed inset-0 z-[70] flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Çerçeve: ortadaki kare açık, çevresi karartılmış */}
      {!denied && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="aspect-square w-[68vw] max-w-[300px] rounded-3xl border-2 border-[#e91e8c]"
            style={{ boxShadow: "0 0 0 100vmax rgba(0,0,0,0.55)" }}
          />
        </div>
      )}

      <div className="relative flex items-center justify-between gap-3 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+16px)]">
        <p className="text-sm font-semibold text-white">{t.nativeApp.qrScan}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.nativeApp.qrCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:scale-95"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative mt-auto px-6 pb-[calc(env(safe-area-inset-bottom)+40px)] text-center">
        {denied ? (
          <p className="rounded-2xl bg-[#170e25]/95 px-4 py-3 text-sm text-white">{t.nativeApp.qrCameraDenied}</p>
        ) : (
          <p className="text-sm text-white/90">{t.nativeApp.qrInstructions}</p>
        )}
      </div>
    </div>,
    document.body
  );
}
