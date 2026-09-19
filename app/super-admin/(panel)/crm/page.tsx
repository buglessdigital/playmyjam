"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  OPEN_STAGES,
  LEAD_SOURCES,
  LEAD_STAGES,
  PRIORITIES,
  PRIORITY_META,
  SOURCE_LABEL,
  STAGE_META,
  formatDateTime,
  formatNumber,
  type LeadSource,
  type LeadStage,
  type Priority,
} from "@/lib/business";
import { ACCENT, Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Stat, api, useNow } from "@/components/super-admin/ui";
import LeadForm, { EMPTY_LEAD, type LeadInput } from "@/components/super-admin/LeadForm";

type Lead = {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  city: string;
  district: string;
  venue_type: string;
  source: LeadSource;
  stage: LeadStage;
  priority: Priority;
  estimated_monthly_tokens: number | null;
  proposed_commission_pct: number | null;
  next_action: string;
  next_action_at: string | null;
  venue_id: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
};

type FollowUp = "any" | "overdue" | "week" | "none";
type Linked = "any" | "yes" | "no";

type Filters = {
  stages: LeadStage[]; // boş = tüm aşamalar
  types: string[];
  cities: string[];
  districts: string[];
  sources: LeadSource[];
  priorities: Priority[];
  followUp: FollowUp;
  linked: Linked;
};

const DEFAULT_FILTERS: Filters = {
  stages: [...OPEN_STAGES],
  types: [],
  cities: [],
  districts: [],
  sources: [],
  priorities: [],
  followUp: "any",
  linked: "any",
};

const FOLLOW_UP_LABEL: Record<FollowUp, string> = {
  any: "Hepsi",
  overdue: "Gecikmiş",
  week: "7 gün içinde",
  none: "Sonraki adım yok",
};
const LINKED_LABEL: Record<Linked, string> = { any: "Hepsi", yes: "Mekana bağlı", no: "Bağlı değil" };

const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x));
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
// Şehir/tür elle yazıldığı için "izmir" ile "İzmir" aynı sayılsın
const norm = (v: string) => v.trim().toLocaleLowerCase("tr");

// Veride geçen farklı değerler ve sayıları (ilk yazılış biçimiyle)
function distinct(values: string[]): { key: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const v of values) {
    if (!v.trim()) continue;
    const k = norm(v);
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { label: v.trim(), count: 1 });
  }
  return [...map.entries()]
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

