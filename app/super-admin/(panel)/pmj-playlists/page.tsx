"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT, Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, TextInput, api } from "@/components/super-admin/ui";
import type { PmjPlaylistSummary, PmjSong, ResolvedRow } from "@/lib/pmj-playlists";

// PMJ Listeleri (0081): PMJ'nin hazırladığı ortak listeler. Excel'den içe
// aktarılır, mekanlar kendi panellerindeki "PMJ Listeleri" çubuğundan istediğini
// müşteriye açar. Bir liste güncellenince açmış bütün mekanlarda güncellenir.
//
// Akış: dosya yüklenir → her satır havuzdaki bir şarkıya bağlanır (ÖNİZLEME,
// hiçbir liste yazılmaz) → bulunamayanlar link yapıştırılarak düzeltilir ya da
// çıkarılır → "Kaydet". Aynı adda liste varsa içeriği yenisiyle değiştirilir.

type PreviewList = { name: string; rows: ResolvedRow[] };

const STATUS: Record<ResolvedRow["status"], { label: string; color: string }> = {
  ok: { label: "bulundu", color: "#22c55e" },
  not_found: { label: "havuzda yok", color: "#f59e0b" },
  unplayable: { label: "çalınamaz", color: "#ef4444" },
  bad_link: { label: "link hatalı", color: "#ef4444" },
};

const sayi = (n: number) => n.toLocaleString("tr-TR");

