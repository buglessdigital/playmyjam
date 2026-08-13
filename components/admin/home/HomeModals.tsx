"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDur, type Library, type Playlist } from "./useLibrary";
import type { Playback } from "./usePlayback";

export type ModalKind = "newList" | "rename" | "import" | "addSong" | "addQueue" | null;

type SearchTrack = {
  youtube_video_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
  duration_ms: number;
};

const tabStyle = (selected: boolean) => ({
  background: selected ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.05)",
  border: `1px solid ${selected ? "rgba(233,30,140,0.5)" : "rgba(255,255,255,0.08)"}`,
  color: selected ? "#f9a8d4" : "#9ca3af",
});

const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

function Shell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative w-full ${wide ? "max-w-md" : "max-w-sm"} rounded-2xl border border-white/10 p-6 flex flex-col max-h-[85vh]`}
        style={{ background: "#1a1025" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Ana ekranın tüm kutucukları: liste oluştur/adlandır, YouTube içe aktar, şarkı ara. */
export default function HomeModals({
  kind,
  onClose,
  lib,
  playback,
}: {
  kind: ModalKind;
  onClose: () => void;
  lib: Library;
  playback: Playback;
}) {
  if (!kind) return null;
  if (kind === "newList" || kind === "rename") {
    return <ListNameModal kind={kind} onClose={onClose} lib={lib} />;
  }
  if (kind === "import") return <ImportModal onClose={onClose} lib={lib} />;
  return <SearchModal kind={kind} onClose={onClose} lib={lib} playback={playback} />;
}

function ListNameModal({ kind, onClose, lib }: { kind: "newList" | "rename"; onClose: () => void; lib: Library }) {
  const renaming = kind === "rename" ? lib.selectedList : null;
  const [name, setName] = useState(renaming?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = name.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    const res = renaming ? await lib.renameList(renaming, value) : await lib.createList(value);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <Shell onClose={onClose}>
      <h3 className="text-white font-semibold mb-4">{renaming ? "Listeyi Yeniden Adlandır" : "Yeni Playlist"}</h3>
      {error && (
        <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          {error}
        </p>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Örn. Akşam Seti"
        maxLength={40}
        autoFocus
        className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
        style={inputStyle}
      />
      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        style={{ background: "#e91e8c", color: "white" }}
      >
        {renaming ? "Kaydet" : "Oluştur"}
      </button>
    </Shell>
  );
}

type OwnedList = {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
  privacy: string;
  imported: boolean;
};

const YOUTUBE_ERRORS: Record<string, string> = {
  denied: "İzin verilmedi — listeleri okuyabilmemiz için onay gerekiyor.",
  missing_code: "Google'dan yanıt alınamadı, tekrar deneyin.",
  oauth_failed: "Google oturumu doğrulanamadı, tekrar deneyin.",
  no_token: "Google erişim izni vermedi, tekrar deneyin.",
};

/**
 * Mekanın kendi YouTube (Music) hesabındaki listeleri gösterir; seçilenler tek
 * tek içe aktarılır. Erişim jetonu httpOnly çerezde durur ve ~1 saat sonra ölür —
 * o yüzden "bağlan" adımı her seferinde tekrar gerekebilir, akış buna göre kurulu.
 */
function AccountPicker({
  onClose,
  lib,
  onUseUrl,
}: {
  onClose: () => void;
  lib: Library;
  onUseUrl: () => void;
}) {
  const { refresh, setSelectedId } = lib;
  const [lists, setLists] = useState<OwnedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsConnect, setNeedsConnect] = useState(false);
  // Google'dan hatayla dönülmüşse sebebi adres çubuğunda gelir (sayfa yeniden yüklendi)
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const failure = new URLSearchParams(window.location.search).get("youtube_error");
    if (!failure) return "";
    return YOUTUBE_ERRORS[failure] ?? "YouTube hesabı bağlanamadı.";
  });
  const [result, setResult] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rowStatus, setRowStatus] = useState<Record<string, { state: "busy" | "ok" | "fail"; text: string }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/playlist/youtube-lists");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (data.reconnect) setNeedsConnect(true);
          else setError(data.error ?? "Listeler alınamadı");
          return;
        }
        setLists(data.playlists ?? []);
      } catch {
        if (!cancelled) setError("Bağlantı hatası, tekrar deneyin");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async () => {
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/admin/youtube/callback`,
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        // consent: kapsam ilk kez isteniyorsa Google onay ekranını atlamasın
        queryParams: { prompt: "consent", access_type: "online" },
      },
    });
    if (oauthError) setError("Google'a yönlendirilemedi, tekrar deneyin.");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0 || importing) return;
    setImporting(true);
    setError("");
    setResult("");
    setRowStatus({});
    setProgress({ done: 0, total: ids.length });

    let added = 0;
    let okCount = 0;
    let done = 0;
    let lastPlaylistId = "";

    // Bağlantı yapıştırma akışındaki gerekçenin aynısı: sıralı gidiyoruz,
    // bir listenin hatası diğerlerini durdurmuyor.
    for (const id of ids) {
      setRowStatus((s) => ({ ...s, [id]: { state: "busy", text: "aktarılıyor…" } }));
      try {
        const res = await fetch("/api/admin/playlist/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtube_playlist_id: id, new_playlist: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRowStatus((s) => ({
            ...s,
            [id]: { state: "fail", text: `${res.status} — ${data.error ?? "içe aktarılamadı"}` },
          }));
        } else {
          okCount++;
          added += data.added ?? 0;
          if (data.playlist_id) lastPlaylistId = data.playlist_id;
          setRowStatus((s) => ({
            ...s,
            [id]: {
              state: "ok",
              text: `${data.added ?? 0} şarkı eklendi${data.auto_sync ? "" : " · otomatik güncellenmez"}`,
            },
          }));
        }
      } catch {
        setRowStatus((s) => ({ ...s, [id]: { state: "fail", text: "bağlantı hatası" } }));
      }
      done++;
      setProgress({ done, total: ids.length });
    }

    if (okCount > 0) {
      setResult(`${okCount}/${ids.length} liste aktarıldı — toplam ${added} şarkı eklendi.`);
      setSelected(new Set());
    }
    if (okCount < ids.length) {
      setError(okCount === 0 ? "Hiçbir liste aktarılamadı" : "Bazı listeler aktarılamadı");
    }

    await refresh();
    if (lastPlaylistId) setSelectedId(lastPlaylistId);
    setImporting(false);
  };

  return (
    <Shell onClose={onClose} wide>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">YouTube Hesabımdan Seç</h3>
        <button onClick={onClose} className="text-[#6b7280] hover:text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="overflow-y-auto">
        {result && (
          <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{result}</p>
        )}
        {error && (
          <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{error}</p>
        )}

        {loading && <p className="text-[#9ca3af] text-sm py-6 text-center">Listeler yükleniyor…</p>}

        {!loading && needsConnect && (
          <div className="py-2">
            <p className="text-[#9ca3af] text-xs mb-4 leading-relaxed">
              YouTube (veya YouTube Music) hesabınızı bağlayın; oradaki çalma listelerinizi
              tek tek seçip aktarabilirsiniz. Yalnızca <strong className="text-white">okuma</strong> izni
              isteniyor — hesabınızda hiçbir değişiklik yapılmaz.
            </p>
            <button
              onClick={connect}
              className="w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#e91e8c", color: "white" }}
            >
              Google ile Bağlan
            </button>
          </div>
        )}

        {!loading && !needsConnect && lists.length === 0 && !error && (
          <p className="text-[#9ca3af] text-sm py-6 text-center leading-relaxed">
            Hesabınızda aktarılabilir çalma listesi bulunamadı.
            <br />
            <span className="text-[#6b7280] text-xs">
              &quot;Beğenilen Müzik&quot; ve otomatik karışımlar (Discover Mix gibi) YouTube tarafından
              paylaşılmadığı için burada görünmez.
            </span>
          </p>
        )}

        {!loading && lists.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {lists.map((list) => {
              const status = rowStatus[list.id];
              const checked = selected.has(list.id);
              return (
                <div key={list.id}>
                  <button
                    onClick={() => toggle(list.id)}
                    disabled={importing}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left disabled:opacity-60"
                    style={{
                      background: checked ? "rgba(233,30,140,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${checked ? "rgba(233,30,140,0.5)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {list.thumbnail ? (
                      // Kapaklar YouTube CDN'inden geliyor; next/image için ek domain
                      // yapılandırması gerekmesin diye düz img
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={list.thumbnail} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{list.title}</p>
                      <p className="text-[#6b7280] text-[11px]">
                        {list.itemCount} şarkı
                        {list.privacy === "private" && " · gizli liste"}
                        {list.imported && " · daha önce aktarıldı"}
                      </p>
                    </div>
                    <span
                      className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center"
                      style={{
                        background: checked ? "#e91e8c" : "transparent",
                        border: `1px solid ${checked ? "#e91e8c" : "rgba(255,255,255,0.25)"}`,
                      }}
                    >
                      {checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </span>
                  </button>
                  {status && (
                    <span
                      className="block text-[11px] mt-1 px-1"
                      style={{ color: status.state === "fail" ? "#f87171" : status.state === "ok" ? "#22c55e" : "#9ca3af" }}
                    >
                      {status.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && lists.length > 0 && (
          <>
            <p className="text-[#6b7280] text-[11px] mb-3 leading-relaxed">
              Seçilen her liste, YouTube&apos;daki adıyla ayrı bir playlist olarak eklenir ve her gün
              otomatik güncellenir. Gizli listeler tek seferlik aktarılır — günlük senkron için
              listenin herkese açık veya bağlantıya açık olması gerekiyor.
            </p>
            <button
              onClick={importSelected}
              disabled={importing || selected.size === 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "#e91e8c", color: "white" }}
            >
              {importing ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
                  {`İçe aktarılıyor... ${progress.done}/${progress.total}`}
                </>
              ) : selected.size > 0 ? (
                `${selected.size} Listeyi İçe Aktar`
              ) : (
                "Liste seçin"
              )}
            </button>
          </>
        )}

        <button onClick={onUseUrl} className="w-full mt-3 py-2 text-xs text-[#9ca3af] hover:text-white">
          Bunun yerine bağlantı yapıştır
        </button>
      </div>
    </Shell>
  );
}

/** Bir metinden bağlantıları ayıklar: satır/boşluk/virgül fark etmez. */
function splitUrls(raw: string): string[] {
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

function ImportModal({ onClose, lib }: { onClose: () => void; lib: Library }) {
  const { playlists, defaultTarget, refresh, setSelectedId } = lib;
  // İki yol var: bağlantı yapıştırmak ya da YouTube hesabındaki listeleri seçmek.
  // Google'dan dönüldüyse (?youtube=...) doğrudan seçiciyle açılır.
  const [source, setSource] = useState<"url" | "account">(() =>
    typeof window !== "undefined" && /[?&]youtube(_error)?=/.test(window.location.search) ? "account" : "url"
  );
  // Her bağlantı kendi satırında: "Bağlantı ekle" yeni bir kutu açar.
  const [urlRows, setUrlRows] = useState<string[]>([""]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  // Satır başına durum: hangi bağlantının nerede takıldığı kutunun altında görünür.
  const [rowStatus, setRowStatus] = useState<Record<string, { state: "busy" | "ok" | "fail"; text: string }>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // İçe aktarma çoğunlukla yeni bir liste oluşturmak için yapılıyor —
  // varsayılan sekme "Yeni liste".
  const [importAsNew, setImportAsNew] = useState(true);
  const [newListName, setNewListName] = useState("");
  const [targetId, setTargetId] = useState(defaultTarget());

  const urls = [...new Set(urlRows.map((u) => u.trim()).filter(Boolean))];

  const setRow = (index: number, value: string) => {
    // Çok satırlı yapıştırma tek kutuya sığmaz — satırlar kendi kutularına dağılır.
    const parts = splitUrls(value);
    setUrlRows((rows) =>
      parts.length > 1
        ? [...rows.slice(0, index), ...parts, ...rows.slice(index + 1)]
        : rows.map((r, i) => (i === index ? value : r))
    );
  };

  const addRow = () => setUrlRows((rows) => [...rows, ""]);
  const removeRow = (index: number) =>
    setUrlRows((rows) => (rows.length === 1 ? [""] : rows.filter((_, i) => i !== index)));
  // Birden fazla bağlantıda hedef seçimi yok: playlist_sources'ta liste başına tek
  // kaynak satırı var (0029), hepsi aynı listeye gitse yalnızca sonuncusu senkron
  // kalırdı. Bu yüzden çoklu aktarımda her bağlantı kendi listesini açar.
  const multi = urls.length > 1;
  const asNew = importAsNew || multi;

  const importPlaylists = async () => {
    if (urls.length === 0 || importing) return;
    if (!asNew && !targetId) {
      setError("Önce bir playlist seçin");
      return;
    }
    setImporting(true);
    setError("");
    setResult("");
    setRowStatus({});
    setProgress({ done: 0, total: urls.length });

    let added = 0;
    let skipped = 0;
    let resolved = 0;
    let done = 0;
    let okCount = 0;
    let lastPlaylistId = "";

    // Sıralı gidiyoruz: her bağlantı YouTube'a 20+ istek atıyor, paralel koşmak
    // kota hatalarını ve 429'ları tetikler. Bir bağlantının hatası diğerlerini durdurmaz.
    for (const url of urls) {
      setRowStatus((s) => ({ ...s, [url]: { state: "busy", text: "aktarılıyor…" } }));
      try {
        const res = await fetch("/api/admin/playlist/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlist_url: url,
            ...(asNew
              ? {
                  new_playlist: true,
                  // Çoklu aktarımda tek bir ad tüm listelere verilemez — adlar
                  // YouTube başlıklarından gelir.
                  new_playlist_name: multi ? undefined : newListName.trim() || undefined,
                }
              : { playlist_id: targetId }),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRowStatus((s) => ({
            ...s,
            [url]: { state: "fail", text: `${res.status} — ${data.error ?? "içe aktarılamadı"}` },
          }));
        } else {
          okCount++;
          added += data.added ?? 0;
          skipped += data.skipped ?? 0;
          resolved += data.resolved_suggestions ?? 0;
          if (data.playlist_id) lastPlaylistId = data.playlist_id;
          setRowStatus((s) => ({
            ...s,
            [url]: {
              state: "ok",
              text: `${data.added ?? 0} şarkı eklendi${data.skipped ? `, ${data.skipped} zaten vardı` : ""}`,
            },
          }));
        }
      } catch (err) {
        setRowStatus((s) => ({
          ...s,
          [url]: { state: "fail", text: err instanceof Error ? err.message : "bağlantı hatası" },
        }));
      }
      done++;
      setProgress({ done, total: urls.length });
    }

    if (okCount > 0) {
      setResult(
        (multi ? `${okCount}/${urls.length} liste aktarıldı — ` : "") +
          `${added} şarkı eklendi${skipped ? `, ${skipped} şarkı zaten vardı` : ""}` +
          (resolved ? `, ${resolved} müşteri önerisi karşılandı` : "") +
          ". Yeni şarkılar her gün otomatik eklenecek."
      );
    }
    if (okCount < urls.length) {
      setError(
        okCount === 0
          ? "Hiçbir liste aktarılamadı"
          : `${urls.length - okCount} bağlantı aktarılamadı — kutuların altındaki nedene bakın`
      );
    }

    await refresh();
    if (lastPlaylistId) {
      setSelectedId(lastPlaylistId);
      // Tek liste aktarıldıysa hedef ona sabitlenir; çokluda seçim "yeni liste"de kalır.
      if (!multi) {
        setTargetId(lastPlaylistId);
        setImportAsNew(false);
      }
    }
    setImporting(false);
  };

  if (source === "account") {
    return <AccountPicker onClose={onClose} lib={lib} onUseUrl={() => setSource("url")} />;
  }

  return (
    <Shell onClose={onClose} wide>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">YouTube Playlist&apos;i İçe Aktar</h3>
        <button onClick={onClose} className="text-[#6b7280] hover:text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="overflow-y-auto">
        <button
          onClick={() => setSource("account")}
          className="w-full mb-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.4)", color: "#f9a8d4" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12c0 1.6.1 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.3-1.6.4-3.2.4-4.8s-.1-3.2-.4-4.8ZM10 15V9l5 3-5 3Z" /></svg>
          YouTube hesabımdaki listelerden seç
        </button>

        <p className="text-[#9ca3af] text-xs mb-3">
          Ya da herkese açık bir playlist bağlantısı yapıştırın — hesap bağlamaya gerek yok.
          Birden fazla liste için &quot;Bağlantı Ekle&quot; ile yeni kutu açın.
        </p>

        {result && (
          <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>{result}</p>
        )}
        {error && (
          <p className="text-sm rounded-xl px-3.5 py-2.5 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{error}</p>
        )}
        <div className="space-y-2 mb-2">
          {urlRows.map((url, i) => {
            const status = rowStatus[url.trim()];
            return (
              <div key={i}>
                <div className="flex gap-2 items-center">
                  <input
                    value={url}
                    onChange={(e) => setRow(i, e.target.value)}
                    onKeyDown={(e) => {
                      // Enter son satırdaysa yeni kutu açar, değilse aktarımı başlatır.
                      if (e.key !== "Enter") return;
                      if (i === urlRows.length - 1 && url.trim()) addRow();
                      else importPlaylists();
                    }}
                    placeholder="https://www.youtube.com/playlist?list=..."
                    autoFocus={i === 0}
                    className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                    style={inputStyle}
                  />
                  {urlRows.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      aria-label="Bağlantıyı kaldır"
                      className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[#6b7280] hover:text-white"
                      style={inputStyle}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
                {status && (
                  <span
                    className="block text-[11px] mt-1 px-1 break-all"
                    style={{ color: status.state === "fail" ? "#f87171" : status.state === "ok" ? "#22c55e" : "#9ca3af" }}
                  >
                    {status.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={addRow}
          className="w-full py-2 rounded-xl text-xs font-semibold mb-3 flex items-center justify-center gap-1.5"
          style={{ ...inputStyle, color: "#f9a8d4" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Bağlantı Ekle
        </button>

        {multi && (
          <p className="text-[#9ca3af] text-xs mb-3">
            {urls.length} bağlantı — her biri kendi listesi olarak, YouTube&apos;daki adıyla eklenecek.
          </p>
        )}

        <p className="text-[#6b7280] text-xs mb-2">Nereye eklensin?</p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setImportAsNew(false)}
            disabled={playlists.length === 0 || multi}
            className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
            style={tabStyle(!asNew)}
          >
            Mevcut liste
          </button>
          <button onClick={() => setImportAsNew(true)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={tabStyle(asNew)}>
            {multi ? "Ayrı listeler" : "Yeni liste"}
          </button>
        </div>

        {multi ? null : asNew ? (
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Liste adı (boş bırakılırsa YouTube başlığı)"
            maxLength={40}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
            style={inputStyle}
          />
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
            style={inputStyle}
          >
            {playlists.map((p: Playlist) => (
              <option key={p.id} value={p.id} style={{ background: "#1a1025" }}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Günlük senkron her içe aktarılan listede açık — seçenek değil,
            davranışın kendisi. Silinenler PMJ'den düşmez, mekanın elle
            yaptığı düzenlemeler korunur. */}
        <p
          className="rounded-xl px-3.5 py-3 mb-3 text-[11px] leading-relaxed"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", color: "#9ca3af" }}
        >
          <span className="block text-white text-xs font-semibold mb-0.5">Her gün otomatik güncellenir</span>
          YouTube listesine yeni şarkı eklendiğinde buraya da eklenir. Listeden çıkarılanlar silinmez.
        </p>

        <button
          onClick={importPlaylists}
          disabled={importing || urls.length === 0}
          className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "#e91e8c", color: "white" }}
        >
          {importing ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
              {progress.total > 1
                ? `İçe aktarılıyor... ${progress.done}/${progress.total}`
                : "İçe aktarılıyor..."}
            </>
          ) : multi ? (
            `${urls.length} Listeyi İçe Aktar`
          ) : (
            "İçe Aktar"
          )}
        </button>
      </div>
    </Shell>
  );
}

/**
 * YouTube araması. "addSong" sonucu playlist'e, "addQueue" ise doğrudan kuyruğa
 * ekler — kuyruğa eklemede jeton harcanmaz, otomatiklerin arasına girer.
 */
function SearchModal({
  kind,
  onClose,
  lib,
  playback,
}: {
  kind: "addSong" | "addQueue";
  onClose: () => void;
  lib: Library;
  playback: Playback;
}) {
  const toQueue = kind === "addQueue";
  const [targetId, setTargetId] = useState(lib.defaultTarget());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const doSearch = async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Arama başarısız");
        return;
      }
      setResults(data.tracks ?? []);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (value: string) => {
    setQuery(value);
    setError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  };

  const add = async (track: SearchTrack) => {
    if (!toQueue && !targetId) {
      setError("Önce bir playlist seçin");
      return;
    }
    setAddingId(track.youtube_video_id);
    setError("");
    try {
      if (toQueue) {
        const res = await playback.addToQueue(track);
        if (!res.ok) setError(res.error);
        return;
      }
      const res = await fetch("/api/admin/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...track, playlist_id: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Eklenemedi");
        return;
      }
      await lib.refresh();
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Shell onClose={onClose} wide>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold">{toQueue ? "Sıraya Şarkı Ekle" : "Şarkı Ara"}</h3>
          {toQueue && <p className="text-[#6b7280] text-xs mt-0.5">Otomatik çalanların arasına girer, jeton harcanmaz</p>}
        </div>
        <button onClick={onClose} className="text-[#6b7280] hover:text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {!toQueue &&
        (lib.playlists.length === 0 ? (
          <p className="text-[#f59e0b] text-xs mb-4">Önce bir playlist oluşturun.</p>
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
            style={inputStyle}
          >
            {lib.playlists.map((p: Playlist) => (
              <option key={p.id} value={p.id} style={{ background: "#1a1025" }}>{p.name} listesine ekle</option>
            ))}
          </select>
        ))}

      <div className="relative mb-4">
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
          placeholder="Şarkı adı veya sanatçı..."
          autoFocus
          className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none"
          style={inputStyle}
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="#6b7280" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" /></svg>
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {/* YouTube API denetim şartı: API'den gelen sonuçların yanında atıf görünmeli. */}
        {results.length > 0 && (
          <p className="text-[#6b7280] text-[11px] pb-2 border-b border-white/5">
            YouTube Sonuçları · Search results provided by YouTube
          </p>
        )}
        {error && <p className="text-center text-red-400 text-sm py-6">{error}</p>}
        {!error && results.length === 0 && !searching && (
          <p className="text-center text-[#6b7280] text-sm py-6">
            {query ? "Sonuç bulunamadı" : "Aramak istediğin şarkıyı yaz"}
          </p>
        )}
        {results.map((track) => {
          const already = toQueue && playback.queuedVideoIds.has(track.youtube_video_id);
          return (
            <div key={track.youtube_video_id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/10">
                {track.album_cover_url ? (
                  <Image src={track.album_cover_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{track.title}</p>
                <p className="text-[#6b7280] text-xs truncate">
                  {track.artist}
                  {track.duration_ms > 0 && ` · ${formatDur(track.duration_ms)}`}
                </p>
              </div>
              <button
                onClick={() => add(track)}
                disabled={addingId === track.youtube_video_id || (!toQueue && !targetId)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-40"
                style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
              >
                {addingId === track.youtube_video_id ? "..." : already ? "Yine ekle" : "Ekle"}
              </button>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
