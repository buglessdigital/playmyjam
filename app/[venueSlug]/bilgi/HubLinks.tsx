"use client";

import { useEffect, useRef, useState } from "react";
import { HUB_KIND_META, hubHref, hubTitle, hubValueHint, type HubLink } from "@/lib/hub";

/**
 * Mekan sayfasının satır listesi.
 *
 * Kutu ve simge YOK: satırlar ince çizgilerle ayrılmış, solunda sıra numarası
 * olan tipografik bir dizin. (Yuvarlak köşeli kart + renkli simge rozeti
 * kombinasyonu denendi ve geri alındı — hazır şablon gibi duruyordu.)
 * Ağırlık kutudan değil, punto ve boşluktan geliyor.
 *
 * İstemcide olmasının iki sebebi var: Wi-Fi şifresini panoya kopyalamak ve
 * tıklamaları saymak. Sayım sendBeacon ile gider — kullanıcı dış bağlantıya
 * geçerken istek yarıda kalmaz, gezinme de beklemez.
 */

function track(code: string, linkId?: string) {
  const body = JSON.stringify({ code, linkId });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/hub/track", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {}
  // sendBeacon yoksa (ya da engellendiyse) sessizce normal istekle dene
  void fetch("/api/hub/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function Num({ n }: { n: number }) {
  return <span className="hub-num">{String(n).padStart(2, "0")}</span>;
}

/** Dışarı açılan satırlarda kuzeydoğu oku — sekme değiştiğini anlatır */
function OutArrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="hub-out">
      <path d="M7 17L17 7M8.5 7H17v8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkRow({ link, n, code }: { link: HubLink; n: number; code: string }) {
  const href = hubHref(link);
  // Mekanın kendi açıklaması ve okunur değer (numara, @kullanıcı) birlikte
  // görünür: "Rezervasyon hattı · +90 544 312 77 98". İkisi de yoksa türün
  // varsayılan cümlesine düşülür.
  const parts = [link.note.trim(), hubValueHint(link)].filter(Boolean);
  const sub = parts.length > 0 ? parts.join(" · ") : HUB_KIND_META[link.kind].caption;

  return (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track(code, link.id)}
      className="hub-row"
    >
      <Num n={n} />
      <span className="hub-row-body">
        <span className="hub-row-title">{hubTitle(link)}</span>
        {sub && <span className="hub-row-sub">{sub}</span>}
      </span>
      <OutArrow />
    </a>
  );
}

/**
 * Wi-Fi bağlantı değil: şifre satırın içinde büyük puntoyla yazıyor, dokununca
 * kopyalanıyor. Masada en çok sorulan şey olduğu için tek vurgulu satır bu.
 */
function WifiRow({ link, n, code }: { link: HubLink; n: number; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    track(code, link.id);
    try {
      await navigator.clipboard.writeText(link.value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano izni yoksa şifre zaten ekranda yazıyor — sessiz geç
    }
  };

  const network = link.label.trim();

  return (
    <button type="button" onClick={copy} className="hub-row hub-row--wifi">
      <Num n={n} />
      <span className="hub-row-body">
        <span className="hub-row-title">Wi-Fi</span>
        {(network || link.note.trim()) && (
          <span className="hub-row-sub">
            {[link.note.trim(), network].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="hub-pass">
          <span className="hub-pass-value">{link.value}</span>
          <span className="hub-pass-action">{copied ? "kopyalandı" : "kopyala"}</span>
        </span>
      </span>
    </button>
  );
}

export default function HubLinks({ code, links }: { code: string; links: HubLink[] }) {
  // Sayfa görüntülemesi: mekan panelinde "bu ay kaç kişi baktı" olarak görünür.
  // Kimlik değil, yalnızca günlük toplam tutuluyor.
  useEffect(() => {
    track(code);
  }, [code]);

  if (links.length === 0) {
    return <p className="hub-empty">Mekan bilgileri henüz eklenmedi.</p>;
  }

  return (
    <div className="hub-list">
      {links.map((link, i) =>
        link.kind === "wifi" ? (
          <WifiRow key={link.id} link={link} n={i + 1} code={code} />
        ) : (
          <LinkRow key={link.id} link={link} n={i + 1} code={code} />
        )
      )}
    </div>
  );
}
