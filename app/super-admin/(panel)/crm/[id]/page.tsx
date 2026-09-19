"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  LEAD_STAGES,
  PRIORITY_META,
  SOURCE_LABEL,
  STAGE_META,
  formatDateTime,
  formatNumber,
  fromLocalInput,
  toLocalInput,
  type ActivityKind,
  type LeadStage,
  type Priority,
} from "@/lib/business";
import { ACCENT, Badge, Button, Card, ErrorBox, Modal, Select, TextArea, TextInput, api, useNow } from "@/components/super-admin/ui";
import LeadForm, { type LeadInput } from "@/components/super-admin/LeadForm";

type Activity = { id: string; kind: ActivityKind; summary: string; outcome: string; occurred_at: string };
type Task = { id: string; title: string; details: string; due_at: string | null; priority: Priority; done: boolean; done_at: string | null };
type LeadDetail = LeadInput & {
  id: string;
  venue_id: string | null;
  application_id: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  venues: { id: string; slug: string; name: string } | null;
  activities: Activity[];
  tasks: Task[];
};
type VenueOption = { venue: { id: string; name: string; slug: string }; contract: unknown | null };

const LOGGABLE = ACTIVITY_KINDS.filter((k) => k !== "stage_change");

function InfoRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[#6b7280] text-xs mb-0.5">{label}</p>
      {href ? (
        <a href={href} className="block text-sm text-[#d1d5db] hover:text-white truncate">
          {value}
        </a>
      ) : (
        <p className="text-sm text-[#d1d5db] break-words">{value}</p>
      )}
    </div>
  );
}

