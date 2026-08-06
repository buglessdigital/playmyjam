"use client";

import { useRef, useState } from "react";
import VenueLogo from "@/components/VenueLogo";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 2 * 1024 * 1024;

// Yükleme anında kaydedilir (form gönderimini beklemez): /api/admin/logo hem
// dosyayı depoya koyar hem venues.logo_url'i günceller.
export default function VenueLogoUploader({
  venueName,
  logoUrl,
  onChange,
  accent = "#e91e8c",
  venueSlug,
}: {
  venueName: string;
  logoUrl: string;
  onChange: (logoUrl: string) => void;
  accent?: string;
  /** Super admin başka bir mekanın logosunu değiştirirken gerekir */
  venueSlug?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState("");

  const endpoint = venueSlug ? `/api/admin/logo?venue=${encodeURIComponent(venueSlug)}` : "/api/admin/logo";

  const handleFile = async (file: File) => {
    setError("");
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Yalnızca PNG, JPG, WEBP veya GIF yükleyebilirsiniz");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Logo en fazla 2 MB olabilir");
      return;
    }

    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Logo yüklenemedi");
        return;
      }
      onChange(data.logo_url as string);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setError("");
    setBusy("remove");
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Logo kaldırılamadı");
        return;
      }
      onChange("");
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <VenueLogo
          name={venueName}
          logoUrl={logoUrl}
          className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-black"
          fallbackStyle={{ background: `${accent}26`, color: accent }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Aynı dosya tekrar seçilebilsin diye input sıfırlanır
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: `${accent}26`, color: accent, border: `1px solid ${accent}4d` }}
          >
            {busy === "upload" ? "Yükleniyor..." : logoUrl.trim() ? "Logoyu Değiştir" : "Cihazdan Yükle"}
          </button>

          {logoUrl.trim() !== "" && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy !== null}
              className="px-3 py-2 rounded-xl text-xs font-medium text-[#9ca3af] transition-colors hover:text-white disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              {busy === "remove" ? "Kaldırılıyor..." : "Kaldır"}
            </button>
          )}
        </div>
      </div>

      <p className="text-[#6b7280] text-xs">PNG, JPG, WEBP veya GIF · en fazla 2 MB · kare (1:1) görsel en iyi sonucu verir.</p>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}
    </div>
  );
}