function tarih(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Berkay'ın dolduracağı boş şablon. ";" ayraçlı + BOM: Türkçe Excel doğrudan açar.
function downloadTemplate() {
  const csv =
    "﻿Playlist;Şarkı;Sanatçı;YouTube linki\n" +
    "Türkçe Pop Hitler;Ben Değilim;Mela Bedel;https://music.youtube.com/watch?v=rqa0KYdzoEc\n" +
    "Türkçe Pop Hitler;Sımsıkı;Kenan Doğulu;\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pmj-liste-sablonu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function PmjPlaylistsPage() {
  const [lists, setLists] = useState<PmjPlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewList[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [quotaHit, setQuotaHit] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [openList, setOpenList] = useState<PmjPlaylistSummary | null>(null);

  const reload = () =>
    api<{ playlists: PmjPlaylistSummary[] }>("/api/super-admin/pmj-playlists")
      .then((d) => setLists(d.playlists))
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    let alive = true;
    api<{ playlists: PmjPlaylistSummary[] }>("/api/super-admin/pmj-playlists")
      .then((d) => alive && setLists(d.playlists))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/super-admin/pmj-playlists/import", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Dosya okunamadı");
      setPreview(data.lists as PreviewList[]);
      setProblems(data.problems ?? []);
      setQuotaHit(!!data.quotaHit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya okunamadı");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateRow = (listIdx: number, rowIdx: number, row: ResolvedRow | null) =>
    setPreview((prev) =>
      prev?.map((l, i) =>
        i !== listIdx
          ? l
          : { ...l, rows: row ? l.rows.map((r, j) => (j === rowIdx ? row : r)) : l.rows.filter((_, j) => j !== rowIdx) }
      ) ?? prev
    );

  const renamePreview = (listIdx: number, name: string) =>
    setPreview((prev) => prev?.map((l, i) => (i === listIdx ? { ...l, name } : l)) ?? prev);

  const saveList = async (listIdx: number) => {
    const list = preview?.[listIdx];
    if (!list) return;
    const songIds = list.rows.filter((r) => r.status === "ok" && r.song).map((r) => r.song!.id);
    if (songIds.length === 0) {
      setError(`"${list.name}" listesinde kaydedilecek şarkı yok`);
      return;
    }
    setSaving(list.name);
    setError(null);
    try {
      const res = await api<{ created: boolean; added: number; removed: number; venues: number }>(
        "/api/super-admin/pmj-playlists",
        "POST",
        { name: list.name, song_ids: songIds }
      );
      setNotice(
        `"${list.name}" ${res.created ? "oluşturuldu" : "güncellendi"}: ${songIds.length} şarkı` +
          (res.created ? "" : ` (+${res.added} / −${res.removed})`) +
          (res.venues > 0 ? ` · ${res.venues} mekanda güncellendi` : "")
      );
      setPreview((prev) => {
        const next = prev?.filter((_, i) => i !== listIdx) ?? null;
        return next && next.length > 0 ? next : null;
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(null);
    }
  };

  const existingNames = new Set((lists ?? []).map((l) => l.name.toLocaleLowerCase("tr")));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="PMJ Listeleri"
        subtitle="PMJ'nin hazır listeleri — mekanlar panelden açar, müşteriler onaysız seçer. Otomatik çalmaya girmez."
      />

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      {notice && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-400 bg-green-500/10 border border-green-500/20">{notice}</div>
      )}

      <Card className="p-5 mb-6">
        <h2 className="text-white font-semibold mb-1">Excel&apos;den içe aktar</h2>
        <p className="text-[#9ca3af] text-xs leading-relaxed mb-4">
          Sütunlar: <b className="text-white">Playlist · Şarkı · Sanatçı · YouTube linki</b> (başlık satırı şart, sıra
          serbest). Her satır bir şarkı; tüm listeler tek sayfada olabilir. &quot;Playlist&quot; sütunu yoksa her sayfa bir
          liste sayılır. Link varsa eşleşme birebir olur ve havuzda olmayan şarkı da eklenir; link yoksa şarkı + sanatçıyla
          havuzda aranır. Önizlemede hiçbir şey kaydedilmez. Aynı adda liste varsa içeriği yenisiyle değiştirilir.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button variant="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Okunuyor ve eşleştiriliyor…" : "Excel / CSV seç"}
          </Button>
          <Button onClick={downloadTemplate}>Boş şablonu indir</Button>
          {uploading && <span className="text-[#9ca3af] text-xs">Satır başına havuz araması yapılıyor; 1.000 satır ~1 dk.</span>}
        </div>
      </Card>

      {preview && (
        <div className="mb-8">
          {quotaHit && (
            <div className="mb-3">
              <ErrorBox>YouTube kotası doldu: havuzda olmayan linkli şarkılar eklenemedi (&quot;çalınamaz&quot; görünür). Yarın tekrar yükleyin.</ErrorBox>
            </div>
          )}
          {problems.length > 0 && (
            <Card className="p-4 mb-3">
              <p className="text-[#fbbf24] text-xs font-semibold mb-1">Okunamayan satırlar ({problems.length})</p>
              <ul className="text-[#9ca3af] text-xs space-y-0.5 max-h-32 overflow-y-auto">
                {problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </Card>
          )}
          {preview.map((list, li) => (
            <PreviewCard
              key={`${list.name}-${li}`}
              list={list}
              replaces={existingNames.has(list.name.trim().toLocaleLowerCase("tr"))}
              saving={saving === list.name}
              onRename={(name) => renamePreview(li, name)}
              onRow={(ri, row) => updateRow(li, ri, row)}
              onSave={() => saveList(li)}
              onDiscard={() =>
                setPreview((prev) => {
                  const next = prev?.filter((_, i) => i !== li) ?? null;
                  return next && next.length > 0 ? next : null;
                })
              }
            />
          ))}
        </div>
      )}

      <h2 className="text-white font-semibold mb-3">Kayıtlı listeler</h2>
      {lists === null ? (
        <p className="text-[#6b7280] text-sm">Yükleniyor…</p>
      ) : lists.length === 0 ? (
        <Empty>Henüz PMJ listesi yok — yukarıdan Excel yükleyin.</Empty>
      ) : (
        <div className="grid gap-2">
          {lists.map((l) => (
            <Card key={l.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold truncate">{l.name}</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  {sayi(l.song_count)} şarkı · {l.venue_count} mekanda açık · güncelleme {tarih(l.updated_at)}
                </p>
              </div>
              <Button variant="accent" onClick={() => setOpenList(l)}>Aç</Button>
            </Card>
          ))}
        </div>
      )}

      {openList && (
        <ListModal
          list={openList}
          onClose={() => setOpenList(null)}
          onChanged={() => void reload()}
          onDeleted={() => {
            setOpenList(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function PreviewCard({
  list,
  replaces,
  saving,
  onRename,
  onRow,
  onSave,
  onDiscard,
}: {
  list: PreviewList;
  replaces: boolean;
  saving: boolean;
  onRename: (name: string) => void;
  onRow: (rowIdx: number, row: ResolvedRow | null) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const counts = { ok: 0, not_found: 0, unplayable: 0, bad_link: 0 };
  for (const r of list.rows) counts[r.status]++;
  const problemCount = list.rows.length - counts.ok;
  const shown = list.rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => !onlyProblems || row.status !== "ok");

  return (
    <Card className="p-4 mb-3">
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[200px]">
          <TextInput label="Liste adı" value={list.name} onChange={onRename} maxLength={40} />
        </div>
        <div className="flex flex-wrap gap-1.5 pb-2">
          <Badge label={`${counts.ok} bulundu`} color="#22c55e" />
          {counts.not_found > 0 && <Badge label={`${counts.not_found} havuzda yok`} color="#f59e0b" />}
          {counts.unplayable + counts.bad_link > 0 && (
            <Badge label={`${counts.unplayable + counts.bad_link} çalınamaz/hatalı`} color="#ef4444" />
          )}
          {replaces && <Badge label="mevcut listenin yerine geçer" color="#60a5fa" />}
        </div>
        <div className="flex gap-2 pb-0.5">
          <Button onClick={onDiscard}>Vazgeç</Button>
          <Button variant="primary" disabled={saving || counts.ok === 0 || !list.name.trim()} onClick={onSave}>
            {saving ? "Kaydediliyor…" : `${counts.ok} şarkıyı kaydet`}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2 text-xs">
        <button
          className="underline-offset-2 hover:underline"
          style={{ color: onlyProblems ? ACCENT : "#9ca3af" }}
          onClick={() => setOnlyProblems(true)}
        >
          Sorunlu satırlar ({problemCount})
        </button>
        <button
          className="underline-offset-2 hover:underline"
          style={{ color: !onlyProblems ? ACCENT : "#9ca3af" }}
          onClick={() => setOnlyProblems(false)}
        >
          Tümü ({list.rows.length})
        </button>
        <span className="text-[#6b7280]">Bulunamayan satırlar kaydedilmez; link yapıştırıp düzeltebilirsiniz.</span>
      </div>

      {shown.length === 0 ? (
        <p className="text-[#22c55e] text-xs py-2">Bütün satırlar havuzda bulundu.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-white/5">
          {shown.map(({ row, idx }) => (
            <PreviewRow key={`${row.sheet}-${row.line}-${idx}`} row={row} onChange={(r) => onRow(idx, r)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function PreviewRow({ row, onChange }: { row: ResolvedRow; onChange: (row: ResolvedRow | null) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const st = STATUS[row.status];

  const fix = async () => {
    if (!link.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ row: ResolvedRow }>("/api/super-admin/pmj-playlists/resolve", "POST", { ...row, link });
      if (res.row.status !== "ok") setErr(STATUS[res.row.status].label);
      else onChange({ ...res.row, title: row.title, artist: row.artist });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Çözülemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 py-2 border-b border-white/5 text-xs flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[#6b7280] w-14 shrink-0">satır {row.line}</span>
      <span className="text-white min-w-[160px] flex-1 truncate">
        {row.artist || "—"} — {row.title || "—"}
      </span>
      <Badge label={row.via === "match" && row.status === "ok" ? "ad ile bulundu" : st.label} color={st.color} />
      {row.song && (
        <span className="text-[#9ca3af] min-w-[160px] flex-1 truncate" title={row.song.channel_title ?? ""}>
          → {row.song.artist} — {row.song.title}
          <a
            href={`https://www.youtube.com/watch?v=${row.song.youtube_video_id}`}
            target="_blank"
            rel="noreferrer"
            className="ml-1.5 underline"
            style={{ color: ACCENT }}
          >
            izle
          </a>
        </span>
      )}
      {row.status !== "ok" && (
        <span className="flex items-center gap-1.5 flex-1 min-w-[260px]">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="YouTube linki yapıştır"
            className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 outline-none text-white"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <Button variant="accent" disabled={busy || !link.trim()} onClick={fix}>
            {busy ? "…" : "Düzelt"}
          </Button>
        </span>
      )}
      {row.status === "ok" && row.via === "match" && (
        <span className="flex items-center gap-1.5">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="yanlışsa doğru link"
            className="w-44 rounded-lg px-2.5 py-1.5 outline-none text-white"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          {link.trim() && (
            <Button variant="accent" disabled={busy} onClick={fix}>{busy ? "…" : "Değiştir"}</Button>
          )}
        </span>
      )}
      <button onClick={() => onChange(null)} className="text-[#6b7280] hover:text-red-400 px-1" title="Bu satırı listeden çıkar">
        ✕
      </button>
      {err && <span className="w-full text-red-400">{err}</span>}
    </div>
  );
}

function ListModal({
  list,
  onClose,
  onChanged,
  onDeleted,
}: {
  list: PmjPlaylistSummary;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [songs, setSongs] = useState<PmjSong[] | null>(null);
  const [name, setName] = useState(list.name);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ songs: PmjSong[] }>(`/api/super-admin/pmj-playlists?id=${list.id}`)
      .then((d) => alive && setSongs(d.songs))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [list.id]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={list.name} onClose={onClose} wide>
      <div className="flex items-end gap-2 mb-4">
        <div className="flex-1">
          <TextInput label="Ad" value={name} onChange={setName} maxLength={40} />
        </div>
        <Button
          variant="accent"
          disabled={busy || !name.trim() || name.trim() === list.name}
          onClick={() => run(async () => {
            await api("/api/super-admin/pmj-playlists", "PATCH", { id: list.id, name });
            onChanged();
          })}
        >
          Adı kaydet
        </Button>
      </div>

      <p className="text-[#6b7280] text-xs mb-2">
        {songs ? `${songs.length} şarkı` : "Yükleniyor…"} · {list.venue_count} mekanda açık. Çıkardığınız şarkı bu mekanlardan da düşer.
        İçeriği topluca değiştirmek için aynı adla yeni Excel yükleyin.
      </p>
      {err && <div className="mb-2"><ErrorBox>{err}</ErrorBox></div>}

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-white/5 mb-4">
        {songs?.map((s, i) => (
          <div key={s.id} className="px-3 py-2 border-b border-white/5 text-xs flex items-center gap-3">
            <span className="text-[#6b7280] w-8 shrink-0">{i + 1}</span>
            <span className="text-white flex-1 min-w-0 truncate">
              {s.artist} — {s.title}
            </span>
            <span className="text-[#6b7280] truncate max-w-[30%]">{s.channel_title}</span>
            <button
              disabled={busy}
              onClick={() => run(async () => {
                await api("/api/super-admin/pmj-playlists", "PATCH", { id: list.id, remove_song_id: s.id });
                setSongs((prev) => prev?.filter((x) => x.id !== s.id) ?? prev);
                onChanged();
              })}
              className="text-[#6b7280] hover:text-red-400 px-1 disabled:opacity-40"
              title="Listeden çıkar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-xs text-red-400">
            {list.venue_count > 0 ? `${list.venue_count} mekandan da kalkacak.` : ""} Emin misiniz?
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => run(async () => {
                await api("/api/super-admin/pmj-playlists", "DELETE", { id: list.id });
                onDeleted();
              })}
            >
              Evet, sil
            </Button>
            <Button onClick={() => setConfirmDelete(false)}>Vazgeç</Button>
          </span>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Listeyi sil</Button>
        )}
        <Button onClick={onClose}>Kapat</Button>
      </div>
    </Modal>
  );
}
