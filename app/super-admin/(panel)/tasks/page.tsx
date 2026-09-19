"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PRIORITIES, PRIORITY_META, formatDateTime, fromLocalInput, type Priority } from "@/lib/business";
import { Badge, Button, Card, Empty, ErrorBox, FilterChips, Modal, PageHeader, Select, TextArea, TextInput, api } from "@/components/super-admin/ui";

type Task = {
  id: string;
  title: string;
  details: string;
  due_at: string | null;
  priority: Priority;
  done: boolean;
  done_at: string | null;
  created_at: string;
  lead_id: string | null;
  venue_id: string | null;
  crm_leads: { id: string; name: string } | null;
  venues: { id: string; name: string; slug: string } | null;
};

type Filter = "overdue" | "today" | "week" | "open" | "nodate" | "done";

function startOfTomorrow() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function bucket(t: Task): Exclude<Filter, "open" | "done"> | "later" {
  if (!t.due_at) return "nodate";
  const due = new Date(t.due_at).getTime();
  if (due < Date.now()) return "overdue";
  if (due < startOfTomorrow()) return "today";
  if (due < startOfTomorrow() + 6 * 86400000) return "week";
  return "later";
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Task) => void }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [link, setLink] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ id: string; name: string }[]>("/api/super-admin/crm/leads").catch(() => []),
      api<{ venue: { id: string; name: string } }[]>("/api/super-admin/contracts").catch(() => []),
    ]).then(([leads, venues]) =>
      setOptions([
        ...venues.map((v) => ({ value: `venue:${v.venue.id}`, label: `Mekan — ${v.venue.name}` })),
        ...leads.map((l) => ({ value: `lead:${l.id}`, label: `Aday — ${l.name}` })),
      ])
    );
  }, []);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    const [kind, id] = link.split(":");
    try {
      const t = await api<Task>("/api/super-admin/tasks", "POST", {
        title,
        details,
        due_at: fromLocalInput(due),
        priority,
        lead_id: kind === "lead" ? id : null,
        venue_id: kind === "venue" ? id : null,
      });
      onCreated(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eklenemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title="Yeni Görev" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TextInput label="Görev *" value={title} onChange={setTitle} maxLength={200} placeholder="Ör. Mezzanine'e ekim hakedişini ilet" />
        <TextArea label="Açıklama" value={details} onChange={setDetails} rows={2} maxLength={2000} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Son tarih" type="datetime-local" value={due} onChange={setDue} />
          <Select label="Öncelik" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        </div>
        <Select label="Bağlantı" value={link} onChange={setLink} options={[{ value: "", label: "Bağımsız görev" }, ...options]} />
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Vazgeç</Button>
          <Button variant="primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? "Ekleniyor…" : "Görevi Ekle"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<Task[]>("/api/super-admin/tasks")
      .then(setTasks)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, week: 0, open: 0, nodate: 0, done: 0 };
    for (const t of tasks) {
      if (t.done) {
        c.done++;
        continue;
      }
      c.open++;
      const b = bucket(t);
      if (b !== "later") c[b]++;
    }
    return c;
  }, [tasks]);

  const visible = tasks.filter((t) => {
    if (filter === "done") return t.done;
    if (t.done) return false;
    if (filter === "open") return true;
    if (filter === "week") return ["overdue", "today", "week"].includes(bucket(t));
    return bucket(t) === filter;
  });

  const toggle = async (t: Task) => {
    const done = !t.done;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    await api(`/api/super-admin/tasks/${t.id}`, "PATCH", { done }).catch(() =>
      setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)))
    );
  };

  const remove = async (t: Task) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await api(`/api/super-admin/tasks/${t.id}`, "DELETE").catch(() => setTasks((prev) => [t, ...prev]));
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Görevler"
        subtitle={`${counts.open} açık görev${counts.overdue ? ` · ${counts.overdue} gecikmiş` : ""}`}
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Yeni Görev
          </Button>
        }
      />

      <div className="mb-5">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { key: "open", label: "Tüm açıklar", count: counts.open },
            { key: "overdue", label: "Gecikmiş", count: counts.overdue, color: "#ef4444" },
            { key: "today", label: "Bugün", count: counts.today },
            { key: "week", label: "7 gün", count: counts.overdue + counts.today + counts.week },
            { key: "nodate", label: "Tarihsiz", count: counts.nodate },
            { key: "done", label: "Tamamlanan (30 gün)", count: counts.done, color: "#22c55e" },
          ]}
        />
      </div>

      {loadError ? (
        <ErrorBox>Görevler yüklenemedi, sayfayı yenileyin.</ErrorBox>
      ) : loading ? (
        <p className="py-10 text-center text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <Empty>Bu filtrede görev yok</Empty>
      ) : (
        <Card className="divide-y divide-white/[0.06]">
          {visible.map((t) => {
            const b = bucket(t);
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3.5">
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="mt-1 accent-amber-500 w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${t.done ? "text-[#6b7280] line-through" : "text-white"}`}>{t.title}</span>
                    {t.priority !== "normal" && <Badge label={PRIORITY_META[t.priority].label} color={PRIORITY_META[t.priority].color} />}
                  </div>
                  {t.details && <p className="text-xs text-[#9ca3af] mt-0.5 whitespace-pre-wrap break-words">{t.details}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                    {t.due_at && (
                      <span style={{ color: !t.done && b === "overdue" ? "#ef4444" : !t.done && b === "today" ? "#f59e0b" : "#6b7280" }}>
                        {formatDateTime(t.due_at)}
                      </span>
                    )}
                    {t.crm_leads && (
                      <Link href={`/super-admin/crm/${t.crm_leads.id}`} className="text-[#9ca3af] hover:text-white">
                        Aday: {t.crm_leads.name}
                      </Link>
                    )}
                    {t.venues && <span className="text-[#9ca3af]">Mekan: {t.venues.name}</span>}
                    {t.done && t.done_at && <span className="text-[#22c55e]">Tamamlandı {formatDateTime(t.done_at)}</span>}
                  </div>
                </div>
                <button onClick={() => remove(t)} className="text-xs text-[#6b7280] hover:text-red-400 shrink-0">
                  sil
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {creating && (
        <NewTaskModal
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            setTasks((prev) => [t, ...prev]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
