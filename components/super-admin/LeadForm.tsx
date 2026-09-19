"use client";

import { useState } from "react";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  PRIORITIES,
  PRIORITY_META,
  SOURCE_LABEL,
  STAGE_META,
  fromLocalInput,
  toLocalInput,
  type LeadSource,
  type LeadStage,
  type Priority,
} from "@/lib/business";
import { Button, ErrorBox, Select, TextArea, TextInput } from "./ui";

export type LeadInput = {
  name: string;
  contact_name: string;
  contact_role: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  address: string;
  venue_type: string;
  instagram: string;
  source: LeadSource;
  stage: LeadStage;
  priority: Priority;
  capacity: number | null;
  estimated_monthly_tokens: number | null;
  proposed_commission_pct: number | null;
  lost_reason: string;
  next_action: string;
  next_action_at: string | null;
  notes: string;
};

export const EMPTY_LEAD: LeadInput = {
  name: "",
  contact_name: "",
  contact_role: "",
  phone: "",
  email: "",
  city: "",
  district: "",
  address: "",
  venue_type: "",
  instagram: "",
  source: "manual",
  stage: "lead",
  priority: "normal",
  capacity: null,
  estimated_monthly_tokens: null,
  proposed_commission_pct: null,
  lost_reason: "",
  next_action: "",
  next_action_at: null,
  notes: "",
};

const numStr = (n: number | null) => (n === null || n === undefined ? "" : String(n));
const strNum = (s: string) => (s.trim() === "" ? null : Number(s));

export default function LeadForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: LeadInput;
  submitLabel: string;
  onSubmit: (lead: LeadInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial);
  const [nextAt, setNextAt] = useState(toLocalInput(initial.next_action_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof LeadInput>(key: K, value: LeadInput[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.name.trim()) {
      setError("Mekan adı zorunlu");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ ...f, next_action_at: fromLocalInput(nextAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Mekan adı *" value={f.name} onChange={(v) => set("name", v)} maxLength={120} />
        <TextInput label="Mekan türü" value={f.venue_type} onChange={(v) => set("venue_type", v)} placeholder="Bar, kafe, restoran…" maxLength={60} />
        <TextInput label="Yetkili" value={f.contact_name} onChange={(v) => set("contact_name", v)} maxLength={120} />
        <TextInput label="Görevi" value={f.contact_role} onChange={(v) => set("contact_role", v)} placeholder="Sahip, müdür…" maxLength={80} />
        <TextInput label="Telefon" type="tel" value={f.phone} onChange={(v) => set("phone", v)} maxLength={40} />
        <TextInput label="E-posta" type="email" value={f.email} onChange={(v) => set("email", v)} maxLength={160} />
        <TextInput label="Şehir" value={f.city} onChange={(v) => set("city", v)} maxLength={60} />
        <TextInput label="İlçe / semt" value={f.district} onChange={(v) => set("district", v)} maxLength={60} />
        <TextInput label="Instagram" value={f.instagram} onChange={(v) => set("instagram", v)} placeholder="@mekan" maxLength={120} />
        <TextInput label="Adres" value={f.address} onChange={(v) => set("address", v)} maxLength={300} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Aşama"
          value={f.stage}
          onChange={(v) => set("stage", v)}
          options={LEAD_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label }))}
        />
        <Select
          label="Öncelik"
          value={f.priority}
          onChange={(v) => set("priority", v)}
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
        />
        <Select
          label="Kaynak"
          value={f.source}
          onChange={(v) => set("source", v)}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Kapasite (kişi)" type="number" min="0" value={numStr(f.capacity)} onChange={(v) => set("capacity", strNum(v))} />
        <TextInput
          label="Tahmini aylık jeton"
          type="number"
          min="0"
          value={numStr(f.estimated_monthly_tokens)}
          onChange={(v) => set("estimated_monthly_tokens", strNum(v))}
        />
        <TextInput
          label="Teklif edilen komisyon %"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={numStr(f.proposed_commission_pct)}
          onChange={(v) => set("proposed_commission_pct", strNum(v))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <TextInput label="Sonraki adım" value={f.next_action} onChange={(v) => set("next_action", v)} placeholder="Demo için tekrar ara…" maxLength={300} />
        <TextInput label="Sonraki adım tarihi" type="datetime-local" value={nextAt} onChange={setNextAt} />
      </div>

      {f.stage === "lost" && (
        <TextInput label="Kaybetme sebebi" value={f.lost_reason} onChange={(v) => set("lost_reason", v)} maxLength={500} />
      )}

      <TextArea label="Notlar" value={f.notes} onChange={(v) => set("notes", v)} rows={3} maxLength={4000} />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} variant="ghost">
            Vazgeç
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Kaydediliyor…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
