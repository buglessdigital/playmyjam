"use client";

import { useState } from "react";

type PmjList = { id: string; name: string; song_count: number; visible: boolean };

/**
 * Sol raydaki "PMJ Listeleri" çubuğu (0081): PMJ'nin hazırladığı listeler.
 * Açılır-kapanır; tıklanınca listeler yüklenir. Göz düğmesi listeyi müşteriye
 * açar/kapatır. Açılan liste mekanın kendi listeleri gibi rayda görünmez ve
 * otomatik çalmaya girmez — yalnızca müşterinin seçebileceği şarkılara eklenir.
 * PMJ listeyi güncelledikçe açık listeler kendiliğinden güncellenir.
 */
export default function PmjListsBar() {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<PmjList[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setError("");
    fetch("/api/admin/pmj-playlists")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error ?? "Listeler yüklenemedi");
        setLists(d.playlists as PmjList[]);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Listeler yüklenemedi"));
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && lists === null) load();
  };

  const setVisible = async (list: PmjList, visible: boolean) => {
    if (busy) return;
    setBusy(list.id);
    setError("");
    setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, visible } : l)) ?? prev);
    try {
      const res = await fetch("/api/admin/pmj-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmj_playlist_id: list.id, visible }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "İşlem başarısız");
      }
    } catch (err) {
      setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, visible: !visible } : l)) ?? prev);
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setBusy(null);
    }
  };

  const openCount = lists?.filter((l) => l.visible).length ?? 0;

  return (
    <div
      className="rounded-2xl shrink-0"
      style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)" }}
    >
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 flex items-center gap-3"
      >
        <span
          className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-black"
          style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
        >
          PMJ
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#fde68a]">PMJ Listeleri</p>
          <p className="text-[#9ca3af] text-[11px] mt-0.5">
            {lists === null ? "Hazır listeler — onaysız çalınabilir" : `${lists.length} liste · ${openCount} açık`}
          </p>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none", color: "#fbbf24" }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-2 pb-2 flex flex-col gap-1">
          <p className="text-[11px] text-[#9ca3af] px-1.5 pb-1 leading-relaxed">
            Açtığınız listedeki şarkıları müşteriler talep onayı beklemeden seçebilir. Otomatik çalmaya karışmaz.
          </p>
          {lists === null && !error && <p className="text-[11px] text-[#6b7280] px-1.5 py-1">Yükleniyor…</p>}
          {lists?.length === 0 && <p className="text-[11px] text-[#6b7280] px-1.5 py-1">Henüz PMJ listesi yok</p>}
          {lists?.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate" style={{ color: l.visible ? "#e5e7eb" : "#9ca3af" }}>
                  {l.name}
                </p>
                <p className="text-[11px] text-[#6b7280]">{l.song_count} şarkı</p>
              </div>
              <button
                onClick={() => setVisible(l, !l.visible)}
                disabled={busy !== null}
                aria-pressed={l.visible}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50"
                style={{
                  background: l.visible ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)",
                  color: l.visible ? "#22c55e" : "#6b7280",
                }}
                title={
                  l.visible
                    ? "Müşteriye açık — kapatmak için tıklayın"
                    : "Müşteriye kapalı — açmak için tıklayın"
                }
              >
                {busy === l.id ? (
                  <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
                    {!l.visible && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                  </svg>
                )}
              </button>
            </div>
          ))}
          {error && <p className="text-[11px] px-1.5 py-1" style={{ color: "#f87171" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
