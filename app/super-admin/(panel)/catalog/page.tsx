"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT, Card, Empty, ErrorBox, PageHeader, Stat, TextInput, api, useNow } from "@/components/super-admin/ui";
import type { CatalogRun, CatalogSong, CatalogStats } from "@/app/api/super-admin/catalog/route";

// Katalog ekranı: ortak havuzda arama + hasat turunun canlı durumu.
//
// Arama neden burada: havuz 900 bini aştı ama "aradığım şarkı yok" şikâyeti
// sürüyordu. Katalog boşluğu mu, arama sorunu mu olduğunu ayırmanın tek yolu
// havuza doğrudan bakmak. Bu yüzden sonuçlar olduğu gibi gösterilir —
// çalınamaz kayıtlar dahil, kopyalar ayıklanmadan.

const POLL_MS = 5_000;
const SEARCH_DEBOUNCE_MS = 350;
// 3 harften kısa parçalarda trigram indeksi devre dışı kalıyor: ölçümde "ad"
// 5,2 sn, "sem" 1,8 sn sürdü. Kısa sorgu zaten işe yaramaz, hiç sorulmuyor.
const MIN_QUERY = 3;

const STATUS_TEXT: Record<CatalogRun["status"], string> = {
  running: "çalışıyor",
  done: "sıra tükendi",
  budget: "bütçe doldu",
  quota: "kota doldu",
  error: "hata",
  stale: "kesildi",
};

const STATUS_COLOR: Record<CatalogRun["status"], string> = {
  running: ACCENT,
  done: "#22c55e",
  budget: "#9ca3af",
  quota: "#9ca3af",
  error: "#ef4444",
  stale: "#ef4444",
};

const sayi = (n: number) => n.toLocaleString("tr-TR");

function sure(ms: number): string {
  const dk = Math.floor(ms / 60_000);
  if (dk < 1) return `${Math.floor(ms / 1000)} sn`;
  if (dk < 60) return `${dk} dk`;
  return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}

