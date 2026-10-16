"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HUB_KIND_META,
  HUB_KIND_ORDER,
  hubLinkError,
  hubPath,
  type HubKind,
  type HubLink,
} from "@/lib/hub";

/**
 * Mekan Sayfası — plaketin ARKA yüzündeki karekodun açtığı sayfanın içeriği.
 *
 * Mekan burada hangi başlıkların görüneceğini seçer ve bağlantılarını girer.
 * Hizmetin açık olup olmadığına super admin anlaşma sırasında karar verir;
 * kapalıysa bu sayfa yalnızca bilgilendirme ekranı gösterir.
 */

const ACCENT = "#e91e8c";

type Row = HubLink & { key: string };

type HubResponse = {
  enabled: boolean;
  slug: string;
  headline: string;
  links: HubLink[];
  stats: { views: number; clicks: Record<string, number> } | null;
};

const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
};

const card = "rounded-2xl border border-white/10 p-5";
const cardStyle = { background: "rgba(255,255,255,0.03)" };

let keySeed = 0;
const nextKey = () => `row-${++keySeed}`;

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-[#9ca3af]">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none placeholder:text-[#4b5563]"
      style={inputStyle}
    />
  );
}

function IconButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="rounded-lg px-2 py-1.5 text-[#9ca3af] transition-colors disabled:opacity-30 enabled:hover:text-white"
      style={{ background: "rgba(255,255,255,0.05)" }}
    >
      {children}
    </button>
  );
}

/**
 * Menü PDF'ini cihazdan seçer, depoya yükler ve dönen adresi satırın değerine
 * yazar. Hazır QR menüsü olan mekanlar adresi elle de yapıştırabilir; ikisi de
 * aynı alana yazıyor.
 */
function MenuUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/hub/menu", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Yüklenemedi");
        return;
      }
      onUploaded(data.url as string);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="-mt-1">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="rounded-xl px-3 py-2 text-xs font-medium text-[#d1d5db] transition-colors hover:text-white disabled:opacity-60"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {busy ? "Yükleniyor..." : "Cihazdan PDF seç"}
      </button>
      <p className="mt-1.5 text-xs text-[#6b7280]">
        PDF yüklerseniz yukarıdaki adres kendiliğinden dolar. En fazla 10 MB.
      </p>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function LinkCard({
  row,
  clicks,
  onChange,
  onRemove,
  onMove,
  first,
  last,
}: {
  row: Row;
  clicks: number | null;
  onChange: (patch: Partial<HubLink>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const meta = HUB_KIND_META[row.kind];
  const error = row.value.trim() ? hubLinkError(row) : null;

  return (
    <div className={card} style={cardStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {row.kind === "custom" ? row.label.trim() || "Yeni bağlantı" : meta.title}
          </p>
          {clicks !== null && (
            <p className="mt-0.5 text-xs text-[#6b7280]">
              Son 30 günde {clicks} tıklama
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton onClick={() => onMove(-1)} title="Yukarı taşı" disabled={first}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton onClick={() => onMove(1)} title="Aşağı taşı" disabled={last}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton onClick={onRemove} title="Satırı kaldır">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {row.kind === "custom" && (
          <Labelled label="Başlık">
            <Input
              value={row.label}
              onChange={(v) => onChange({ label: v })}
              placeholder="Etkinlik takvimi"
              maxLength={60}
            />
          </Labelled>
        )}

        {meta.labelField && (
          <Labelled label={meta.labelField.label}>
            <Input
              value={row.label}
              onChange={(v) => onChange({ label: v })}
              placeholder={meta.labelField.placeholder}
              maxLength={60}
            />
          </Labelled>
        )}

        <Labelled label={meta.valueLabel}>
          <Input
            value={row.value}
            onChange={(v) => onChange({ value: v })}
            placeholder={meta.placeholder}
            maxLength={500}
          />
        </Labelled>

        {meta.hint && <p className="-mt-1 text-xs text-[#6b7280]">{meta.hint}</p>}

        {row.kind === "menu" && <MenuUpload onUploaded={(url) => onChange({ value: url })} />}

        {/* Mekanın kendi cümlesi: "Rezervasyon hattı", "Sadece akşamları" gibi.
            Sayfada başlığın altında görünür, boşsa türün varsayılan yazısı çıkar. */}
        <Labelled label="Açıklama (isteğe bağlı)">
          <Input
            value={row.note}
            onChange={(v) => onChange({ note: v })}
            placeholder="Örn. Rezervasyon hattı"
            maxLength={120}
          />
        </Labelled>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-xs text-[#9ca3af]">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="h-4 w-4 accent-[#e91e8c]"
          />
          Sayfada görünsün
        </label>
      </div>
    </div>
  );
}

export default function HubSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  // Sayfanın adresi mekanın slug'ından türüyor (/<slug>/bilgi)
  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<HubResponse["stats"]>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/hub")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: HubResponse) => {
        setEnabled(data.enabled);
        setSlug(data.slug);
        setHeadline(data.headline);
        setRows(data.links.map((l) => ({ ...l, key: nextKey() })));
        setStats(data.stats);
      })
      .catch(() => setError("Mekan sayfası ayarları yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  const usedKinds = useMemo(() => new Set(rows.map((r) => r.kind)), [rows]);
  const available = HUB_KIND_ORDER.filter((k) => k === "custom" || !usedKinds.has(k));

  const patch = (key: string, next: Partial<HubLink>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const move = (key: string, delta: -1 | 1) =>
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const add = (kind: HubKind) =>
    setRows((prev) => [
      ...prev,
      { key: nextKey(), id: "", kind, label: "", value: "", note: "", enabled: true, position: prev.length },
    ]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${hubPath(slug)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const broken = rows.find((r) => hubLinkError(r));
    if (broken) {
      setError(`${HUB_KIND_META[broken.kind].title}: ${hubLinkError(broken)}`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/hub", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          links: rows.map((r) => ({
            // Yeni satırın kimliği yok; sunucu yeni satır olarak yazar
            id: r.id || undefined,
            kind: r.kind,
            label: r.label,
            value: r.value,
            note: r.note,
            enabled: r.enabled,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setRows((data.links as HubLink[]).map((l) => ({ ...l, key: nextKey() })));
      setStats(data.stats ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-[#6b7280]">Yükleniyor...</div>;
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-xl p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Mekan Sayfası</h1>
        <div className={`mt-6 ${card}`} style={cardStyle}>
          <p className="text-sm leading-relaxed text-[#9ca3af]">
            Mekan sayfası, masadaki plaketin arka yüzündeki karekodun açtığı sayfadır: menünüz,
            Instagram hesabınız, Google yorum bağlantınız ve Wi-Fi şifreniz tek bir yerde görünür.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
            Bu hizmet şu anda mekanınız için <span className="text-white">kapalı</span>. Açtırmak
            için bizimle iletişime geçin; açıldığında plaketinizin arka yüzüne özel karekodunuz
            basılır.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Mekan Sayfası</h1>
        <p className="mt-0.5 text-sm text-[#6b7280]">
          Plaketin arka yüzündeki karekodun açtığı sayfa
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Adres kutusu: plakete basılan kod burada. Slug değişse bile bozulmaz. */}
      <div className={card} style={cardStyle}>
        <p className="text-sm font-semibold text-white">Sayfanızın adresi</p>
        <p className="mt-1 text-xs text-[#6b7280]">
          Plaketinize basılan karekod bu adrese gider ve hiç değişmez.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code
            className="flex-1 truncate rounded-xl px-3 py-2.5 font-mono text-sm text-white"
            style={inputStyle}
          >
            playmyjam.com.tr{hubPath(slug)}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium text-[#9ca3af] transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
        </div>
        <a
          href={hubPath(slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs"
          style={{ color: ACCENT }}
        >
          Sayfayı önizle →
        </a>

        {stats && (
          <p className="mt-4 border-t border-white/10 pt-4 text-xs text-[#9ca3af]">
            Son 30 günde <span className="font-semibold text-white">{stats.views}</span> kez
            açıldı.
          </p>
        )}
      </div>

      <form onSubmit={save} className="mt-4 flex flex-col gap-4">
        <div className={card} style={cardStyle}>
          <p className="text-sm font-semibold text-white">Tanıtım yazısı</p>
          <p className="mb-3 mt-1 text-xs text-[#6b7280]">
            Mekan adınızın altında görünen tek satır. Boş bırakabilirsiniz.
          </p>
          <Input
            value={headline}
            onChange={setHeadline}
            placeholder="Alsancak'ta canlı müzik ve kahve"
            maxLength={140}
          />
        </div>

        {rows.map((row, i) => (
          <LinkCard
            key={row.key}
            row={row}
            clicks={row.id && stats ? stats.clicks[row.id] ?? 0 : null}
            onChange={(p) => patch(row.key, p)}
            onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            onMove={(d) => move(row.key, d)}
            first={i === 0}
            last={i === rows.length - 1}
          />
        ))}

        {rows.length < 12 && (
          <div className={card} style={cardStyle}>
            <p className="text-sm font-semibold text-white">Satır ekle</p>
            <p className="mb-3 mt-1 text-xs text-[#6b7280]">
              Eklediğiniz her başlık sayfada bir satır olarak görünür.
            </p>
            <div className="flex flex-wrap gap-2">
              {available.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => add(kind)}
                  className="rounded-xl px-3 py-2 text-xs font-medium text-[#d1d5db] transition-colors hover:text-white"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {kind === "custom" ? "+ Kendi bağlantım" : `+ ${HUB_KIND_META[kind].title}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Google'ın kuralı: yoruma yalnızca memnun müşteriyi yönlendirmek ya da
            yorum karşılığı ödül vermek yasak. Mekan sahibi bunu bilmeyebilir. */}
        {usedKinds.has("google_review") && (
          <p className="px-1 text-xs leading-relaxed text-[#6b7280]">
            <span className="text-white">Google yorumu hakkında:</span> Google, yorum karşılığında
            indirim/ikram vaat edilmesini ve yalnızca memnun müşterilerin yoruma yönlendirilmesini
            yasaklıyor. Bağlantıyı herkese açık tutun; aksi halde mekanınızın yorumları
            silinebilir.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-70"
          style={{
            background: saved ? "rgba(34,197,94,0.15)" : ACCENT,
            color: saved ? "#22c55e" : "white",
          }}
        >
          {saved ? "Kaydedildi!" : saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </button>
      </form>
    </div>
  );
}