function CheckRow({
  label,
  count,
  color,
  checked,
  onToggle,
}: {
  label: string;
  count?: number;
  color?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors hover:bg-white/[0.05]"
    >
      <span
        className="w-4 h-4 rounded-[5px] flex items-center justify-center shrink-0"
        style={{
          background: checked ? ACCENT : "transparent",
          border: `1.5px solid ${checked ? ACCENT : "rgba(255,255,255,0.25)"}`,
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#0f0a18" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
      <span className={`flex-1 truncate ${checked ? "text-white" : "text-[#d1d5db]"}`}>{label}</span>
      {count !== undefined && <span className="text-xs text-[#6b7280] tabular-nums">{count}</span>}
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-1.5 px-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function CheckList({
  options,
  selected,
  onToggle,
  empty,
}: {
  options: { key: string; label: string; count?: number; color?: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  empty: string;
}) {
  if (options.length === 0) return <p className="px-2 py-1 text-xs text-[#4b5563]">{empty}</p>;
  return (
    <div className="overflow-y-auto" style={{ maxHeight: 132 }}>
      {options.map((o) => (
        <CheckRow key={o.key} label={o.label} count={o.count} color={o.color} checked={selected.includes(o.key)} onToggle={() => onToggle(o.key)} />
      ))}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className="flex-1 text-xs px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors"
          style={{ background: value === o.key ? "rgba(245,158,11,0.18)" : "transparent", color: value === o.key ? ACCENT : "#9ca3af" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterPanel({
  leads,
  filters,
  setFilters,
  resultCount,
  onClose,
}: {
  leads: Lead[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  resultCount: number;
  onClose: () => void;
}) {
  const stageCounts: Record<string, number> = {};
  for (const l of leads) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1;

  const types = distinct(leads.map((l) => l.venue_type));
  const cities = distinct(leads.map((l) => l.city));
  // İlçeler seçili şehirlerle sınırlı
  const districts = distinct(
    leads.filter((l) => filters.cities.length === 0 || filters.cities.includes(norm(l.city))).map((l) => l.district)
  );
  const sources = LEAD_SOURCES.map((src) => ({ key: src, label: SOURCE_LABEL[src], count: leads.filter((l) => l.source === src).length })).filter(
    (o) => o.count > 0
  );
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  const quick = (label: string, stages: LeadStage[]) => (
    <button
      onClick={() => set({ stages })}
      className="text-[11px] font-medium hover:text-white"
      style={{ color: sameSet(filters.stages, stages) ? ACCENT : "#6b7280" }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="absolute left-0 top-full mt-2 z-30 rounded-2xl border border-white/10 shadow-2xl flex flex-col"
      style={{ background: "#16101f", width: "min(720px, calc(100vw - 32px))", maxHeight: "min(640px, calc(100vh - 220px))" }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
        <p className="text-white text-sm font-semibold">Filtreler</p>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/5" aria-label="Kapat">
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Section
            title="Aşama"
            action={
              <div className="flex gap-3">
                {quick("Açıklar", [...OPEN_STAGES])}
                {quick("Tümü", [])}
              </div>
            }
          >
            {LEAD_STAGES.map((st) => (
              <CheckRow
                key={st}
                label={STAGE_META[st].label}
                color={STAGE_META[st].color}
                count={stageCounts[st] ?? 0}
                checked={filters.stages.includes(st)}
                onToggle={() => set({ stages: toggle(filters.stages, st) })}
              />
            ))}
          </Section>

          <div className="flex flex-col gap-4 min-w-0">
            <Section title="Mekan türü">
              <CheckList options={types} selected={filters.types} onToggle={(k) => set({ types: toggle(filters.types, k) })} empty="Tür girilmiş aday yok" />
            </Section>
            <Section title="Şehir">
              <CheckList
                options={cities}
                selected={filters.cities}
                onToggle={(k) => set({ cities: toggle(filters.cities, k), districts: [] })}
                empty="Şehir girilmiş aday yok"
              />
            </Section>
            <Section title="İlçe / semt">
              <CheckList options={districts} selected={filters.districts} onToggle={(k) => set({ districts: toggle(filters.districts, k) })} empty="İlçe girilmiş aday yok" />
            </Section>
            <Section title="Kaynak">
              <CheckList options={sources} selected={filters.sources} onToggle={(k) => set({ sources: toggle(filters.sources, k as LeadSource) })} empty="-" />
            </Section>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mt-4 pt-4 border-t border-white/10 px-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] mb-1.5">Öncelik</p>
            <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
              {PRIORITIES.map((p) => {
                const on = filters.priorities.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => set({ priorities: toggle(filters.priorities, p) })}
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg font-medium"
                    style={{ background: on ? `${PRIORITY_META[p].color}2e` : "transparent", color: on ? PRIORITY_META[p].color : "#9ca3af" }}
                  >
                    {PRIORITY_META[p].label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] mb-1.5">Takip</p>
            <Segmented
              value={filters.followUp}
              onChange={(v) => set({ followUp: v })}
              options={[
                { key: "any", label: "Hepsi" },
                { key: "overdue", label: "Gecikmiş" },
                { key: "week", label: "7 gün" },
                { key: "none", label: "Adımsız" },
              ]}
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] mb-1.5">Mekan bağlantısı</p>
            <Segmented
              value={filters.linked}
              onChange={(v) => set({ linked: v })}
              options={[
                { key: "any", label: "Hepsi" },
                { key: "yes", label: "Bağlı" },
                { key: "no", label: "Bağlı değil" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-white/10">
        <button onClick={() => setFilters({ ...DEFAULT_FILTERS, stages: [] })} className="text-xs text-[#9ca3af] hover:text-white">
          Tümünü temizle
        </button>
        <Button variant="primary" onClick={onClose}>
          {resultCount} adayı göster
        </Button>
      </div>
    </div>
  );
}

type View = "list" | "board";

const daysSince = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / 86400000);

function LeadRow({ lead, now }: { lead: Lead; now: number }) {
  const overdue = lead.next_action_at && new Date(lead.next_action_at).getTime() < now;
  const lastTouch = lead.last_activity_at ?? lead.created_at;
  const idle = daysSince(lastTouch, now);
  return (
    <Link
      href={`/super-admin/crm/${lead.id}`}
      className="block px-4 py-3.5 transition-all hover:bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-white text-sm font-medium">{lead.name}</span>
        <Badge label={STAGE_META[lead.stage].label} color={STAGE_META[lead.stage].color} />
        {lead.priority !== "normal" && (
          <Badge label={PRIORITY_META[lead.priority].label} color={PRIORITY_META[lead.priority].color} />
        )}
        {lead.venue_id && <Badge label="Mekan bağlı" color="#22c55e" />}
      </div>
      <p className="text-[#6b7280] text-xs mt-1">
        {[lead.venue_type, [lead.district, lead.city].filter(Boolean).join(", "), lead.contact_name, SOURCE_LABEL[lead.source]]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs">
        {lead.next_action_at || lead.next_action ? (
          <span style={{ color: overdue ? "#ef4444" : "#9ca3af" }}>
            {overdue ? "Gecikti: " : "Sonraki: "}
            {lead.next_action || "Takip"}
            {lead.next_action_at && ` — ${formatDateTime(lead.next_action_at)}`}
          </span>
        ) : (
          OPEN_STAGES.includes(lead.stage) && <span className="text-[#f59e0b]">Sonraki adım yok</span>
        )}
        <span className="text-[#6b7280]">
          Son temas: {idle === 0 ? "bugün" : `${idle} gün önce`}
        </span>
        {lead.estimated_monthly_tokens !== null && (
          <span className="text-[#6b7280]">~{formatNumber(lead.estimated_monthly_tokens)} jeton/ay</span>
        )}
      </div>
    </Link>
  );
}

function BoardCard({ lead, now }: { lead: Lead; now: number }) {
  const overdue = lead.next_action_at && new Date(lead.next_action_at).getTime() < now;
  return (
    <Link
      href={`/super-admin/crm/${lead.id}`}
      className="block rounded-xl border border-white/10 p-3 transition-all hover:border-white/25"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <p className="text-white text-sm font-medium truncate">{lead.name}</p>
      <p className="text-[#6b7280] text-xs mt-0.5 truncate">{[lead.city, lead.contact_name].filter(Boolean).join(" · ") || "-"}</p>
      {lead.next_action_at && (
        <p className="text-xs mt-1.5" style={{ color: overdue ? "#ef4444" : "#9ca3af" }}>
          {formatDateTime(lead.next_action_at)}
        </p>
      )}
      {lead.priority === "high" && <p className="text-xs mt-1 text-red-400">Yüksek öncelik</p>}
    </Link>
  );
}

export default function CrmPage() {
  return (
    <Suspense>
      <CrmPageContent />
    </Suspense>
  );
}

function CrmPageContent() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const now = useNow();

  useEffect(() => {
    api<Lead[]>("/api/super-admin/crm/leads")
      .then(setLeads)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.stage] = (c[l.stage] ?? 0) + 1;
    return c;
  }, [leads]);

  const openLeads = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const weekEnd = now + 7 * 86400000;
  const followUps = openLeads.filter((l) => l.next_action_at && new Date(l.next_action_at).getTime() < weekEnd).length;
  const overdueFollowUps = openLeads.filter((l) => l.next_action_at && new Date(l.next_action_at).getTime() < now).length;
  const decided = (counts.won ?? 0) + (counts.lost ?? 0);
  const potential = openLeads.reduce((a, l) => a + (l.estimated_monthly_tokens ?? 0), 0);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return leads
      .filter((l) => filters.stages.length === 0 || filters.stages.includes(l.stage))
      .filter((l) => filters.types.length === 0 || filters.types.includes(norm(l.venue_type)))
      .filter((l) => filters.cities.length === 0 || filters.cities.includes(norm(l.city)))
      .filter((l) => filters.districts.length === 0 || filters.districts.includes(norm(l.district)))
      .filter((l) => filters.sources.length === 0 || filters.sources.includes(l.source))
      .filter((l) => filters.priorities.length === 0 || filters.priorities.includes(l.priority))
      .filter((l) => {
        const due = l.next_action_at ? new Date(l.next_action_at).getTime() : null;
        if (filters.followUp === "overdue") return due !== null && due < now;
        if (filters.followUp === "week") return due !== null && due < now + 7 * 86400000;
        if (filters.followUp === "none") return due === null && !l.next_action;
        return true;
      })
      .filter((l) => (filters.linked === "yes" ? !!l.venue_id : filters.linked === "no" ? !l.venue_id : true))
      .filter(
        (l) =>
          !q ||
          [l.name, l.contact_name, l.city, l.district, l.phone, l.venue_type].some((v) =>
            v?.toLocaleLowerCase("tr").includes(q)
          )
      )
      .sort((a, b) => {
        // Gecikmiş/yakın takipler önce, sonra son güncellenen
        const an = a.next_action_at ? new Date(a.next_action_at).getTime() : Infinity;
        const bn = b.next_action_at ? new Date(b.next_action_at).getTime() : Infinity;
        if (an !== bn) return an - bn;
        return a.updated_at < b.updated_at ? 1 : -1;
      });
  }, [leads, filters, query, now]);

  // Etkin filtreler: düğmenin yanında tek tek kaldırılabilir etiketler
  const activeTags: { key: string; label: string; remove: () => void }[] = [];
  if (!sameSet(filters.stages, OPEN_STAGES) && filters.stages.length > 0) {
    for (const st of filters.stages) {
      activeTags.push({ key: `s-${st}`, label: STAGE_META[st].label, remove: () => setFilters({ ...filters, stages: filters.stages.filter((x) => x !== st) }) });
    }
  }
  const labelOf = (field: "venue_type" | "city" | "district", k: string) => leads.find((l) => norm(l[field]) === k)?.[field].trim() ?? k;
  for (const k of filters.types) activeTags.push({ key: `t-${k}`, label: labelOf("venue_type", k), remove: () => setFilters({ ...filters, types: filters.types.filter((x) => x !== k) }) });
  for (const k of filters.cities) activeTags.push({ key: `c-${k}`, label: labelOf("city", k), remove: () => setFilters({ ...filters, cities: filters.cities.filter((x) => x !== k), districts: [] }) });
  for (const k of filters.districts) activeTags.push({ key: `d-${k}`, label: labelOf("district", k), remove: () => setFilters({ ...filters, districts: filters.districts.filter((x) => x !== k) }) });
  for (const k of filters.sources) activeTags.push({ key: `src-${k}`, label: SOURCE_LABEL[k], remove: () => setFilters({ ...filters, sources: filters.sources.filter((x) => x !== k) }) });
  for (const k of filters.priorities) activeTags.push({ key: `p-${k}`, label: `${PRIORITY_META[k].label} öncelik`, remove: () => setFilters({ ...filters, priorities: filters.priorities.filter((x) => x !== k) }) });
  if (filters.followUp !== "any") activeTags.push({ key: "f", label: FOLLOW_UP_LABEL[filters.followUp], remove: () => setFilters({ ...filters, followUp: "any" }) });
  if (filters.linked !== "any") activeTags.push({ key: "l", label: LINKED_LABEL[filters.linked], remove: () => setFilters({ ...filters, linked: "any" }) });
  const stageSummary = filters.stages.length === 0 ? "Tüm aşamalar" : sameSet(filters.stages, OPEN_STAGES) ? "Açık aşamalar" : null;

  const create = async (input: LeadInput) => {
    const { id } = await api<{ id: string }>("/api/super-admin/crm/leads", "POST", input);
    router.push(`/super-admin/crm/${id}`);
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Görüşmeler"
        subtitle="Aday mekanlar, görüşme geçmişi ve satış hattı"
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Yeni Aday
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Açık aday" value={openLeads.length} sub={`${counts.on_hold ?? 0} beklemede`} />
        <Stat
          label="7 gün içinde takip"
          value={followUps}
          sub={overdueFollowUps > 0 ? `${overdueFollowUps} gecikmiş` : "gecikme yok"}
          tone={overdueFollowUps > 0 ? "danger" : undefined}
        />
        <Stat
          label="Kazanılan"
          value={counts.won ?? 0}
          sub={decided > 0 ? `%${Math.round(((counts.won ?? 0) / decided) * 100)} kazanma oranı` : "henüz sonuç yok"}
          tone="good"
        />
        <Stat label="Hattaki potansiyel" value={`${formatNumber(potential)}`} sub="tahmini jeton / ay" />
      </div>

      <div className="relative flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className="flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-xl font-medium transition-all"
          style={{
            background: filterOpen || activeTags.length > 0 ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.06)",
            color: filterOpen || activeTags.length > 0 ? ACCENT : "#d1d5db",
            border: `1px solid ${filterOpen || activeTags.length > 0 ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          Filtrele
          {activeTags.length > 0 && (
            <span className="text-[11px] min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center" style={{ background: ACCENT, color: "#0f0a18" }}>
              {activeTags.length}
            </span>
          )}
        </button>
        {filterOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setFilterOpen(false)} />
            <FilterPanel leads={leads} filters={filters} setFilters={setFilters} resultCount={visible.length} onClose={() => setFilterOpen(false)} />
          </>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara: ad, yetkili, şehir, telefon…"
          className="flex-1 min-w-[200px] rounded-xl px-3.5 py-2.5 text-sm outline-none text-white"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
        <div className="hidden md:flex rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["list", "board"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: view === v ? "rgba(245,158,11,0.15)" : "transparent", color: view === v ? ACCENT : "#9ca3af" }}
            >
              {v === "list" ? "Liste" : "Pano"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
        <span className="text-[#6b7280] mr-1">
          {visible.length} aday{stageSummary && ` · ${stageSummary}`}
        </span>
        {activeTags.map((t) => (
          <button
            key={t.key}
            onClick={t.remove}
            className="flex items-center gap-1 px-2 py-1 rounded-lg"
            style={{ background: "rgba(245,158,11,0.1)", color: ACCENT }}
            title="Filtreyi kaldır"
          >
            {t.label} <span className="opacity-70">✕</span>
          </button>
        ))}
        {activeTags.length > 0 && (
          <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-[#9ca3af] hover:text-white underline ml-1">
            Sıfırla
          </button>
        )}
      </div>

      {loadError ? (
        <ErrorBox>Adaylar yüklenemedi, sayfayı yenileyin.</ErrorBox>
      ) : loading ? (
        <p className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : view === "board" ? (
        <div className="hidden md:grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${OPEN_STAGES.length}, minmax(170px, 1fr))` }}>
          {OPEN_STAGES.map((s) => {
            const items = visible.filter((l) => l.stage === s);
            return (
              <div key={s} className="min-w-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold" style={{ color: STAGE_META[s].color }}>
                    {STAGE_META[s].label}
                  </span>
                  <span className="text-xs text-[#6b7280]">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((l) => (
                    <BoardCard key={l.id} lead={l} now={now} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : visible.length === 0 ? (
        <Empty>{leads.length === 0 ? "Henüz aday yok — ilk adayı ekle ya da Mekan Talepleri'nden aktar" : "Bu filtrede aday yok"}</Empty>
      ) : (
        <Card className="overflow-hidden divide-y divide-white/[0.06]">
          {visible.map((l) => (
            <LeadRow key={l.id} lead={l} now={now} />
          ))}
        </Card>
      )}

      {creating && (
        <Modal title="Yeni Aday" onClose={() => setCreating(false)} wide>
          <LeadForm initial={EMPTY_LEAD} submitLabel="Adayı Ekle" onSubmit={create} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
