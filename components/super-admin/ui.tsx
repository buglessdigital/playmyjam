"use client";

// Super admin iş yönetimi ekranlarının ortak parçaları — mevcut panelin koyu stiliyle aynı.

import { useEffect, useState } from "react";

export const ACCENT = "#f59e0b";

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
};

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-[#6b7280] text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border border-white/10 ${className}`} style={{ background: "rgba(255,255,255,0.03)", ...style }}>
      {children}
    </div>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: `${color}1f`, color }}
    >
      {label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success" | "accent";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: ACCENT, color: "#0f0a18" },
    accent: { background: "rgba(245,158,11,0.12)", color: ACCENT },
    ghost: { background: "rgba(255,255,255,0.08)", color: "#d1d5db" },
    danger: { background: "rgba(239,68,68,0.12)", color: "#ef4444" },
    success: { background: "rgba(34,197,94,0.12)", color: "#22c55e" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-2 rounded-lg font-medium transition-all disabled:opacity-40 whitespace-nowrap ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[#9ca3af] text-xs mb-1.5">{children}</label>;
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  maxLength,
  step,
  min,
  max,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date" | "datetime-local" | "email" | "tel";
  mono?: boolean;
  maxLength?: number;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="min-w-0">
      {label && <Label>{label}</Label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        step={step}
        min={min}
        max={max}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-white/25 [color-scheme:dark]"
        style={{ ...inputStyle, fontFamily: mono ? "monospace" : undefined }}
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div className="min-w-0">
      {label && <Label>{label}</Label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="w-full resize-y rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-white/25"
        style={inputStyle}
      />
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="min-w-0">
      {label && <Label>{label}</Label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none [color-scheme:dark]"
        style={inputStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#1a1225" }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string; count?: number; color?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.key;
        const color = o.color ?? ACCENT;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
            style={{
              background: active ? `${color}1f` : "rgba(255,255,255,0.05)",
              color: active ? color : "#9ca3af",
              border: `1px solid ${active ? `${color}59` : "transparent"}`,
            }}
          >
            {o.label}
            {o.count !== undefined && ` (${o.count})`}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "warn" | "danger" | "good";
}) {
  const color = tone === "danger" ? "#ef4444" : tone === "warn" ? ACCENT : tone === "good" ? "#22c55e" : "white";
  return (
    <div className="rounded-2xl p-4 border border-white/10 min-w-0" style={{ background: "rgba(255,255,255,0.04)" }}>
      <p className="text-[#9ca3af] text-xs mb-1">{label}</p>
      <p className="text-xl md:text-2xl font-bold truncate" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[#6b7280] text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 p-5`}
        style={{ background: "#16101f" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9ca3af] hover:text-white" aria-label="Kapat">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-14 text-center rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
      <p className="text-[#6b7280] text-sm">{children}</p>
    </div>
  );
}

// Render içinde Date.now() yerine: dakikada bir tazelenen "şimdi"
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// JSON istek yardımcısı: hata mesajını sunucudan alır
export async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "İşlem başarısız");
  return data as T;
}