function saat(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function dakika(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s} sn` : `${Math.round(s / 60)} dk`;
}

export default function CatalogPage() {
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [runs, setRuns] = useState<CatalogRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<CatalogSong[] | null>(null);

  // İlk açılışta sanatçı sayısı da istenir (pahalı sayım), yoklamalarda değil.
  // Promise zinciri (async/await değil): setState effect gövdesinde senkron
  // çağrılmış sayılmasın — panelin diğer ekranları da bu deseni kullanıyor.
  useEffect(() => {
    let alive = true;
    const load = (full: boolean) =>
      api<{ stats: CatalogStats; runs: CatalogRun[] }>(`/api/super-admin/catalog${full ? "?full=1" : ""}`)
        .then((data) => {
          if (!alive) return;
          setStats((prev) => ({ ...data.stats, artists: data.stats.artists ?? prev?.artists ?? null }));
          setRuns(data.runs);
          setError(null);
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : "Durum alınamadı");
        });
    load(true);
    const timer = setInterval(() => load(false), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Her tuşta sunucuya gitmemek için bekletilir; sorgu değişince eski
  // isteğin yanıtı yeni sorgunun sonucunu ezmesin diye sıra numarası tutulur
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      if (q.length < MIN_QUERY) {
        if (mine === seq.current) setSongs(null);
        return;
      }
      try {
        const data = await api<{ songs: CatalogSong[] }>(`/api/super-admin/catalog?q=${encodeURIComponent(q)}`);
        if (mine === seq.current) setSongs(data.songs);
      } catch (err) {
        if (mine === seq.current) setError(err instanceof Error ? err.message : "Arama başarısız");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // "aranıyor" ayrı bir state değil: sorgu aranabilir uzunlukta ama sonuç
  // henüz gelmemişse beklemedeyiz. State tutmak effect içinde senkron
  // setState demek olurdu (cascading render).
  const bekliyor = query.trim().length >= MIN_QUERY && songs === null;

  const aktif = runs.find((r) => r.status === "running") ?? runs[0] ?? null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader title="Katalog" subtitle="Ortak şarkı havuzu ve hasat turları" />

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Stat label="Şarkı" value={stats ? sayi(stats.songs) : "…"} sub="yaklaşık" />
        <Stat label="Sanatçı" value={stats?.artists != null ? sayi(stats.artists) : "…"} />
        <Stat label="Okunmuş liste" value={stats ? sayi(stats.listsDone) : "…"} sub="kanal / playlist" />
      </div>

      {aktif && <RunCard run={aktif} />}

      <Card className="mb-6">
        <h2 className="text-white font-semibold mb-3">Havuzda ara</h2>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Şarkı ya da sanatçı — örn. tarkan kuzu"
        />
        <p className="text-[#6b7280] text-xs mt-2">
          Mekan panelindeki arama kuralının aynısı: yazdığın her kelime başlıkta ya da sanatçıda
          geçmeli. Çalınamaz kayıtlar da gösterilir. En az 3 harf.
        </p>

        {query.trim().length >= MIN_QUERY && (
          <div className="mt-4">
            {bekliyor ? (
              <p className="text-[#9ca3af] text-sm">aranıyor…</p>
            ) : songs && songs.length > 0 ? (
              <>
                <p className="text-[#6b7280] text-xs mb-2">
                  {songs.length} sonuç{songs.length >= 60 ? " (ilk 60)" : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#9ca3af] text-xs text-left">
                        <th className="py-2 pr-3 font-medium">Şarkı</th>
                        <th className="py-2 pr-3 font-medium">Sanatçı</th>
                        <th className="py-2 pr-3 font-medium">Kanal</th>
                        <th className="py-2 pr-3 font-medium text-right">İzlenme</th>
                        <th className="py-2 font-medium">Süre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songs.map((s) => (
                        <tr key={s.youtube_video_id} className="border-t border-white/5">
                          <td className="py-2 pr-3 min-w-0">
                            <a
                              href={`https://www.youtube.com/watch?v=${s.youtube_video_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white hover:underline"
                            >
                              {s.title}
                            </a>
                            {!s.embeddable && (
                              <span className="ml-2 text-[11px]" style={{ color: "#ef4444" }}>
                                çalınamaz
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-[#d1d5db]">{s.artist}</td>
                          <td className="py-2 pr-3 text-[#6b7280] text-xs">{s.channel_title ?? "—"}</td>
                          <td className="py-2 pr-3 text-[#9ca3af] text-right tabular-nums">
                            {sayi(s.view_count)}
                          </td>
                          <td className="py-2 text-[#6b7280] tabular-nums">
                            {Math.floor(s.duration_ms / 60000)}:
                            {String(Math.floor((s.duration_ms % 60000) / 1000)).padStart(2, "0")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty>Havuzda bu aramaya uyan şarkı yok.</Empty>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-white font-semibold mb-3">Son turlar</h2>
        {runs.length === 0 ? (
          <Empty>Henüz kayıtlı hasat turu yok.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#9ca3af] text-xs text-left">
                  <th className="py-2 pr-3 font-medium">Başlangıç</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 font-medium text-right">Liste</th>
                  <th className="py-2 pr-3 font-medium text-right">Şarkı</th>
                  <th className="py-2 pr-3 font-medium text-right">Kota</th>
                  <th className="py-2 font-medium">Süre</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 text-[#d1d5db] whitespace-nowrap">{saat(r.started_at)}</td>
                    <td className="py-2 pr-3" style={{ color: STATUS_COLOR[r.status] }}>
                      {STATUS_TEXT[r.status]}
                    </td>
                    <td className="py-2 pr-3 text-[#9ca3af] text-right tabular-nums">
                      {sayi(r.lists_done)} / {sayi(r.lists_total)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "#22c55e" }}>
                      +{sayi(r.songs_added)}
                    </td>
                    <td className="py-2 pr-3 text-[#9ca3af] text-right tabular-nums">{sayi(r.units_spent)}</td>
                    <td className="py-2 text-[#6b7280] whitespace-nowrap">
                      {sure(new Date(r.finished_at ?? r.heartbeat_at).getTime() - new Date(r.started_at).getTime())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RunCard({ run }: { run: CatalogRun }) {
  // Date.now() render sırasında çağrılamaz (saf olmayan çağrı); saat kancadan
  const now = useNow(POLL_MS);
  const listeYuzde = run.lists_total > 0 ? Math.min(100, (run.lists_done / run.lists_total) * 100) : 0;
  const kotaYuzde = run.budget > 0 ? Math.min(100, (run.units_spent / run.budget) * 100) : 0;
  // İki çubuktan hangisi önce dolacaksa tur onunla bitiyor; ekranda ikisi de
  // görünür, çünkü "bütçe doldu" ile "sıra tükendi" bambaşka iki sonuç
  const calisiyor = run.status === "running";
  const gecen = now - new Date(run.started_at).getTime();
  const nabizYas = now - new Date(run.heartbeat_at).getTime();

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-white font-semibold">
          {calisiyor ? "Hasat çalışıyor" : "Son hasat turu"}
        </h2>
        <span className="text-xs" style={{ color: STATUS_COLOR[run.status] }}>
          {STATUS_TEXT[run.status]}
          {calisiyor && ` · ${sure(gecen)}`}
        </span>
      </div>

      <Bar label="Liste" done={run.lists_done} total={run.lists_total} percent={listeYuzde} color={ACCENT} />
      <Bar label="Kota" done={run.units_spent} total={run.budget} percent={kotaYuzde} color="#60a5fa" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
        <div>
          <p className="text-[#6b7280] text-xs">Eklenen şarkı</p>
          <p style={{ color: "#22c55e" }} className="font-semibold tabular-nums">+{sayi(run.songs_added)}</p>
        </div>
        <div>
          <p className="text-[#6b7280] text-xs">Sonraki tura</p>
          <p className="text-[#d1d5db] tabular-nums">{sayi(run.lists_deferred)} liste</p>
        </div>
        <div className="col-span-2">
          <p className="text-[#6b7280] text-xs">Okunan liste</p>
          <p className="text-[#d1d5db] font-mono text-xs truncate">{run.current_list ?? "—"}</p>
        </div>
      </div>

      {run.last_songs && run.last_songs.length > 0 && (
        <div className="mt-4">
          <p className="text-[#6b7280] text-xs mb-1.5">Son eklenenler</p>
          <ul className="text-[#d1d5db] text-sm space-y-0.5">
            {run.last_songs.map((s, i) => (
              <li key={`${s}-${i}`} className="truncate">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.status === "stale" && (
        <p className="text-xs mt-3" style={{ color: "#ef4444" }}>
          Betik {dakika(nabizYas)} önce sustu — tur bitmeden kesilmiş (oturum kapanmış olabilir).
          İlerleme kayıtlı, komut yeniden çalıştırılınca kaldığı yerden sürer.
        </p>
      )}
      {run.note && run.status !== "stale" && (
        <p className="text-[#6b7280] text-xs mt-3">{run.note}</p>
      )}
    </Card>
  );
}

function Bar({
  label, done, total, percent, color,
}: { label: string; done: number; total: number; percent: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-[#9ca3af]">{label}</span>
        <span className="text-[#d1d5db] tabular-nums">
          {sayi(done)} / {sayi(total)} · %{Math.round(percent)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
    </div>
  );
}