function ActivityComposer({ leadId, onAdded }: { leadId: string; onAdded: (a: Activity) => void }) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [at, setAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!summary.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const a = await api<Activity>(`/api/super-admin/crm/leads/${leadId}/activities`, "POST", {
        kind,
        summary,
        outcome,
        occurred_at: fromLocalInput(at),
      });
      onAdded(a);
      setSummary("");
      setOutcome("");
      setAt(toLocalInput(new Date().toISOString()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tür" value={kind} onChange={setKind} options={LOGGABLE.map((k) => ({ value: k, label: ACTIVITY_LABEL[k] }))} />
        <TextInput label="Tarih" type="datetime-local" value={at} onChange={setAt} />
      </div>
      <TextArea label="Ne konuşuldu?" value={summary} onChange={setSummary} rows={3} maxLength={4000} placeholder="Görüşmenin özeti…" />
      <TextInput label="Sonuç / karar" value={outcome} onChange={setOutcome} maxLength={1000} placeholder="Ör. demo için olumlu, fiyat düşünecek" />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={save} disabled={saving || !summary.trim()}>
          {saving ? "Kaydediliyor…" : "Görüşmeyi Kaydet"}
        </Button>
      </div>
    </div>
  );
}

function TaskList({ leadId, tasks, setTasks }: { leadId: string; tasks: Task[]; setTasks: (fn: (t: Task[]) => Task[]) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const now = useNow();

  const add = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const t = await api<Task>("/api/super-admin/tasks", "POST", { title, due_at: fromLocalInput(due), lead_id: leadId });
      setTasks((prev) => [t, ...prev]);
      setTitle("");
      setDue("");
    } catch {
      // alan dolu kalır, tekrar denenebilir
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    await api(`/api/super-admin/tasks/${t.id}`, "PATCH", { done: !t.done }).catch(() =>
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)))
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Yeni görev…"
          maxLength={200}
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none text-white"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm outline-none text-white [color-scheme:dark]"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
        <Button variant="accent" onClick={add} disabled={saving || !title.trim()}>
          Ekle
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-[#6b7280] text-xs">Bu adaya bağlı görev yok</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => {
            const late = !t.done && t.due_at && new Date(t.due_at).getTime() < now;
            return (
              <li key={t.id} className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="mt-1 accent-amber-500" />
                <div className="min-w-0">
                  <p className={t.done ? "text-[#6b7280] line-through" : "text-[#d1d5db]"}>{t.title}</p>
                  {t.due_at && (
                    <p className="text-xs" style={{ color: late ? "#ef4444" : "#6b7280" }}>
                      {formatDateTime(t.due_at)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function LeadDetailPage() {
  return (
    <Suspense>
      <LeadDetail />
    </Suspense>
  );
}

function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueChoice, setVenueChoice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  const now = useNow();

  const load = useCallback(() => {
    api<LeadDetail>(`/api/super-admin/crm/leads/${id}`)
      .then(setLead)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Yüklenemedi"));
  }, [id]);

  useEffect(load, [load]);

  const patch = async (body: Partial<LeadInput> & { venue_id?: string | null }) => {
    await api(`/api/super-admin/crm/leads/${id}`, "PATCH", body);
    load();
  };

  const setStage = async (stage: LeadStage) => {
    if (!lead || lead.stage === stage) return;
    if (stage === "lost") {
      setEditing(true);
      setLead({ ...lead, stage });
      return;
    }
    await patch({ stage }).catch((e) => setNotice(e.message));
  };

  const openLinking = async () => {
    setLinking(true);
    if (venues.length === 0) {
      const list = await api<VenueOption[]>("/api/super-admin/contracts").catch(() => []);
      setVenues(list);
    }
  };

  const linkVenue = async () => {
    if (!venueChoice || !lead) return;
    await patch({ venue_id: venueChoice, stage: "won" });
    setLinking(false);
    // Teklif edilen komisyon varsa ve mekanın sözleşmesi yoksa sözleşmeyi başlat
    const option = venues.find((v) => v.venue.id === venueChoice);
    if (!option?.contract && lead.proposed_commission_pct !== null) {
      await api(`/api/super-admin/contracts/${venueChoice}`, "PUT", {
        commission_pct: lead.proposed_commission_pct,
        payment_day: 15,
        contact_name: lead.contact_name,
        contact_phone: lead.phone,
        billing_email: lead.email,
        start_date: new Date().toISOString().slice(0, 10),
      })
        .then(() => setNotice(`Sözleşme %${lead.proposed_commission_pct} komisyonla açıldı — banka bilgilerini Sözleşmeler'den tamamla`))
        .catch(() => {});
    }
  };

  const remove = async () => {
    await api(`/api/super-admin/crm/leads/${id}`, "DELETE");
    router.push("/super-admin/crm");
  };

  if (loadError) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto">
        <ErrorBox>{loadError}</ErrorBox>
      </div>
    );
  }
  if (!lead) return <p className="py-16 text-center text-[#6b7280] text-sm">Yükleniyor…</p>;

  const stage = STAGE_META[lead.stage];
  const newVenueHref = `/super-admin/venues/new?name=${encodeURIComponent(lead.name)}`;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <Link href="/super-admin/crm" className="text-xs text-[#9ca3af] hover:text-white">
        ← Görüşmeler
      </Link>

      <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-white">{lead.name}</h1>
            <Badge label={stage.label} color={stage.color} />
            <Badge label={PRIORITY_META[lead.priority].label} color={PRIORITY_META[lead.priority].color} />
          </div>
          <p className="text-[#6b7280] text-xs mt-1">
            {SOURCE_LABEL[lead.source]} · eklendi {formatDateTime(lead.created_at)} · bu aşamada {formatDateTime(lead.stage_changed_at)}’den beri
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}>Düzenle</Button>
          {confirmDelete ? (
            <>
              <Button onClick={() => setConfirmDelete(false)}>Vazgeç</Button>
              <Button variant="danger" onClick={remove}>
                Kalıcı Olarak Sil
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Sil
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm border" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", color: ACCENT }}>
          {notice}
        </div>
      )}

      {/* Aşama şeridi */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {LEAD_STAGES.map((s) => {
          const active = lead.stage === s;
          return (
            <button
              key={s}
              onClick={() => setStage(s)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: active ? `${STAGE_META[s].color}24` : "rgba(255,255,255,0.05)",
                color: active ? STAGE_META[s].color : "#6b7280",
                border: `1px solid ${active ? `${STAGE_META[s].color}66` : "transparent"}`,
              }}
            >
              {STAGE_META[s].label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 min-w-0">
          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-4">Görüşme Ekle</h2>
            <ActivityComposer leadId={lead.id} onAdded={(a) => setLead({ ...lead, activities: [a, ...lead.activities] })} />
          </Card>

          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-4">Görüşme Geçmişi ({lead.activities.length})</h2>
            {lead.activities.length === 0 ? (
              <p className="text-[#6b7280] text-xs">Henüz kayıt yok</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {lead.activities.map((a) => (
                  <li key={a.id} className="border-l-2 pl-3" style={{ borderColor: a.kind === "stage_change" ? "#6b7280" : ACCENT }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: a.kind === "stage_change" ? "#9ca3af" : ACCENT }}>
                        {ACTIVITY_LABEL[a.kind]}
                      </span>
                      <span className="text-xs text-[#6b7280]">{formatDateTime(a.occurred_at)}</span>
                      {a.kind !== "stage_change" && (
                        <button
                          onClick={async () => {
                            setLead({ ...lead, activities: lead.activities.filter((x) => x.id !== a.id) });
                            await api(`/api/super-admin/crm/activities/${a.id}`, "DELETE").catch(load);
                          }}
                          className="text-xs text-[#6b7280] hover:text-red-400 ml-auto"
                        >
                          sil
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-[#d1d5db] mt-1 whitespace-pre-wrap break-words">{a.summary}</p>
                    {a.outcome && <p className="text-xs text-[#9ca3af] mt-1">→ {a.outcome}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-3">Sonraki Adım</h2>
            {lead.next_action || lead.next_action_at ? (
              <>
                <p className="text-sm text-[#d1d5db]">{lead.next_action || "Takip"}</p>
                {lead.next_action_at && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: new Date(lead.next_action_at).getTime() < now ? "#ef4444" : "#9ca3af" }}
                  >
                    {formatDateTime(lead.next_action_at)}
                  </p>
                )}
                <div className="mt-3">
                  <Button onClick={() => patch({ next_action: "", next_action_at: null })}>Tamamlandı</Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#6b7280]">
                Planlanmış adım yok. <button className="underline" onClick={() => setEditing(true)}>Ekle</button>
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-3">Bilgiler</h2>
            <div className="grid gap-3">
              <InfoRow label="Yetkili" value={[lead.contact_name, lead.contact_role].filter(Boolean).join(" — ")} />
              <InfoRow label="Telefon" value={lead.phone} href={`tel:${lead.phone.replace(/\s/g, "")}`} />
              <InfoRow label="E-posta" value={lead.email} href={`mailto:${lead.email}`} />
              <InfoRow label="Konum" value={[lead.address, lead.district, lead.city].filter(Boolean).join(", ")} />
              <InfoRow label="Tür" value={lead.venue_type} />
              <InfoRow
                label="Instagram"
                value={lead.instagram}
                href={lead.instagram ? `https://instagram.com/${lead.instagram.replace(/^@/, "")}` : undefined}
              />
              <InfoRow label="Kapasite" value={lead.capacity !== null ? `${formatNumber(lead.capacity)} kişi` : ""} />
              <InfoRow
                label="Tahmini aylık jeton"
                value={lead.estimated_monthly_tokens !== null ? formatNumber(lead.estimated_monthly_tokens) : ""}
              />
              <InfoRow
                label="Teklif edilen komisyon"
                value={lead.proposed_commission_pct !== null ? `%${formatNumber(lead.proposed_commission_pct)}` : ""}
              />
              <InfoRow label="Kaybetme sebebi" value={lead.stage === "lost" ? lead.lost_reason : ""} />
              <InfoRow label="Notlar" value={lead.notes} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-3">Mekan</h2>
            {lead.venues ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{lead.venues.name}</p>
                  <p className="text-xs text-[#6b7280] font-mono">{lead.venues.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/super-admin/contracts" className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "rgba(245,158,11,0.12)", color: ACCENT }}>
                    Sözleşme
                  </Link>
                  <Button onClick={() => patch({ venue_id: null })}>Bağı kaldır</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[#6b7280]">Anlaşma olunca mekan hesabını açıp bu adaya bağla.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={newVenueHref} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "rgba(245,158,11,0.12)", color: ACCENT }}>
                    Mekan Oluştur
                  </Link>
                  <Button onClick={openLinking}>Mevcut Mekana Bağla</Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-white font-semibold text-sm mb-3">Görevler</h2>
            <TaskList
              leadId={lead.id}
              tasks={lead.tasks}
              setTasks={(fn) => setLead((prev) => (prev ? { ...prev, tasks: fn(prev.tasks) } : prev))}
            />
          </Card>
        </div>
      </div>

      {editing && (
        <Modal title="Adayı Düzenle" onClose={() => { setEditing(false); load(); }} wide>
          <LeadForm
            initial={lead}
            submitLabel="Kaydet"
            onCancel={() => { setEditing(false); load(); }}
            onSubmit={async (input) => {
              await patch(input);
              setEditing(false);
            }}
          />
        </Modal>
      )}

      {linking && (
        <Modal title="Mevcut Mekana Bağla" onClose={() => setLinking(false)}>
          <div className="flex flex-col gap-4">
            <Select
              label="Mekan"
              value={venueChoice}
              onChange={setVenueChoice}
              options={[{ value: "", label: venues.length ? "Seç…" : "Yükleniyor…" }, ...venues.map((v) => ({ value: v.venue.id, label: v.venue.name }))]}
            />
            <p className="text-xs text-[#6b7280]">
              Bağlanınca aday “Kazanıldı” olur.
              {lead.proposed_commission_pct !== null && ` Mekanın sözleşmesi yoksa %${formatNumber(lead.proposed_commission_pct)} komisyonla otomatik açılır.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setLinking(false)}>Vazgeç</Button>
              <Button variant="primary" onClick={linkVenue} disabled={!venueChoice}>
                Bağla
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
