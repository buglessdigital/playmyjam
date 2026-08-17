"use client";

import Image from "next/image";
import SeekBar from "./SeekBar";
import { useProgress, type Playback } from "./usePlayback";
import { requestPlayerStart, usePlayerNeedsStart } from "@/lib/mini-player-store";
import { setPlayerHost, usePhoneDevice, usePlayerHost } from "@/lib/player-host";

// Saniyede dört kez tazelenen tek parça bu: ilerleme sayısı panelin ortak
// state'inde tutulsaydı her tick'te playlist rayı ve kuyruk da yeniden
// çizilirdi (bkz. usePlayback → useProgress).
function LiveSeekBar({ playback }: { playback: Playback }) {
  const progress = useProgress(playback.progressStore);
  return (
    <SeekBar
      progress={progress}
      // duration === 1: süre henüz bilinmiyor (bkz. usePlayback) — sarma kapalı
      duration={playback.duration === 1 ? 0 : playback.duration}
      onBegin={playback.beginSeek}
      onPreview={playback.previewSeek}
      onCommit={playback.commitSeek}
      onCancel={playback.cancelSeek}
    />
  );
}

/** Ana ekranın alt barı: şu an çalan, oynat/duraklat/geç ve ses seviyesi. */
export default function PlayerBar({
  playback,
  venueId,
  /** Kuyruk hangi listeden doluyor; null ise sıra boş, tüm katalogdan çalınıyor. */
  source,
}: {
  playback: Playback;
  venueId: string;
  source?: string | null;
}) {
  const {
    nowPlaying,
    isPlaying,
    playerOffline,
    playerLoading,
    playerAction,
    volume,
    volumeError,
    changeVolume,
    toggleMute,
  } = playback;

  const song = nowPlaying?.songs ?? null;

  // Oynatıcı ilk dokunuşu bekliyor: alt bardaki oynat düğmesi "başlat" görevi
  // görür. Tarayıcı iznini kaybetmemek için start SENKRON çağrılır — komut
  // yollamak (playerAction) araya girmez, oynatıcı sunucudaki durumdan devam eder.
  const needsStart = usePlayerNeedsStart();
  // Kumanda modu: bu cihazda oynatıcı hiç kurulmaz (telefon — bkz.
  // lib/player-host.ts). Kontroller çalışır, çünkü hepsi sunucudan geçer;
  // değişen tek şey "başlat" dokunuşunun burada yapılamaması.
  const host = usePlayerHost();
  const remoteOnly = host === false;
  // Telefon olduğu halde "bu cihazda çal" seçilmiş: seçimi geri almanın yolu
  // yalnızca o cihazda gösterilir.
  const phoneOptedIn = usePhoneDevice() && host === true;
  const offlineTitle = needsStart
    ? "Müziği başlat — tarayıcı ilk oynatma için bir dokunuş ister"
    : remoteOnly
      ? "Bu cihaz uzaktan kumanda — müziği çalacak cihazda paneli açın"
      : "Player henüz başlamadı — bu paneli müziği çalacak cihazda açın";

  const handlePlayPause = () => {
    if (needsStart && requestPlayerStart()) return;
    playerAction(isPlaying ? "pause" : "play");
  };

  return (
    <div className="shrink-0 border-t border-white/10" style={{ background: "#150e21" }}>
      {playerOffline && (
        <div className="flex items-start gap-2 px-4 py-2" style={{ background: "rgba(251,191,36,0.08)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
            <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-[11px]" style={{ color: "#fbbf24" }}>
            {needsStart ? (
              <>
                Müzik henüz başlamadı. Müziği çalacak cihazda, aşağıdaki{" "}
                <span className="font-bold">oynat</span> düğmesine bir kez dokunun; müzik
                bu panelden çalar.
              </>
            ) : remoteOnly ? (
              <>
                Bu cihaz <span className="font-bold">uzaktan kumanda</span>: müzik burada
                değil, mekanın müziği çalan cihazında (bilgisayarda) çalar. O cihazda
                paneli açıp <span className="font-bold">oynat</span> düğmesine bir kez
                dokunun — sonra buradan yönetebilirsiniz.
              </>
            ) : (
              <>
                Oynatıcı çevrimdışı görünüyor. Müziği çalacak cihazda bu paneli açın ve
                aşağıdaki <span className="font-bold">oynat</span> düğmesine dokunun.
              </>
            )}
          </div>
        </div>
      )}

      {/* Yanlar eşit paya (flex-1) sahip, orta blok sabit genişlikte: uzun şarkı adı
          ya da ses kaydırıcısı ortayı kaydırmaz. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-3">
        {/* Sol: şu an çalan */}
        <div className="flex items-center gap-3 min-w-0 lg:flex-1">
          {song?.album_cover_url ? (
            <Image src={song.album_cover_url} alt="" width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/5 shrink-0 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#4b5563" strokeWidth="2" /></svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {song ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold text-sm truncate">{song.title}</p>
                  {isPlaying && !playerOffline && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}>
                      CANLI
                    </span>
                  )}
                </div>
                <p className="text-[#9ca3af] text-xs truncate">
                  {song.artist}
                  <span className="text-[#4b5563]">
                    {" · "}
                    {source ? `Sırada: ${source}` : "Sıra boş — tüm katalogdan"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-[#6b7280] text-xs">
                Şu an çalan şarkı yok — kuyruğa şarkı eklenince Player&apos;da otomatik başlar
              </p>
            )}
          </div>
        </div>

        {/* Orta: oynatma kontrolleri ve hemen altında ilerleme çizgisi.
            "Sonraki" düğmesi mutlak konumlu — böylece tam merkezde oynat/duraklat
            düğmesi kalır, ilerleme çizgisi de onun altına hizalanır. */}
        <div className="shrink-0 w-full lg:w-[420px] flex flex-col items-center gap-1.5">
          <div className="relative flex items-center justify-center">
            {/* Player kapalıyken komutlar kapalı: ses üretecek bir cihaz yokken
                oynat/geç yalnızca kuyruğu tüketir, mekanda hiçbir şey duyulmaz. */}
            <button
              onClick={() => playerAction("previous")}
              disabled={playerLoading !== null || playerOffline || !song}
              className="absolute right-full mr-3 w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title={playerOffline ? offlineTitle : "Önceki şarkı"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 6l-8.5 6L18 18V6zm-2.5 6L10 8.5v7L15.5 12zM8 6H6v12h2z" /></svg>
            </button>
            <button
              onClick={handlePlayPause}
              // Oynat/duraklat komutu player'a anında (broadcast) gider; sunucu
              // yanıtı beklerken düğmeyi kilitlemek gereksiz gecikme hissi veriyordu.
              // Kilit yalnızca kuyruğu tüketen atlama düğmelerinde.
              // Oynatıcı ilk dokunuşu bekliyorken düğme AÇIK kalır: müziği
              // başlatan dokunuş artık bu.
              disabled={playerOffline && !needsStart}
              className="w-12 h-12 flex items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#e91e8c" }}
              title={playerOffline ? offlineTitle : isPlaying ? "Duraklat" : "Oynat"}
            >
              {isPlaying && !needsStart ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button
              onClick={() => playerAction("next")}
              disabled={playerLoading !== null || playerOffline}
              className="absolute left-full ml-3 w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title={playerOffline ? offlineTitle : "Sonraki şarkı"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.5v-7L8.5 12zM16 6h2v12h-2z" /></svg>
            </button>
          </div>

          {song && playerOffline && (
            <p className="text-[#6b7280] text-[10px] text-center">
              Süreler player açılınca ilerler — şu an duruyor
            </p>
          )}

          {song && !playerOffline && <LiveSeekBar playback={playback} />}
        </div>

        {/* Sağ: ses + player bağlantısı */}
        <div className="flex items-center justify-start lg:justify-end gap-2 flex-wrap lg:flex-1">
          <div
            title={
              playerOffline
                ? "Player çevrimdışı — ayarladığınız seviye kaydedilir, oynatıcı açılınca uygulanır."
                : "Player'ın açık olduğu cihazın sesi. iPad/iPhone'da sistem sesi geçerlidir, bu kaydırıcı etkisiz kalır."
            }
            className="flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1.5"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <button
              onClick={toggleMute}
              aria-label={volume === 0 ? "Sesi aç" : "Sesi kapat"}
              className="w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors hover:bg-white/10"
            >
              {volume === 0 ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="#6b7280" /><path d="m16 9 5 6m0-6-5 6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" fill="#e91e8c" />
                  <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />
                  {volume > 50 && <path d="M18.5 7a7 7 0 0 1 0 10" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" />}
                </svg>
              )}
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Ses seviyesi"
              className="volume-slider w-24 cursor-pointer sm:w-32"
              style={{ "--pct": `${volume}%` } as React.CSSProperties}
            />

            <span className="text-[#9ca3af] text-[11px] font-semibold tabular-nums w-8 text-right shrink-0">%{volume}</span>
          </div>

          {/* Cihaz seçimi. Telefonda oynatıcı kurulmadığı için "TV modu" da
              gösterilmez: o sayfa müziği telefona alır (sahiplik oraya geçer,
              bilgisayardaki player 409 ile susar) — yani kazara dokunulacak en
              pahalı düğme. Yerine seçimi çevirecek düğme konur; karar cihazda
              saklanır (bkz. lib/player-host.ts). */}
          {remoteOnly ? (
            <button
              onClick={() => setPlayerHost(true)}
              title="Müziği bu cihazın hoparlöründen çal — mekanın müziği buraya taşınır"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" /></svg>
              Bu cihazda çal
            </button>
          ) : (
            phoneOptedIn && (
              <button
                onClick={() => setPlayerHost(false)}
                title="Müziği bu cihazda çalmayı bırak — panel yalnızca uzaktan kumanda olsun"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Kumanda moduna dön
              </button>
            )
          )}

          {/* Videoyu TV'ye yansıtan mekanlar için tam ekran sayfa duruyor.
              Adlandırılmış pencere: tekrar tıklamak yeni sekme açmaz, aynı
              player'a döner. rel="noopener" YOK: noopener verilince tarayıcı
              pencere adını yok sayar, her tıklama yeni sekme açardı. Aynı köken
              olduğu için noopener'ın güvenlik faydası da yok.

              Panel oynatıcısı kapanmaz; TV açılınca sahiplik oraya geçer ve
              panelde "çalmayı buraya al" ekranı belirir. */}
          {!remoteOnly && (
          <a
            href={`/admin/${venueId}/player`}
            target={`pmj-player-${venueId}`}
            title="Videoyu TV'ye yansıtmak için tam ekran aç — müzik oraya taşınır"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            TV modu
          </a>
          )}

          {volumeError && <p className="text-[11px] w-full text-right" style={{ color: "#f87171" }}>{volumeError}</p>}
        </div>
      </div>
    </div>
  );
}
