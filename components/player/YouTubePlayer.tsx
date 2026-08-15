"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CMD_EVENT,
  STATE_EVENT,
  playerBusChannel,
  type PlayerCommand,
  type PlayerStateBeat,
  onLocalCommand,
  sendLocalState,
} from "@/lib/player-bus";
import { clearPlayerStarter, setPlayerStarter } from "@/lib/mini-player-store";

// YouTube IFrame API'nin kullandığımız alt kümesi (resmi @types paketi olmadan)
type YTPlayer = {
  loadVideoById: (video: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  getVolume?: () => number;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  setPlaybackQuality?: (quality: string) => void;
  getPlaybackQuality?: () => string;
  destroy: () => void;
};

type YTStateChangeEvent = { data: number };
type YTErrorEvent = { data: number };
type YTQualityChangeEvent = { data: string };

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        config: {
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: YTStateChangeEvent) => void;
            onError?: (e: YTErrorEvent) => void;
            onPlaybackQualityChange?: (e: YTQualityChangeEvent) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Panelin ilerleme çubuğu bu sinyalin taşıdığı çapaya (started_at) yaslanır:
// aralık uzadıkça panel player'dan sapar, o yüzden 5 sn.
const HEARTBEAT_MS = 5_000;
// Panelin alt barına giden hızlı durum sinyali. DB'ye dokunmadığı (yalnızca
// Realtime broadcast) için sık gönderilebilir: panel ilerlemeyi kendi saatiyle
// sürdürüp her saniye player'ın gerçek konumuyla eşitlenir, çubuk sesle saniye
// saniye örtüşür.
const STATE_BEAT_MS = 1_000;
// Durum denetimleri (dürtme/uzlaştırma) daha seyrek — okuma maliyeti taşırlar
const RECONCILE_MS = 15_000;
// Kuyruk boş kaldığında sıradakini yeniden isteme aralığı. Sessizlik ne kadar
// kısa sürerse o kadar iyi; sunucu tarafı zaten otomatik dolum yapıyor.
const IDLE_RETRY_MS = 8_000;
// Yükleme sonrası bu süre içinde gelen "duraklat" yankıları yok sayılır — skip
// anında yarışan bayat heartbeat'ler yeni şarkıyı durduramasın
const PAUSE_ECHO_GRACE_MS = 8_000;
// KENDİ yankımızın penceresi. Player durumunu 5 sn'de bir now_playing'e yazıyor;
// bu yazım Realtime'dan birkaç yüz ms sonra kendisine geri geliyor. Kullanıcı
// tam o aralıkta videoyu duraklatır/başlatırsa yoldaki BAYAT yankı taze niyetin
// üstüne biniyordu: durdurunca kendiliğinden başlıyor, başlatınca hemen duruyordu.
// Niyet yerelde değiştikten sonraki bu pencerede DB'den gelen çalma durumu
// uygulanmaz — panelin gerçek komutu zaten hızlı hattan (broadcast) geliyor,
// kaçarsa da pencere kapanınca uzlaştırma onu uygular.
const LOCAL_INTENT_GRACE_MS = 3_000;
// loadVideoById sonrası oynatmanın gerçekten başladığı bu aralıklarla doğrulanır
const PLAY_WATCHDOG_DELAYS_MS = [2_500, 6_000];
// Yükleme sonrasında bu süre içinde gelen PAUSED, yüklemenin kendi ara adımıdır
// (eski video sökülürken yayınlanır) — "geri aç" bekçisi burada susar, yoksa
// eski şarkı bir saniyeliğine geri gelir. İlk gerçek denetim 2,5 sn'de olduğu
// için bu pencere bekçisiz kalmaz.
const LOAD_PAUSE_IGNORE_MS = 2_000;
// Yükleme daha oturmadan bekçiler playVideo() DEMEZ. loadVideoById çağrıldıktan
// sonra iframe kısa bir süre hâlâ ESKİ videoyu tutuyor; tam o aralığa denk gelen
// periyodik dürtme eski şarkıyı yarım saniyeliğine geri başlatıyor, sonra yeni
// video onu kesiyordu (atlama tuşundaki "kes–geri gel–kes"). PAUSED'ı yok sayan
// pencerenin aksine burada playVideo çağrısının kendisi susturulur.
const LOAD_SETTLE_MS = 1_200;
const PLAY_NUDGE_MS = 3_000;
// Dış kaynaklı duraklatma (YouTube'un atalet duraklatması, reklam/ara geçiş, ağ
// kopması, medya tuşu, işletim sisteminin sesi başka uygulamaya vermesi) ile
// GERÇEK duraklatma niyetini ayırt eden pencere. Yalnızca panel komutu, video
// üzerindeki YouTube kontrolüne tıklama ve kuyruğun boşalması müziği durdurabilir;
// bunların dışındaki her duraklatma bekçi tarafından geri açılır.
const EXPLICIT_PAUSE_WINDOW_MS = 6_000;
// Dış kaynaklı duraklatma yakalanınca hızlı toparlama denemeleri
const RESUME_RETRY_DELAYS_MS = [400, 1_500, 4_000];

// --- Arka plan sekmesi ---
// Player'ın JS'e ihtiyaç duyduğu TEK an şarkı geçişidir: şarkı çalarken sesi
// tarayıcının medya hattı taşır, kod uyuyabilir. Ama tarayıcılar gizli
// sekmelerin zamanlayıcılarını kısar (dakikada bire kadar) ve uzun süre arkada
// kalan sekmeyi tamamen dondurur; bu kısıntıdan muafiyetin tek şartı sayfanın
// SES ÇIKARIYOR olmasıdır. Şarkı bittiği saniyede ses kesiliyor, yani kurtarma
// bekçilerine tam ihtiyaç duyduğumuz anda çalışma hakkımızı kaybediyorduk:
// sıradaki şarkı başlamıyor, sekmeye dönene kadar sessizlik sürüyordu.
// Çözüm: duyulmaz bir taşıyıcı ton sürekli çalar, sekme daima "sesli" sayılır.
// 20 Hz insan işitme eşiğinin dibindedir, seviye de -48 dBFS: mekanda duyulmaz,
// ama tarayıcının sessizlik eşiğinin (-72 dBFS) belirgin şekilde üstündedir.
const KEEPALIVE_HZ = 20;
const KEEPALIVE_GAIN = 0.004;
// Bir tur ile bir öncekinin arası bu kadar açıldıysa sekme kısılmış/dondurulmuş
// demektir: geçen süre bize ait değildir, takılma ölçümü sıfırdan başlar.
const TICK_THAW_MS = 20_000;
// Takılma bekçisi: "PLAYING/BUFFERING" görünmek çalmak değildir — arka planda
// yeni video çoğu zaman tam burada, saniye hiç ilerlemeden asılı kalıyor.
// İlerleme durduktan sonra sırasıyla: dürt → aynı videoyu baştan yükle → pes
// edip sıradakine geç. Ağ dalgalanmasındaki normal tamponlamayı kesmemek için
// eşikler bilerek geniş.
const STALL_NUDGE_MS = 6_000;
const STALL_RELOAD_MS = 15_000;
const STALL_SKIP_MS = 28_000;
// Video HİÇ başlamadıysa ve tamponlamıyorsa (CUED/UNSTARTED/PAUSED'da asılı)
// ortada beklenecek bir indirme yok: bütün bir şarkı boyunca cue'lu bekleyen
// deck çoğunlukla böyle ölü kalıyor. Mekan 15 sn sessiz durmasın diye yeniden
// yükleme öne çekilir; tamponlayan (yani gerçekten indiren) video etkilenmez.
const STALL_DEAD_RELOAD_MS = 7_000;
// "PLAYING görünüyor ama saniye ilerlemiyor" ayrı bir durumdur: bu çoğunlukla
// YouTube'un reklamıdır (reklam boyunca getCurrentTime 0'da bekler) ve o sırada
// mekanda ses VARDIR. Dürtmenin faydası yok, kesmenin zararı var — eşikler
// reklamın bitmesine fırsat verecek kadar uzun.
const STALL_PLAYING_RELOAD_MS = 50_000;
const STALL_PLAYING_SKIP_MS = 95_000;
// Rampanın duvar saatiyle aşabileceği pay. Kısılmış sekmede 60 ms'lik rampa
// adımları 1 sn'ye çekilir; rampa hiç bitmezse geçiş bayrağı asılı kalır ve
// TÜM bekçiler (hepsi geçiş sırasında susar) devre dışı kalırdı.
const FADE_OVERRUN_MS = 4_000;
// advance() bu süreden uzun sürdüyse kilidi zorla açılır: asılı kalan tek bir
// istek kuyruk ilerletmeyi, önyüklemeyi ve uzlaştırmayı birlikte kilitliyordu.
const ADVANCE_TIMEOUT_MS = 20_000;
// Hiçbir istek süresiz beklemesin — arka planda asılan fetch aylarca dönmez
const API_TIMEOUT_MS = 12_000;

// --- Video kalitesi ---
// Mekanda önemli olan SES; video kimsenin bakmadığı bir yük. YouTube kaliteyi
// iframe'in FİZİKSEL piksel boyutuna göre seçer: tam genişlikte bir iframe'e
// 720p/1080p (~2-5 Mbit/sn) gönderir ve bant genişliğinin %95'i piksellere gider.
// Yavaş/dalgalı hatta bu, şarkı ortasında tamponlamaya yani sessizliğe dönüşür.
// Bu yüzden iframe 256x144 kurulur (YouTube'a "tiny" verdirir, ~0,2 Mbit/sn) ve
// ekrana CSS transform ile büyütülerek yansıtılır — YouTube dış ölçeklemeyi
// görmez, video görünür kalır (YouTube kuralı), ses tam kalitede akar.
// Düşük bit hızının asıl kazancı veri tasarrufu değil: tampon saniyeler içinde
// dolduğu için hattın onlarca saniyelik çökmesi bile sese yansımaz.
const VIDEO_W = 256;
const VIDEO_H = 144;
// Boyut hilesi yetmezse diye ek sigorta. Not: YouTube 2019'dan beri bu çağrıyı
// bağlayıcı değil ÖNERİ sayıyor — tek başına güvenilmez, boyutla birlikte iş görür.
const FORCE_QUALITY = "tiny";

// --- Teşhis kaydı ---
// Çalma kesintileri mekanda, saatler sonra ve tekrarlanamayan biçimde oluyor;
// "ne oldu" sorusunun cevabı ancak olay anında yazılmış bir kayıtta bulunur.
// Konsola HER ZAMAN yazılır (mekanda DevTools açıksa yeter). Ekrandaki panel
// ise yalnızca adres satırına ?debug=1 eklenince görünür — müşteri/mekan normal
// kullanımda hiçbir şey görmez.
// Kayıt SAYFA KAPANSA DA yaşar: kesinti mekanda, kimse bakmıyorken oluyor ve
// eski bellek-içi tampon sekme yenilenince ya da pencere kapanınca siliniyordu
// — olay yaşandıktan saatler sonra "ne oldu" diye bakacak kimse için elimizde
// hiçbir şey kalmıyordu. Artık her satır localStorage'daki halka tampona da
// yazılır; mekandaki makinede olaydan SONRA ?debug=1 ile açıp okumak yeter.
type LogLine = { at: number; text: string };
// Ekranda ve bellekte tutulan satır sayısı. Kesinti çözümlemesi tek bir olayın
// öncesi/sonrasını ister; bir gecelik oturum bu tampona rahat sığar.
const LOG_LIMIT = 600;
// Panelde bir kerede çizilen satır: tamponun tamamını her kayıtta yeniden
// çizmek player'ın ana iş parçacığını meşgul ederdi.
const LOG_VIEW_LIMIT = 200;
const LOG_STORAGE_KEY = "pmj:player-log";
// Yazma her satırda değil, kısa bir bekleyişle toplu yapılır (kesinti anında
// bekleyiş beklenmez: sayfa gizlenirken/donarken zorla boşaltılır).
const LOG_FLUSH_MS = 1_000;
const logBuf: LogLine[] = [];
let logVersion = 0;
let logSubscriber: (() => void) | null = null;
let logStore: Storage | null | undefined; // undefined = henüz bakılmadı
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
let logHydrated = false;

// Gizli sekmede/özel modda localStorage patlayabilir — bir kez bakılır, erişim
// yoksa kalıcılık sessizce kapanır (konsol kaydı ve panel çalışmaya devam eder).
function logStorage(): Storage | null {
  if (logStore !== undefined) return logStore;
  try {
    const store = window.localStorage;
    const probe = `${LOG_STORAGE_KEY}:probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    logStore = store;
  } catch {
    logStore = null;
  }
  return logStore;
}

function flushLog() {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  const store = logStorage();
  if (!store) return;
  try {
    store.setItem(LOG_STORAGE_KEY, JSON.stringify(logBuf));
  } catch {
    // Kota dolduysa tamponu yarıya indirip bir kez daha dene; yine olmuyorsa
    // kalıcılıktan vazgeçilir, kayıt akışı kesilmez.
    try {
      store.setItem(LOG_STORAGE_KEY, JSON.stringify(logBuf.slice(-Math.floor(LOG_LIMIT / 2))));
    } catch {
      logStore = null;
    }
  }
}

// Önceki oturumun kaydını geri yükle ve oturum sınırını işaretle: paneldeki
// dökümde "burada sayfa yeniden yüklendi" görünmezse zaman çizgisi yanıltır.
function hydrateLog() {
  if (logHydrated || typeof window === "undefined") return;
  logHydrated = true;
  const store = logStorage();
  if (!store) return;
  try {
    const raw = store.getItem(LOG_STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as LogLine).at === "number" &&
        typeof (item as LogLine).text === "string"
      ) {
        logBuf.push({ at: (item as LogLine).at, text: (item as LogLine).text });
      }
    }
    if (logBuf.length > LOG_LIMIT) logBuf.splice(0, logBuf.length - LOG_LIMIT);
  } catch {
    // Bozuk kayıt tüm paneli çökertmesin
    try {
      store.removeItem(LOG_STORAGE_KEY);
    } catch {}
  }
}

// Sayfa gizlenirken/dondurulurken bekleyen yazma kaybolmasın. Kesintinin tam
// olduğu an burasıdır: son satırlar en kıymetlileri.
let logHooksInstalled = false;
function installLogFlushHooks() {
  if (typeof window === "undefined" || logHooksInstalled) return;
  logHooksInstalled = true;
  const flush = () => flushLog();
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("freeze", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function plog(text: string) {
  hydrateLog();
  const line = { at: Date.now(), text };
  logBuf.push(line);
  if (logBuf.length > LOG_LIMIT) logBuf.shift();
  logVersion += 1;
  try {
    console.log(`[pmj ${new Date(line.at).toLocaleTimeString("tr-TR")}] ${text}`);
  } catch {}
  if (!logFlushTimer && logStorage()) logFlushTimer = setTimeout(flushLog, LOG_FLUSH_MS);
  logSubscriber?.();
}

// Oturum sınırı sayfa yüklenişi başına BİR kez düşer: bileşen iki kez
// bağlanınca (StrictMode'un çift çağrısı, hızlı yeniden çizim) döküm aynı
// damgadan iki satırla açılıyordu.
let logSessionMarked = false;
function markSession() {
  if (logSessionMarked) return;
  logSessionMarked = true;
  plog(`— oturum başladı (${new Date().toLocaleString("tr-TR")})`);
}

function clearLog() {
  logBuf.length = 0;
  logVersion += 1;
  const store = logStorage();
  try {
    store?.removeItem(LOG_STORAGE_KEY);
  } catch {}
  logSubscriber?.();
}

// Panel damgası: kayıt artık günler boyu yaşadığı için bugünden eski satırlarda
// tarih de gösterilir, yoksa "15:00:27" hangi güne aitti belli olmaz.
function logStamp(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("tr-TR");
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay ? time : `${d.toLocaleDateString("tr-TR")} ${time}`;
}

// Dökümün tamamı düz metin: mekan "Kopyala"ya basıp bize yapıştırabilsin diye.
function logAsText(): string {
  return logBuf
    .map((line) => `[${new Date(line.at).toLocaleString("tr-TR")}] ${line.text}`)
    .join("\n");
}

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}

// Panel dış bir kaynağa (kayıt tamponu) abone: React'in bu iş için tuttuğu
// useSyncExternalStore ile bağlanır. Anlık görüntü debug kapalıyken -1 döner;
// sunucu tarafında da -1'dir, yani hidrasyon uyuşmazlığı olmaz.
function subscribeLog(callback: () => void) {
  logSubscriber = callback;
  return () => {
    logSubscriber = null;
  };
}
const logSnapshot = () => (debugEnabled() ? logVersion : -1);
const logServerSnapshot = () => -1;

// YouTube durum kodlarını okunur hale getir
function stateName(state: number): string {
  const YT = typeof window !== "undefined" ? window.YT : undefined;
  if (!YT) return String(state);
  switch (state) {
    case YT.PlayerState.ENDED: return "BITTI";
    case YT.PlayerState.PLAYING: return "CALIYOR";
    case YT.PlayerState.PAUSED: return "DURAKLADI";
    case YT.PlayerState.BUFFERING: return "TAMPON";
    case YT.PlayerState.CUED: return "HAZIR";
    default: return state === -1 ? "BASLAMADI" : String(state);
  }
}

// Zaman aşımı sinyali. Eski tarayıcılarda AbortSignal.timeout yok; orada
// sinyalsiz devam ederiz (yoksa her istek daha yola çıkmadan patlardı).
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout?.(ms);
  } catch {
    return undefined;
  }
}

// --- Kısıntıya dayanıklı bekçi darbesi ---
// Chrome, GÖRÜNMEYEN bir sayfanın ana iş parçacığındaki setInterval'ini saniyede
// bire (uzun süre arkada kalırsa dakikada bire) indirir. Mekanda player penceresi
// başka pencerelerin arkasında kaldığı anda bekçiler böylece susuyor: şarkı bitiyor,
// sıradakini başlatacak kod çalışmıyor, ses kesiliyor — ve sessiz kalan sayfa artık
// tamamen dondurulabildiği için kurtarma da gelmiyordu. (Kullanıcı pencereye
// dönünce müziğin ANINDA başlaması tam olarak bunun kanıtıdır.)
// Dedicated worker'ın kendi zamanlayıcısı bu kısıntıya tabi değildir; oradan
// gelen mesaj ana iş parçacığında bir görev açar ve bekçi çalışır. Sayfa gerçekten
// dondurulursa worker da durur — o durumu da freeze kaydı ele verir.
const TICKER_SOURCE = `
let id = null;
onmessage = (e) => {
  if (e.data === "start") {
    if (id) clearInterval(id);
    id = setInterval(() => postMessage("tick"), ${PLAY_NUDGE_MS});
  } else if (e.data === "stop") {
    if (id) clearInterval(id);
    id = null;
  }
};
`;

function createTicker(onTick: () => void): { stop: () => void } | null {
  if (typeof Worker === "undefined") return null;
  try {
    const url = URL.createObjectURL(new Blob([TICKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    worker.postMessage("start");
    return {
      stop: () => {
        try {
          worker.postMessage("stop");
          worker.terminate();
          URL.revokeObjectURL(url);
        } catch {}
      },
    };
  } catch {
    return null;
  }
}

function forceLowQuality(player: YTPlayer | null | undefined) {
  try {
    player?.setPlaybackQuality?.(FORCE_QUALITY);
  } catch {}
}

// --- Crossfade ---
// Kalan süre kontrolü: 250 ms, panelin ilerleme çubuğuyla aynı çözünürlük
const CROSSFADE_TICK_MS = 250;
// Geçiş başlamadan bu kadar önce sıradaki video ikinci deck'e yüklenir
// (tamponlama + reklamsız başlangıç için pay)
const PRELOAD_LEAD_SEC = 12;
// Ama asıl önyükleme çalan şarkının BAŞINDA yapılır: sıradaki video boştaki
// deck'te bütün şarkı boyunca hazır bekler, geçiş anında ağ dalgalansa bile
// yükleme beklemesi olmaz. İlk saniyeler çalan şarkının kendi tamponuna
// bırakılır — sıradakini yüklemek bant genişliğini onunla paylaşmasın.
const PRELOAD_AFTER_SEC = 5;
// Önyükleme başarısız olduysa (ağ koptu, sunucuya ulaşılamadı) bu aralıkla
// yeniden denenir — her turda denemek isteği boşuna yağdırırdı
const PRELOAD_RETRY_MS = 10_000;

// --- YOUTUBE HATA KODLARI ---
// Yalnızca bu üçü videonun KALICI olarak çalınamadığını söyler: 100 kaldırılmış
// ya da gizlenmiş, 101/150 sahibi gömmeyi kapatmış. Şarkı ancak bu kodlarda
// damgalanır (bkz. lib/queue.ts markUnplayable) — damga kalıcıdır, şarkıyı
// mekanların kataloğundan ve playlist'lerinden de siler.
// 2 (geçersiz parametre) ve 5 (HTML5 oynatıcı hatası) ise GEÇİCİ olabiliyor:
// iframe henüz oturmamışken gelen cue/load çağrısı ya da tarayıcının o anki
// hali bu kodları üretiyor. Eskiden onError her kodda damga vuruyordu; mekan
// kaydında hata 2 ile düşen ve YouTube'a sorulduğunda pekâlâ oynatılabilir olan
// şarkılar kataloglardan siliniyordu. Geçici kodlarda artık sunucuya
// dokunulmaz, yalnızca yeniden denenir.
const FATAL_YT_ERROR_CODES = new Set([100, 101, 150]);
// Aynı video bu kadar kez geçici hata verdiyse ısrar etmeyi bırak: YALNIZCA BU
// OTURUM için atlanır, sunucudaki kayda hâlâ dokunulmaz.
const TRANSIENT_ERROR_LIMIT = 3;
// --- SICAK TAMPON ---
// Kesintinin kökü şu: tarayıcı, GÖRÜNMEYEN sayfada bir videoyu BAŞLATMIYOR.
// Zaten çalmakta olan video arka planda sorunsuz devam ediyor — yasak olan
// "başlatma" fiili. Geçiş anında yaptığımız şey tam olarak buydu: cue'lanmış
// (durmuş) deck'e playVideo(). Pencere arkadaysa bu çağrı TAMPON'da asılı
// kalıyor, mekan susuyor, pencere öne alınana dek de açılmıyordu.
// Çözüm: sıradaki şarkı tamponda DURMUYOR, sessize alınmış halde ÇALIYOR.
// Geçiş anında yeni bir başlatma yok — yalnızca başa sarma + ses açma, ikisi de
// çalan bir video üzerinde serbest. Böylece pencerenin önde olması şart olmaktan
// çıkıyor.
// Sessiz deck şarkının başında döner: hem tampon hep sıcak kalır hem de video
// sonuna varıp durmaz (durursa yeniden başlatmak gerekirdi — yasak olan fiil).
const WARM_LOOP_SEC = 25;
// Sıcak tampon "cue edildi" değil "GERÇEKTEN ÇALIYOR" olduğunda hazırdır. Cue
// tutup çalmaya hiç başlamayan deck geçişte ölü çıkıyor ve gizli pencerede
// yeniden başlatılamıyor: mekan kaydında tam olarak bu görüldü (52 dakika
// sessizlik). Bu süre boyunca PLAYING gelmediyse tampon baştan kurulur.
const WARM_START_TIMEOUT_MS = 20_000;
// Ses rampasının adım aralığı: 60 ms'de bir setVolume — kulakta sürekli duyulur,
// iframe'e de aşırı çağrı gitmez
const FADE_STEP_MS = 60;
// Şarkı bu süreden kısaysa crossfade yapılmaz: geçiş şarkının hatırı sayılır
// bir kısmını yer ve iki kısa parça üst üste binince kakofoni olur
const MIN_SONG_FOR_FADE = (fadeSec: number) => fadeSec * 2 + 5;

type DeckKey = "a" | "b";
const otherDeck = (key: DeckKey): DeckKey => (key === "a" ? "b" : "a");

type NowPlayingRow = {
  video_id: string | null;
  song_id: string | null;
  is_playing: boolean;
  progress_ms?: number | null;
  volume?: number | null;
  crossfade_ms?: number | null;
};

// 0036/0039 uygulanmadan kod deploy edilirse volume/crossfade_ms kolonu yoktur ve
// select komple düşerdi — ilk hatada anlaşılıp bir alt sürüme dönülür (bkz.
// route.ts'teki claimSupported ile aynı yaklaşım)
const NP_SELECTS = [
  "video_id, song_id, is_playing, volume, crossfade_ms",
  "video_id, song_id, is_playing, volume",
  "video_id, song_id, is_playing",
];
let npSelectLevel = 0;

async function readNowPlaying(
  supabase: ReturnType<typeof createClient>,
  venueDbId: string
): Promise<NowPlayingRow | null> {
  while (npSelectLevel < NP_SELECTS.length) {
    const { data, error } = await supabase
      .from("now_playing")
      .select(NP_SELECTS[npSelectLevel])
      .eq("venue_id", venueDbId)
      .maybeSingle();
    if (!error) return (data as NowPlayingRow | null) ?? null;
    if (npSelectLevel === NP_SELECTS.length - 1) {
      console.error("[player] now_playing okunamadı:", error.message);
      return null;
    }
    console.error("[player] now_playing okunamadı, daha dar select denenecek:", error.message);
    npSelectLevel += 1;
  }
  return null;
}

type PlayerApiResult = {
  started?: boolean;
  video_id?: string | null;
  queueEmpty?: boolean;
  error?: string;
  ok?: boolean;
  taken?: boolean;
  claimed?: boolean;
};

// Çalmayı durduran engeller: oturum düştü (401) veya sahiplik başka cihaza geçti (409).
// İkisi de "kuyruk boş" DEĞİLDİR — ekranda ayrı ayrı, doğru mesajla gösterilir.
type Blocked = "auth" | "claim";

let apiPromise: Promise<void> | null = null;

// Sekme kimliği: sahiplik bunun üzerinden yürür. sessionStorage sekmeye özeldir
// ve yenilemede korunur — sayfa yenilenince kendi kilidimize takılmayız, ama
// ikinci bir sekme/cihaz her zaman farklı kimlik alır.
function playerInstanceId(venueDbId: string): string {
  const key = `pmj-player-claim:${venueDbId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

// IFrame API script'i tek sefer yüklenir; YT hazır olunca resolve eder
function loadIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// Mobil tarayıcılarda YT.setVolume etkisizdir (ses donanımdan yönetilir). Orada
// crossfade "iki şarkı 4 sn tam sesle üst üste" demek olurdu — hiç denemeyiz.
function deviceSupportsVolume(): boolean {
  if (typeof navigator === "undefined") return false;
  return !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

interface Props {
  venueDbId: string;
  // Oturum düşerse buraya yönlendiren "Tekrar giriş yap" bağlantısı gösterilir
  loginHref?: string;
  // Şu an çalan şarkının başlık bilgisi ekranda video DIŞINDA gösterilir (overlay yasak)
  onTrackChange?: (info: { videoId: string | null; isPlaying: boolean }) => void;
  /**
   * Panel içindeki küçük oynatıcı için sıkışık yerleşim: bilgi ekranlarının
   * yazı/düğme ölçüleri küçülür, açıklama satırları gizlenir. Normal ölçüler
   * 144 px genişliğindeki kutuya sığmıyor, düğme kutunun dışına taşıyordu.
   */
  compact?: boolean;
}

export default function YouTubePlayer({ venueDbId, loginHref, onTrackChange, compact }: Props) {
  const supabase = useMemo(() => createClient(), []);

  // İki deck: crossfade sırasında çıkan ve giren şarkı aynı anda çalar. Aktif
  // olan her zaman "şu an çalan"dır; diğeri ya boştadır ya sıradakini tamponlar.
  const deckAHostRef = useRef<HTMLDivElement>(null);
  const deckBHostRef = useRef<HTMLDivElement>(null);
  const decksRef = useRef<Record<DeckKey, YTPlayer | null>>({ a: null, b: null });
  // new YT.Player() nesnesi ANINDA döner ama metotları (loadVideoById vb.) ancak
  // iframe yüklenip onReady tetiklenince eklenir. Arada gelen realtime komutu
  // "loadVideoById is not a function" ile patlıyordu — hazır olana dek beklet.
  const deckReadyRef = useRef<Record<DeckKey, boolean>>({ a: false, b: false });
  const activeDeckRef = useRef<DeckKey>("a");
  const [visibleDeck, setVisibleDeck] = useState<DeckKey>("a");

  // Deck'ler 256x144 kurulur; sahnenin genişliğine göre ölçeklenerek büyütülür.
  // Sahne 16:9 (aspect-video) olduğu için tek bir çarpan iki ekseni de doldurur.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(1);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      if (width > 0) setStageScale(width / VIDEO_W);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const activePlayer = useCallback(() => decksRef.current[activeDeckRef.current], []);
  const activeReady = useCallback(() => deckReadyRef.current[activeDeckRef.current], []);
  const standbyPlayer = useCallback(() => decksRef.current[otherDeck(activeDeckRef.current)], []);

  const currentVideoRef = useRef<string | null>(null);
  const advancingRef = useRef(false);
  const advanceStartedAtRef = useRef(0);
  // Takılma bekçisinin çapası: en son GERÇEKTEN ilerlemiş konum ve o an
  const progressMarkRef = useRef<{ videoId: string | null; time: number; at: number }>({
    videoId: null,
    time: -1,
    at: 0,
  });
  // Takılma sonrası kaçıncı kurtarma adımındayız (0 yok, 1 dürt, 2 yükle, 3 atla)
  const stallStepRef = useRef(0);
  // Atlama gizli pencere yüzünden ertelendi mi (kayda tek satır düşsün diye)
  const skipDeferredRef = useRef(false);
  // Bu oturumda çalınamaz olduğu görülen videolar. Sunucudaki işaretleme yola
  // çıkana kadar geçen birkaç saniyede aynı videoyu tekrar tampona almayalım.
  const unplayableRef = useRef<Set<string>>(new Set());
  // Video başına geçici hata sayacı (bkz. FATAL_YT_ERROR_CODES). Şarkı bir kez
  // gerçekten çalmaya başlayınca sayaç silinir: tek seferlik bir aksilik onu
  // sonsuza dek şüpheli bırakmasın.
  const transientErrorsRef = useRef<Map<string, number>>(new Map());
  // Sessizce çalar halde bekleyen tampon deck (bkz. WARM_LOOP_SEC)
  const warmDeckRef = useRef<{ deck: DeckKey; videoId: string } | null>(null);
  // Tampon deck ÇALMAYA başladı mı, ve ne zamandan beri bekliyor? Cue etmek
  // hazır olmak değildir (bkz. WARM_START_TIMEOUT_MS)
  const warmPlayingRef = useRef(false);
  const warmSinceRef = useRef(0);
  // Bekçinin en son çalıştığı an — arada uzun boşluk varsa sekme dondurulmuştu
  const lastTickAtRef = useRef(0);
  // Geçişin duvar saatiyle başlangıcı ve süresi (rampa asılırsa zorla bitirmek için)
  const fadeStartedAtRef = useRef(0);
  const fadeMsRef = useRef(0);
  // Çalması gereken ama (arka plan sekmesinde autoplay engeli vb.) başlayamayan
  // videoyu bekçinin ayırt edebilmesi için niyet ayrı tutulur
  const desiredPlayingRef = useRef(false);
  // Niyetin en son YERELDE değiştiği an (videoya tıklama, panel komutu, yükleme).
  // DB'den gelen çalma durumu bu andan hemen sonra geldiyse kendi yankımızdır.
  const intentAtRef = useRef(0);
  // Son loadVideo zamanı — pause yankısı grace penceresinin çapası
  const lastLoadAtRef = useRef(0);
  // Son AÇIK duraklatma niyeti (panel komutu / DB'den gelen duraklat) zamanı
  const explicitPauseAtRef = useRef(0);
  // Pencere odağının video iframe'ine geçtiği an: kullanıcının YouTube'un kendi
  // duraklat düğmesine tıkladığını buradan anlarız (iframe içi tıklama üst
  // sayfada olay üretmez, ama odak devrini blur olarak görürüz)
  const blurToIframeAtRef = useRef(0);
  const nudgeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingVideoRef = useRef<string | null>(null);

  // Niyeti YERELDE değiştir (videoya tıklama, panel komutu, yükleme): zaman damgası
  // da düşer, böylece yoldaki bayat DB yankısı bunun üstüne yazamaz.
  const setDesiredPlaying = useCallback((value: boolean) => {
    desiredPlayingRef.current = value;
    intentAtRef.current = Date.now();
  }, []);
  // DB'den okunan çalma durumu uygulanabilir mi? Taze yerel niyet varken hayır:
  // o satırı büyük ihtimalle kendi heartbeat'imiz yazdı ve yankısı geç kaldı.
  const dbStateIsFresh = useCallback(
    () => Date.now() - intentAtRef.current > LOCAL_INTENT_GRACE_MS,
    []
  );

  // Kuyruk ilerletme kilidi. Zaman damgalıdır: istek asılı kalır ya da sekme
  // isteğin ortasında dondurulursa kilit sonsuza dek kapalı kalıyordu ve
  // bekçilerin hepsi (hepsi bu kilide bakar) sessizce devre dışı oluyordu.
  const setAdvancing = useCallback((value: boolean) => {
    advancingRef.current = value;
    advanceStartedAtRef.current = value ? Date.now() : 0;
  }, []);
  const advanceBusy = useCallback(() => {
    if (!advancingRef.current) return false;
    if (Date.now() - advanceStartedAtRef.current < ADVANCE_TIMEOUT_MS) return true;
    advancingRef.current = false;
    advanceStartedAtRef.current = 0;
    return false;
  }, []);

  // Pencere arkada kaldığı için çalma başlayamadı: mekan ekrana dönünce sebebi
  // görsün. Sessizliğin sebebini bilmeden "sistem bozuk" diye bakılıyordu.
  const [backgroundBlocked, setBackgroundBlocked] = useState(false);

  // İlerleme çapasını sıfırla: yeni video yüklendi ya da oynatma gerçekten
  // ilerledi. Kurtarma merdiveni de baştan başlar.
  const markProgress = useCallback((videoId: string | null, time = -1) => {
    progressMarkRef.current = { videoId, time, at: Date.now() };
    stallStepRef.current = 0;
    skipDeferredRef.current = false;
  }, []);

  // --- Sekmeyi uyanık tutan taşıyıcı ton (bkz. KEEPALIVE_HZ) ---
  // Kullanıcının "Başlat" dokunuşuyla kurulur: autoplay politikası gereği
  // AudioContext ancak bir etkileşimle çalışmaya başlayabilir.
  const keepAliveRef = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);
  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      keepAliveRef.current.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Rampa: ani başlangıç bazı hoparlörlerde "tık" sesi çıkarır
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(KEEPALIVE_GAIN, ctx.currentTime + 0.5);
      osc.frequency.value = KEEPALIVE_HZ;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAliveRef.current = { ctx, gain };
      ctx.resume().catch(() => {});
    } catch {}
  }, []);
  // İşletim sistemi ses odağını başka uygulamaya verdiğinde context askıya
  // alınabiliyor; her bekçi turunda ve sekmeye dönüşte geri açılır.
  const keepAliveAlive = useCallback(() => {
    const alive = keepAliveRef.current;
    if (!alive) return;
    if (alive.ctx.state !== "running") alive.ctx.resume().catch(() => {});
  }, []);

  // Teşhis paneli: yalnızca ?debug=1 ile. Kayıt her hâlükârda konsola yazılır;
  // panel, mekanda DevTools açmadan olay dökümünü okuyabilmek için var.
  const debugOn = useSyncExternalStore(subscribeLog, logSnapshot, logServerSnapshot) >= 0;
  const [live, setLive] = useState("");

  // Önceki oturumun kaydını geri yükle ve sınırı işaretle. Bu satır olmadan
  // döküm yanıltır: sayfanın yeniden yüklendiği an ile kesintinin yaşandığı an
  // birbirine karışırdı.
  useEffect(() => {
    hydrateLog();
    installLogFlushHooks();
    markSession();
  }, []);

  const [started, setStarted] = useState(false);
  // iOS Safari oynatma iznini YALNIZCA kullanıcı dokunuşunun içinde verir ve
  // dokunuştan sonraki her await izni düşürür. Bu yüzden "Başlat" akışı ikiye
  // ayrıldı: ısınma (deck'leri kur + sıradakini sessizce cue'la) sayfa açılır
  // açılmaz olur, dokunuş anında geriye tek senkron playVideo() kalır. Render
  // beklemeden okunması gerektiği için ayna ref: onReady/onStateChange hangi
  // aşamada olduğumuzu buradan anlar.
  const startedRef = useRef(false);
  const prewarmDoneRef = useRef(false);
  // Isınmada cue'lanan video — dokunuş anında çalmaya başlayacak olan
  const prewarmCuedRef = useRef<string | null>(null);
  const [idle, setIdle] = useState(false); // kuyruk boş, çalan yok
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [claimTaken, setClaimTaken] = useState(false);
  // Render beklemeden okunabilsin diye ayna: advance/idle mantığı buna bakar
  const blockedRef = useRef<Blocked | null>(null);
  // İlk istekte üretilir: sunucuda çalışmaz, render'ı da etkilemez
  const claimIdRef = useRef<string | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Panelle arasındaki düşük gecikmeli hat (bkz. lib/player-bus.ts)
  const busRef = useRef<ReturnType<typeof playerBusChannel> | null>(null);
  const claimId = useCallback(() => {
    claimIdRef.current ??= playerInstanceId(venueDbId);
    return claimIdRef.current;
  }, [venueDbId]);

  // Panelden gelen ses seviyesi. Player hazır olmadan komut gelirse burada
  // bekler, onReady bunu uygular.
  const volumeRef = useRef<number | null>(null);
  // Cihaz ses komutunu yok sayıyor mu? (mobilde YT.setVolume etkisizdir)
  const [volumeIgnored, setVolumeIgnored] = useState(false);
  const volumeIgnoredRef = useRef(false);
  const volumeDriftRef = useRef(0);

  // Crossfade durumu. Süre panelden gelir (now_playing.crossfade_ms); 0 = kapalı.
  const crossfadeMsRef = useRef(0);
  const fadingRef = useRef(false);
  const [fading, setFading] = useState(false);
  // Görsel geçişin süresi. Ref yerine state: render sırasında ref okunamaz ve
  // süre geçiş başlarken sabitlenmeli — panel ortada değeri değiştirse bile
  // devam eden geçiş kendi süresiyle tamamlanır.
  const [fadeMs, setFadeMs] = useState(0);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Önyüklenen sıradaki video ve bunun hangi şarkı için yapıldığı
  const preloadedVideoRef = useRef<string | null>(null);
  const preloadedForRef = useRef<string | null>(null);
  const preloadRetryAtRef = useRef(0);
  const canCrossfadeRef = useRef(false);
  // Sunucuya ulaşılamadığı için önden bildiğimiz şarkıyı kendi kararımızla
  // çalıyoruz: now_playing satırı bu sırada bayattır, bağlantı dönünce
  // eşitlenir (bkz. syncOfflineFallback)
  const offlineFallbackRef = useRef(false);

  // İstenen seviyeyi AKTİF deck'e bas. Tek seferlik DEĞİL: YouTube yeni video
  // yüklenince kendi hatırladığı seviyeye dönebiliyor, bu yüzden aşağıdaki
  // bekçi bunu gerektikçe tekrar çağırır. Geçiş sırasında rampayı ezmemek için
  // devre dışıdır.
  const pushVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = activePlayer();
    if (volume === null || fadingRef.current || !activeReady()) return;
    if (typeof player?.setVolume !== "function") return;
    try {
      player.setVolume(volume);
      // setVolume(0) bazı cihazlarda yok sayılıyor; sessize alma ayrıca mute ile
      // pekiştirilir. Tersi de geçerli: mute açık kalırsa >0 seviye duyulmaz.
      if (volume === 0) player.mute?.();
      else if (player.isMuted?.()) player.unMute?.();
    } catch {}
  }, [activePlayer, activeReady]);

  const applyVolume = useCallback(
    (value: number | null | undefined) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      volumeRef.current = Math.min(100, Math.max(0, Math.round(value)));
      volumeDriftRef.current = 0;
      volumeIgnoredRef.current = false;
      setVolumeIgnored(false);
      pushVolume();
    },
    [pushVolume]
  );

  const applyCrossfade = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    crossfadeMsRef.current = Math.min(12_000, Math.max(0, Math.round(value)));
  }, []);

  // Bekçi: player'ın gerçek sesini okuyup istenenden saptıysa geri yazar.
  // "Ses kısılıyor ama kendiliğinden geri açılıyor" şikâyetinin kaynağı buydu —
  // video değişiminde YouTube kendi seviyesine dönüyor, kimse geri yazmıyordu.
  const enforceVolume = useCallback(() => {
    const volume = volumeRef.current;
    const player = activePlayer();
    // Geçiş sırasında ses kasten rampada: bekçi burada susmazsa rampayı ezer
    if (volume === null || fadingRef.current || !activeReady() || !player) return;
    let actual: number | null = null;
    let muted = false;
    try {
      actual = typeof player.getVolume === "function" ? Math.round(player.getVolume()) : null;
      muted = player.isMuted?.() ?? false;
    } catch {
      return;
    }
    // Sapma OLMASA BİLE her turda yeniden yazılır. getVolume() bazı cihazlarda
    // yalan söylüyor: JS'e en son verilen değeri döndürürken hoparlörden çıkan
    // ses YouTube'un kendi hatırladığı seviyeye dönmüş oluyor ("bar 5'te kalıyor
    // ama ses yükseliyor"). Okumaya güvenip beklemek yerine körlemesine basıyoruz;
    // setVolume idempotent, aynı değeri tekrar yazmanın maliyeti yok.
    pushVolume();

    const drifted = (actual !== null && actual !== volume) || (volume === 0 ? !muted : muted);
    if (!drifted) {
      volumeDriftRef.current = 0;
      volumeIgnoredRef.current = false;
      setVolumeIgnored(false);
      return;
    }
    // Üst üste sapma: cihaz komutu kabul etmiyor demektir (mobil tarayıcılarda
    // ses donanımdan yönetilir). Ekranda söyleyelim ki mekan boşuna uğraşmasın.
    // Crossfade de bu noktada güvenilmez olur: rampa duyulmaz, iki şarkı tam
    // sesle üst üste biner — o yüzden kapatılır.
    volumeDriftRef.current += 1;
    if (volumeDriftRef.current >= 3) {
      volumeIgnoredRef.current = true;
      setVolumeIgnored(true);
    }
  }, [activePlayer, activeReady, pushVolume]);

  const setBlock = useCallback((next: Blocked | null) => {
    if (blockedRef.current === next) return;
    blockedRef.current = next;
    setBlocked(next);
  }, []);

  const api = useCallback(
    async (payload: Record<string, unknown>): Promise<PlayerApiResult | null> => {
      try {
        const res = await fetch(`/api/player/${venueDbId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, claim_id: claimId() }),
          // Süresiz bekleyen istek yok: arka planda asılan bir çağrı kuyruk
          // ilerletme kilidini de birlikte asıyordu
          signal: timeoutSignal(API_TIMEOUT_MS),
        });
        // 401: mekan oturumu düştü. 409: çalma başka bir cihaza geçti.
        if (res.status === 401) {
          plog(`api ${payload.action}: 401 — mekan oturumu düştü`);
          setBlock("auth");
          return null;
        }
        if (res.status === 409) {
          plog(`api ${payload.action}: 409 — sahiplik başka cihazda`);
          setBlock("claim");
          return null;
        }
        if (!res.ok) {
          plog(`api ${payload.action}: HTTP ${res.status}`);
          return null;
        }
        setBlock(null);
        return res.json();
      } catch (e) {
        plog(`api ${payload.action}: AĞ HATASI (${(e as Error)?.name ?? "?"})`);
        return null;
      }
    },
    [venueDbId, claimId, setBlock]
  );

  // Geçişi bitir/iptal et: rampayı durdur, boştaki deck'i sustur, aktif deck'i
  // mekanın seviyesine kilitle. Hem normal bitişte hem elle atlama/duraklatma
  // gibi araya giren komutlarda çağrılır.
  const endCrossfade = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const wasFading = fadingRef.current;
    fadingRef.current = false;
    fadeStartedAtRef.current = 0;
    const idleDeck = standbyPlayer();
    try {
      idleDeck?.setVolume(0);
      idleDeck?.pauseVideo();
    } catch {}
    // Duraklattığımız deck artık sıcak tampon değil; sıradaki şarkı için
    // preloadNext yeniden ısıtacak
    warmDeckRef.current = null;
    warmPlayingRef.current = false;
    warmSinceRef.current = 0;
    if (wasFading) setFading(false);
    setVisibleDeck(activeDeckRef.current);
    pushVolume();
  }, [standbyPlayer, pushVolume]);

  // Geçiş sürüyor mu? Bütün bekçiler geçiş sırasında susar (rampaya karışmasınlar
  // diye) — bu yüzden asılı kalmış bir geçiş player'ı bekçisiz bırakıyordu.
  // Rampa kendi süresini + payı aştıysa geçiş burada zorla kapatılır.
  const fadeBusy = useCallback(() => {
    if (!fadingRef.current) return false;
    const limit = (fadeMsRef.current || crossfadeMsRef.current) + FADE_OVERRUN_MS;
    if (Date.now() - fadeStartedAtRef.current < limit) return true;
    endCrossfade();
    return false;
  }, [endCrossfade]);

  // Panelin alt barına anlık durum: DB → Realtime turunu beklemeden gider, böylece
  // ilerleme çubuğu ve oynat/duraklat simgesi player'la aynı anda değişir.
  const broadcastState = useCallback((override?: Partial<PlayerStateBeat>) => {
    const channel = busRef.current;
    if (!channel) return;
    const player = activePlayer();
    let progress = 0;
    let duration: number | null = null;
    let playing = false;
    // Ses fiilen akıyor mu: yalnızca PLAYING. Panel ilerleme çubuğunu buna göre
    // ilerletir (tamponlama boyunca çubuk beklemeli — bkz. PlayerStateBeat.started).
    let started = false;
    if (player && currentVideoRef.current) {
      try {
        progress = Math.floor(player.getCurrentTime() * 1000);
        const secs = player.getDuration();
        duration = Number.isFinite(secs) && secs > 0 ? Math.floor(secs * 1000) : null;
        const state = player.getPlayerState();
        started = state === window.YT?.PlayerState.PLAYING;
        // Niyet "çal" iken anlık durum duraklamış olabilir (dış kaynaklı
        // duraklatma, tamponlama, autoplay engeli): bunlar birkaç saniye içinde
        // bekçi tarafından geri açılır, panele "durdu" diye bildirilmez.
        playing =
          desiredPlayingRef.current ||
          state === window.YT?.PlayerState.PLAYING ||
          state === window.YT?.PlayerState.BUFFERING;
      } catch {}
    }
    const beat: PlayerStateBeat = {
      video_id: currentVideoRef.current,
      is_playing: playing,
      progress_ms: Math.max(progress, 0),
      duration_ms: duration,
      at: Date.now(),
      started,
      // Yeni video yüklenirken getCurrentTime bir süre ESKİ şarkıyı raporlar;
      // çağıran taraf doğru değeri biliyorsa üstüne yazar
      ...override,
    };
    try {
      channel.send({ type: "broadcast", event: STATE_EVENT, payload: beat });
    } catch {}
    // Aynı sekmedeki panele doğrudan: Realtime kendi mesajımızı geri vermez
    sendLocalState(venueDbId, beat);
  }, [activePlayer, venueDbId]);

  // İlerleme + sağlık sinyali — admin paneli bununla "oynatıcı çevrimdışı" uyarısı verir
  const sendHeartbeat = useCallback(() => {
    const player = activePlayer();
    if (!player) return;
    // Aynı bilgi panele hızlı hattan da gider: DB yolu kalıcılık için, bu tazelik için
    broadcastState();
    // Kuyruk boşken de sinyal gider: müşteri tarafı "oynatıcı açık mı" sorusunu
    // heartbeat tazeliğinden okuyor; sessiz kalırsak boş mekanda şarkı eklenemez.
    // presence:true çalma durumunu yazmaz, yalnızca sağlık sinyalini tazeler.
    if (!currentVideoRef.current) {
      api({ action: "heartbeat", presence: true });
      return;
    }
    let progress = 0;
    let playing = false;
    try {
      progress = Math.floor(player.getCurrentTime() * 1000);
      const state = player.getPlayerState();
      // BUFFERING da "çalıyor" sayılır — geçiş anındaki tamponlama sunucuya
      // "durdu" diye yazılıp yankıyla yeni şarkıyı durdurmasın.
      // Aynı gerekçeyle niyet "çal" iken dış kaynaklı duraklatma da DB'ye
      // yazılmaz: eskiden bu yazım Realtime yankısıyla geri dönüp çalmayı
      // kalıcı olarak durduruyordu. is_playing=false ancak GERÇEK duraklatmada
      // (panel komutu / videoya tıklama / kuyruk boş) yazılır.
      playing =
        desiredPlayingRef.current ||
        state === window.YT?.PlayerState.PLAYING ||
        state === window.YT?.PlayerState.BUFFERING;
    } catch {
      return;
    }
    // video_id eşlik eder: sunucu yalnızca satırdaki video hâlâ buysa yazar —
    // skip ile yarışan bayat heartbeat yeni şarkının durumunu ezemez
    api({
      action: "heartbeat",
      progress_ms: progress,
      is_playing: playing,
      video_id: currentVideoRef.current,
    });
  }, [api, activePlayer, broadcastState]);

  // Odak şu an video iframe'inde mi? Kendi düğmelerimize tıklamak odağı iframe'e
  // taşımaz; programatik playVideo da taşımaz. Odak oradaysa kullanıcı fiilen
  // videonun üstüne tıklamış demektir.
  const iframeFocused = useCallback(() => {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (!el || el.tagName !== "IFRAME") return false;
    return !!(deckAHostRef.current?.contains(el) || deckBHostRef.current?.contains(el));
  }, []);

  // Bu duraklatma gerçekten "durdur" niyeti mi? Yalnızca panel komutu ve videoya
  // yapılan tıklama sayılır; geri kalan her şey dış kaynaklıdır ve toparlanır.
  const isExplicitPause = useCallback(() => {
    const now = Date.now();
    if (now - explicitPauseAtRef.current < EXPLICIT_PAUSE_WINDOW_MS) return true;
    if (now - blurToIframeAtRef.current < EXPLICIT_PAUSE_WINDOW_MS) return true;
    return iframeFocused();
  }, [iframeFocused]);

  // Niyet "çal" iken player'ın gerçekten çaldığını doğrula; başlamadıysa dürt.
  // Arka plan sekmesinde tarayıcının sessizce engellediği başlatmaları toparlar.
  const ensurePlaying = useCallback(() => {
    const player = activePlayer();
    const YT = window.YT;
    if (!player || !YT || !desiredPlayingRef.current || !currentVideoRef.current) return;
    // Yükleme yolda: deck hâlâ eski videoyu tutuyor olabilir, dürtme onu geri
    // başlatırdı (bkz. LOAD_SETTLE_MS)
    if (Date.now() - lastLoadAtRef.current < LOAD_SETTLE_MS) return;
    try {
      const state = player.getPlayerState();
      // Biten videoyu yeniden başlatma: sıradakine geçiş advance()'in işi
      if (state === YT.PlayerState.ENDED) return;
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        player.playVideo();
      }
    } catch {}
  }, [activePlayer]);

  // Aşağıda tanımlanan tam bekçiye (nudgePlayback) buradan da ulaşılır: takılma
  // merdiveni tek bir yerde dursun, hem periyodik tur hem de yükleme sonrası
  // denemeler aynı mantığı çalıştırsın.
  const nudgeRef = useRef<() => void>(() => {});

  const scheduleNudges = useCallback(
    (delays: number[]) => {
      nudgeTimersRef.current.forEach(clearTimeout);
      // Ses de aynı turda doğrulanır: yeni video YouTube'un kendi seviyesiyle
      // açılırsa mekanın ayarı birkaç saniye içinde geri basılır
      nudgeTimersRef.current = delays.map((ms) =>
        setTimeout(() => {
          nudgeRef.current();
          enforceVolume();
        }, ms)
      );
    },
    [enforceVolume]
  );

  // Sert geçiş: videoyu AKTİF deck'e yükler. Elle atlama, panel komutu, hata
  // sonrası atlama hep buradan geçer — crossfade yalnızca şarkı doğal biterken
  // devreye girer, çünkü tuşa basan biri beklemek istemez.
  const loadVideo = useCallback(
    (videoId: string) => {
      // Araya giren komut: yarım kalmış geçiş derhal biter, boştaki deck susar
      endCrossfade();
      preloadedVideoRef.current = null;
      preloadedForRef.current = null;
      preloadRetryAtRef.current = 0;

      currentVideoRef.current = videoId;
      setDesiredPlaying(true);
      lastLoadAtRef.current = Date.now();
      markProgress(videoId);
      setIdle(false);
      const player = activePlayer();
      plog(
        `yükle ${videoId} → deck ${activeDeckRef.current}${activeReady() ? "" : " (deck hazır değil, bekliyor)"}`
      );
      if (activeReady() && typeof player?.loadVideoById === "function") {
        pendingVideoRef.current = null;
        player.loadVideoById(videoId);
        forceLowQuality(player);
        scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
      } else {
        // Player henüz hazır değil — onReady bu videoyu yükleyecek
        pendingVideoRef.current = videoId;
      }
      onTrackChange?.({ videoId, isPlaying: true });
      // Panel yeni şarkıyı DB turunu beklemeden görsün; süre henüz bilinmiyor.
      // started:false — video daha tamponlanıyor, panelin çubuğu saymamalı
      // (deck hâlâ ESKİ şarkıyı PLAYING raporlayabilir, o yüzden elle veriyoruz).
      broadcastState({
        video_id: videoId,
        is_playing: true,
        progress_ms: 0,
        duration_ms: null,
        started: false,
      });
    },
    [
      onTrackChange,
      scheduleNudges,
      endCrossfade,
      activePlayer,
      activeReady,
      broadcastState,
      setDesiredPlaying,
      markProgress,
    ]
  );

  // Sıradaki şarkı zaten boştaki deck'te tamponlanmışsa onu çal: video baştan
  // yüklenmez, ağ o an dalgalansa bile ses kesintisiz devam eder. Tampon yoksa
  // false döner, çağıran normal yüklemeye düşer.
  const playPreloaded = useCallback(
    (videoId: string): boolean => {
      if (preloadedVideoRef.current !== videoId) return false;
      // Geçiş sürüyorsa deck'lerle oynama: loadVideo yolu rampayı düzgün keser
      if (fadingRef.current) return false;
      const from = activeDeckRef.current;
      const to = otherDeck(from);
      const incoming = decksRef.current[to];
      if (!incoming || !deckReadyRef.current[to]) return false;
      try {
        // Sıcak tampon başta dönüyor olabilir: önce başa sar (bkz. WARM_LOOP_SEC)
        incoming.seekTo(0, true);
        incoming.unMute?.();
        incoming.setVolume(volumeRef.current ?? 100);
        incoming.playVideo();
      } catch {
        return false;
      }
      try {
        decksRef.current[from]?.pauseVideo();
      } catch {}

      plog(`tampondan çal ${videoId} → deck ${to}`);
      activeDeckRef.current = to;
      currentVideoRef.current = videoId;
      setDesiredPlaying(true);
      lastLoadAtRef.current = Date.now();
      markProgress(videoId);
      preloadedVideoRef.current = null;
      preloadedForRef.current = null;
      preloadRetryAtRef.current = 0;
      setVisibleDeck(to);
      setIdle(false);
      pendingVideoRef.current = null;
      onTrackChange?.({ videoId, isPlaying: true });
      broadcastState({
        video_id: videoId,
        is_playing: true,
        progress_ms: 0,
        duration_ms: null,
        started: false,
      });
      scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
      return true;
    },
    [onTrackChange, broadcastState, scheduleNudges, setDesiredPlaying, markProgress]
  );

  // Şarkı bitti / hata verdi → kuyruğu ilerlet, dönen videoyu yükle
  const advance = useCallback(
    async (payload: Record<string, unknown>) => {
      if (advanceBusy()) {
        plog(`ilerlet(${payload.action}) ATLANDI — önceki istek sürüyor`);
        return;
      }
      setAdvancing(true);
      plog(`ilerlet(${payload.action}) istendi`);
      try {
        let result = await api(payload);
        // Ağ/sunucu hatası "kuyruk boş" DEĞİLDİR: tek denemede idle'a düşmek
        // geçici bir kesintiyi sessizliğe çeviriyordu — kısa aralıkla tekrar dene.
        // Tamponda sıradaki şarkı hazır bekliyorsa beklemeye hiç girmeyiz;
        // müzik anında devam eder, kuyruk sonradan eşitlenir.
        for (
          let i = 0;
          !result && !blockedRef.current && !preloadedVideoRef.current && i < 2;
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1_200));
          result = await api(payload);
        }
        plog(
          `ilerlet(${payload.action}) sonuç: ${
            result ? `başladı=${result.started} video=${result.video_id ?? "-"}` : "YANIT YOK"
          }`
        );
        if (result?.started && result.video_id) {
          // Bu videoyu az önce başka bir yol (Realtime yankısı, panelin hızlı
          // hattı) yüklediyse ikinci kez yükleme: arka arkaya iki loadVideoById
          // iframe'i asılı bırakıp şarkıyı hiç başlatmayabiliyor.
          const justLoaded =
            result.video_id === currentVideoRef.current &&
            Date.now() - lastLoadAtRef.current < 5_000;
          // Tamponda duruyorsa oradan çal, yoksa normal yükle
          if (!justLoaded && !playPreloaded(result.video_id)) loadVideo(result.video_id);
        } else if (!result && !blockedRef.current && preloadedVideoRef.current) {
          // Sunucuya ulaşılamıyor AMA sıradaki şarkıyı önceden öğrenip tampona
          // almıştık: müzik susmasın, onu çal. Kuyruk sunucuda ilerlemedi;
          // bağlantı dönünce reconcile eşitler (bkz. syncOfflineFallback).
          const fallback = preloadedVideoRef.current;
          plog(`sunucuya ulaşılamadı — çevrimdışı yedek çalınıyor (${fallback})`);
          if (!playPreloaded(fallback)) loadVideo(fallback);
          offlineFallbackRef.current = true;
        } else if (!blockedRef.current) {
          plog("kuyruk boş — sessizlik ekranı");
          // Yalnızca gerçekten sıradaki yoksa idle'a düş. Oturum düşmesi ya da
          // sahiplik kaybı "kuyruk boş" değildir; kendi ekranını gösterir.
          endCrossfade();
          currentVideoRef.current = null;
          setDesiredPlaying(false);
          preloadedVideoRef.current = null;
          preloadedForRef.current = null;
          preloadRetryAtRef.current = 0;
          offlineFallbackRef.current = false;
          setIdle(true);
          onTrackChange?.({ videoId: null, isPlaying: false });
          broadcastState({ video_id: null, is_playing: false, progress_ms: 0 });
        }
      } finally {
        setAdvancing(false);
      }
    },
    [
      api,
      loadVideo,
      onTrackChange,
      endCrossfade,
      broadcastState,
      playPreloaded,
      setDesiredPlaying,
      advanceBusy,
      setAdvancing,
    ]
  );

  // Sıradaki videoyu boştaki deck'e tampona al. Kuyruk TÜKETİLMEZ (peek): geçiş
  // fiilen başlayınca gerçek "next" atılır. Arada öncelikli istek gelirse dönen
  // video farklı olur; o durumda tampon boşa gider, ses akışı bozulmaz.
  const preloadNext = useCallback(async () => {
    const anchor = currentVideoRef.current;
    if (!anchor) return;
    // Geçiş sırasında boştaki deck çıkan şarkıyı çalıyor — üstüne cue atma
    if (fadeBusy() || advanceBusy()) return;
    // Bu şarkı için tampon zaten hazır. AMA "cue edildi" hazır DEĞİLDİR: gizli
    // pencerede deck çoğu zaman TAMPON'da asılı kalıp hiç çalmaya başlamıyor ve
    // eski kod bunu hazır sayıp bir daha hiç denemiyordu — geçiş anında ölü deck
    // çıkıyor, müzik susuyordu. Çalmayan tampon süresi dolunca baştan kurulur.
    // Ölçüm YALNIZCA ortada bekleyen bir tampon varken anlamlıdır: tampon deck
    // aktife devredildiğinde sayaç eskir ve ilk turda sahte "179 sn başlamadı"
    // alarmı verirdi (mekan kaydında görüldü).
    const warmDead =
      canCrossfadeRef.current &&
      warmDeckRef.current !== null &&
      warmDeckRef.current.deck !== activeDeckRef.current &&
      !warmPlayingRef.current &&
      warmSinceRef.current > 0 &&
      Date.now() - warmSinceRef.current > WARM_START_TIMEOUT_MS;
    if (preloadedVideoRef.current && preloadedForRef.current === anchor && !warmDead) return;
    // Başarısız denemeden sonra hemen tekrar deneme
    if (Date.now() < preloadRetryAtRef.current) return;
    if (warmDead) {
      plog(
        `sıcak tampon ${Math.round(
          (Date.now() - warmSinceRef.current) / 1000
        )} sn çalmaya başlamadı — baştan kuruluyor`
      );
      preloadedVideoRef.current = null;
      warmDeckRef.current = null;
      warmPlayingRef.current = false;
      warmSinceRef.current = 0;
    }
    preloadRetryAtRef.current = Date.now() + PRELOAD_RETRY_MS;
    preloadedForRef.current = anchor;

    const result = await api({ action: "peek" });
    const videoId = result?.video_id;
    // Şarkı bu arada değiştiyse tampon geçersiz. Çevrimdışı yedekle çalarken
    // kuyruk sunucuda ilerlemediği için peek ÇALAN şarkıyı döndürebilir —
    // onu tampona alırsak şarkı kendini tekrar ederdi.
    if (!videoId || videoId === currentVideoRef.current || currentVideoRef.current !== anchor) {
      return;
    }
    // Kuyruk değişti diye tazeledik ama sıradaki aynı çıktı: tamponu bozma
    if (videoId === preloadedVideoRef.current) return;
    // İşaretleme sunucuya henüz işlemediyse aynı bozuk videoyu tekrar cue'lamayalım
    if (unplayableRef.current.has(videoId)) return;

    const deck = otherDeck(activeDeckRef.current);
    const player = decksRef.current[deck];
    if (!player || !deckReadyRef.current[deck]) return;
    try {
      // Sessize alınmış olarak tamponlanır: cue çalmaz ama tarayıcı yine de
      // sesi açarsa mekanda duyulmasın
      player.setVolume(0);
      player.mute?.();
      player.cueVideoById(videoId);
      forceLowQuality(player);
      preloadedVideoRef.current = videoId;
      // SICAK TAMPON: cue yetmez, sessizce ÇALDIRIYORUZ (bkz. WARM_LOOP_SEC).
      // Geçişte "başlatma" fiili kalmasın diye deck bu andan itibaren çalar
      // durumda tutulur; sesi 0 ve mute olduğu için mekanda duyulmaz.
      // Mobilde YAPILMAZ: iOS/Android aynı anda tek medya öğesi çalmasına izin
      // verir, ikinci deck çalanı durdururdu. Zaten arka plan sorunu mekandaki
      // masaüstü penceresinin sorunu (mobilde çapraz geçiş de kapalı).
      if (canCrossfadeRef.current) {
        player.playVideo();
        warmDeckRef.current = { deck, videoId };
        // Sayaç burada başlar: PLAYING gelmezse WARM_START_TIMEOUT_MS sonunda
        // bu tampon ölü sayılıp yeniden kurulur
        warmPlayingRef.current = false;
        warmSinceRef.current = Date.now();
      }
    } catch {}
  }, [api, fadeBusy, advanceBusy]);

  // Sıcak tamponu çalar ve BAŞA YAKIN tut. İki işi var:
  //  - video sonuna varıp durmasın (durursa geçişte "başlatma" gerekir, gizli
  //    pencerede yasak olan fiil tam olarak budur),
  //  - tarayıcı sessiz deck'i kendiliğinden duraklattıysa geri açsın.
  const keepWarmDeckLooping = useCallback(() => {
    const warm = warmDeckRef.current;
    if (!warm || fadingRef.current) return;
    // Devredilmiş deck artık sıcak tampon değildir
    if (warm.deck === activeDeckRef.current) {
      warmDeckRef.current = null;
      warmPlayingRef.current = false;
      warmSinceRef.current = 0;
      return;
    }
    const player = decksRef.current[warm.deck];
    if (!player || !deckReadyRef.current[warm.deck]) return;
    const YT = window.YT;
    try {
      // Sesi her turda teyit et: YouTube video değişiminde sessizliği kaldırabiliyor
      player.setVolume(0);
      player.mute?.();
      const state = player.getPlayerState();
      // UNSTARTED de dürtülür: gizli pencerede cue'lanan deck çoğu zaman tam
      // burada, hiç başlamadan bekliyor ve eski kod ona hiç dokunmuyordu
      if (
        YT &&
        (state === YT.PlayerState.PAUSED ||
          state === YT.PlayerState.CUED ||
          state === -1) /* UNSTARTED */
      ) {
        player.playVideo();
        return;
      }
      if (YT && state === YT.PlayerState.ENDED) {
        // Buraya düşmemeliydi; yine de tamponu sıcak tutmayı dene
        player.seekTo(0, true);
        player.playVideo();
        return;
      }
      if (YT && state === YT.PlayerState.PLAYING && player.getCurrentTime() > WARM_LOOP_SEC) {
        player.seekTo(0, true);
      }
    } catch {}
  }, []);

  // Çapraz geçişi başlat: sıradakini boştaki deck'te çaldır, çıkanın sesini
  // 0'a indirirken girenin sesini mekanın seviyesine çıkar.
  const startCrossfade = useCallback(async () => {
    if (fadeBusy() || advanceBusy()) return;
    const ms = crossfadeMsRef.current;
    const from = activeDeckRef.current;
    const to = otherDeck(from);
    const outgoing = decksRef.current[from];
    const incoming = decksRef.current[to];
    if (ms <= 0 || !outgoing || !incoming || !deckReadyRef.current[to]) return;

    fadingRef.current = true;
    // Duvar saatiyle çapa: rampa kısılmış sekmede takılırsa fadeBusy() geçişi
    // zorla kapatsın, bekçiler bekçisiz kalmasın
    fadeStartedAtRef.current = Date.now();
    fadeMsRef.current = ms;
    setFadeMs(ms);
    setFading(true);

    // Kuyruğu ŞİMDİ ilerlet: yeni şarkı bu andan itibaren duyuluyor, panelin ve
    // müşteri ekranının "şu an çalan"ı da bu anda değişmeli.
    setAdvancing(true);
    let result: PlayerApiResult | null = null;
    try {
      result = await api({ action: "next" });
    } finally {
      setAdvancing(false);
    }

    // İstek sürerken araya komut girmiş olabilir (panelden atlama, duraklatma,
    // sahiplik kaybı): endCrossfade bayrağı düşürür ve geçiş iptal edilmiştir.
    // Sunucuya yazılan yeni şarkıyı Realtime/reconcile zaten aktif deck'e yükler.
    if (!fadingRef.current) return;

    const videoId = result?.started ? result.video_id : null;
    if (!videoId) {
      // Sıradaki yok (kuyruk boş) ya da istek düştü: geçişten vazgeç, şarkı
      // normal şekilde bitsin — ENDED zaten idle ekranını getirir
      endCrossfade();
      return;
    }

    try {
      incoming.setVolume(0);
      incoming.unMute?.();
      // Tampon tuttuysa doğrudan çal; kuyruk değiştiyse (öncelikli istek) yükle
      if (preloadedVideoRef.current === videoId) {
        // Sıcak tampon şarkının başında dönüyordu: sesi açmadan önce başa sar.
        // Seek + ses açma, ÇALAN bir video üzerinde serbesttir — gizli pencerede
        // yasak olan tek fiil "durmuş videoyu başlatmak"tı.
        incoming.seekTo(0, true);
        incoming.playVideo();
      } else {
        incoming.loadVideoById(videoId);
        forceLowQuality(incoming);
      }
    } catch {}

    // Aktiflik ANINDA devredilir: heartbeat, ses bekçisi, realtime karşılaştırması
    // hepsi artık yeni şarkıyı esas alır (now_playing da onu gösteriyor)
    activeDeckRef.current = to;
    currentVideoRef.current = videoId;
    setDesiredPlaying(true);
    lastLoadAtRef.current = Date.now();
    markProgress(videoId);
    preloadedVideoRef.current = null;
    preloadedForRef.current = null;
    setVisibleDeck(to);
    setIdle(false);
    onTrackChange?.({ videoId, isPlaying: true });
    broadcastState({ video_id: videoId, is_playing: true, progress_ms: 0, duration_ms: null });

    // Eşit güç (sin/cos) rampa: iki şarkının toplam gücü sabit kalır. Doğrusal
    // rampada geçişin ortasında duyulur bir ses çukuru oluşuyor.
    const target = volumeRef.current ?? 100;
    const startedAt = Date.now();
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    fadeTimerRef.current = setInterval(() => {
      const x = Math.min((Date.now() - startedAt) / ms, 1);
      try {
        outgoing.setVolume(Math.round(target * Math.cos((x * Math.PI) / 2)));
      } catch {}
      try {
        incoming.setVolume(Math.round(target * Math.sin((x * Math.PI) / 2)));
      } catch {}
      if (x >= 1) {
        endCrossfade();
        ensurePlaying();
        sendHeartbeat();
      }
    }, FADE_STEP_MS);
  }, [
    api,
    endCrossfade,
    ensurePlaying,
    sendHeartbeat,
    onTrackChange,
    broadcastState,
    setDesiredPlaying,
    markProgress,
    fadeBusy,
    advanceBusy,
    setAdvancing,
  ]);

  // Çalma bekçisi: sıradakini erkenden tampona alır, geçiş vaktini kollar
  const playbackTick = useCallback(() => {
    if (
      fadeBusy() ||
      advanceBusy() ||
      blockedRef.current ||
      !desiredPlayingRef.current ||
      !currentVideoRef.current
    ) {
      return;
    }
    const player = activePlayer();
    if (!player || !activeReady()) return;

    let duration = 0;
    let position = 0;
    try {
      // Yalnızca gerçekten çalarken: takılmış/tamponlayan bir şarkı varken
      // sıradakini indirmek bant genişliğini onunla paylaşır
      if (player.getPlayerState() !== window.YT?.PlayerState.PLAYING) return;
      duration = player.getDuration();
      position = player.getCurrentTime();
    } catch {
      return;
    }

    // Önyükleme crossfade'den BAĞIMSIZDIR: geçiş kapalı olsa da sıradaki şarkı
    // boştaki deck'te hazır bekler — şarkı değişimi ağa bağımlı olmaktan çıkar
    if (position >= PRELOAD_AFTER_SEC) preloadNext();

    // Sıcak tamponu başa sar: sessiz deck şarkının sonuna varıp DURMAMALI,
    // yoksa geçişte onu yeniden başlatmak gerekir ve gizli pencerede tam olarak
    // bu yasak. İlk saniyelerde döndüğü için ek bant genişliği de harcamaz.
    keepWarmDeckLooping();

    const ms = crossfadeMsRef.current;
    if (ms <= 0 || !canCrossfadeRef.current || volumeIgnoredRef.current) return;
    // Süre bilinmiyorsa (canlı yayın, henüz meta gelmemiş) geçiş yapılamaz
    if (!Number.isFinite(duration) || duration <= 0) return;

    const fadeSec = ms / 1000;
    if (duration < MIN_SONG_FOR_FADE(fadeSec)) return;

    const remaining = duration - position;
    // Emniyet: erken önyükleme bir sebeple atlandıysa geçiş öncesi son şans
    if (remaining <= fadeSec + PRELOAD_LEAD_SEC) preloadNext();
    // Alt sınır: sekme kısılmışken bekçi geç uyanırsa şarkının son kırıntısında
    // geçiş başlatmanın anlamı yok, ENDED zaten devralır
    if (remaining <= fadeSec && remaining > 0.4) startCrossfade();
  }, [
    activePlayer,
    activeReady,
    preloadNext,
    startCrossfade,
    fadeBusy,
    advanceBusy,
    keepWarmDeckLooping,
  ]);

  // Bekçi: çalması gereken video başlamadıysa toparla.
  //
  // İki iş yapar. Biri: CUED/UNSTARTED/PAUSED'da takılan videoyu dürtmek (arka
  // plan sekmesinde ilk playVideo sessizce engellenebiliyor). Diğeri ve asıl
  // önemlisi: İLERLEME denetimi. "PLAYING" ya da "BUFFERING" görünmek çalmak
  // demek değildir — gizli sekmede yeni video çoğu zaman tam da bu durumlarda,
  // saniye hiç ilerlemeden asılı kalıyor ve eski bekçiler bunu sağlıklı sayıp
  // hiç dokunmuyordu; müzik ancak sekmeye dönülünce geri geliyordu.
  const nudgePlayback = useCallback(() => {
    const player = activePlayer();
    const YT = window.YT;
    const videoId = currentVideoRef.current;
    keepAliveAlive();
    if (!player || !YT || !videoId || !desiredPlayingRef.current) return;
    // Geçiş sırasında iki deck kasten farklı durumlarda — rampaya karışma
    // (asılı kalmış geçişi fadeBusy zaten kapatır)
    if (fadeBusy() || advanceBusy()) return;
    // Yükleme henüz oturmadı: bu turda ne dürtme ne takılma ölçümü yapılır.
    // Aksi halde iframe eski videoyu tutarken playVideo() diyor ve kesilen şarkı
    // yarım saniyeliğine geri geliyordu (bkz. LOAD_SETTLE_MS).
    if (Date.now() - lastLoadAtRef.current < LOAD_SETTLE_MS) {
      // Tur gerçekten döndü: ayraç tazelenmezse bir sonraki tur boşluğu "sekme
      // dondu" sanırdı
      lastTickAtRef.current = Date.now();
      return;
    }

    const now = Date.now();
    // İLK tur kıyaslanacak bir önceki tur yoktur: ayraç 0 olduğu için boşluk
    // epoch'tan beri geçen süre çıkıyor ve bekçi her açılışta "sekme donmuştu"
    // diye bağırıyordu — tam da güvenmemiz gereken sinyali kirletiyordu.
    const last = lastTickAtRef.current;
    const gap = last > 0 ? now - last : 0;
    lastTickAtRef.current = now;
    // Turlar arası uzun boşluk: sekme kısılmış/dondurulmuştu. Toparlama
    // adımları yine de çalışır (asıl ihtiyaç duyulan tur budur), ama TAKILMA
    // ölçümü sıfırlanır: donmada geçen süre bize ait değildir, onu "takıldı"
    // sayıp sağlam bir şarkıyı atlamayalım.
    const thawed = gap > TICK_THAW_MS;

    let state = -1;
    let position = 0;
    try {
      state = player.getPlayerState();
      position = player.getCurrentTime();
    } catch {
      // player henüz hazır değil — sonraki turda denenir
      return;
    }

    // Şarkı bitmiş ama ENDED olayı bize ulaşmamış olabilir (iframe mesajı
    // düşebiliyor): kuyruğu burada ilerlet, sessizlik uzamasın.
    if (state === YT.PlayerState.ENDED) {
      advance({ action: "next" });
      return;
    }

    if (
      state === YT.PlayerState.CUED ||
      state === -1 /* UNSTARTED */ ||
      state === YT.PlayerState.PAUSED
    ) {
      try {
        player.playVideo();
      } catch {}
    }

    if (thawed) {
      // ASIL KANIT: bekçi 3 sn'de bir dönmeli. Aradaki boşluk bu kadar açıldıysa
      // tarayıcı sayfayı kısmış ya da dondurmuştur — kesintinin sebebi ağ ya da
      // YouTube değil, sekmenin/pencerenin uyutulmasıdır.
      plog(`SEKME KISILDI/DONDU: bekçi ${Math.round(gap / 1000)} sn çalışmadı (${stateName(state)})`);
      markProgress(videoId, position > 0 ? position : -1);
      return;
    }

    // İlerleme çapası: konum gerçekten değiştiyse her şey yolunda
    const mark = progressMarkRef.current;
    if (mark.videoId !== videoId || (position > 0 && Math.abs(position - mark.time) > 0.35)) {
      markProgress(videoId, position);
      return;
    }

    // Buradan sonrası: video değişmedi ve konum ilerlemiyor.
    const stuck = now - mark.at;
    const playingState = state === YT.PlayerState.PLAYING;
    // PLAYING iken ilerlememek genelde reklamdır (ses var) — sabırlı davran.
    // Diğer durumlarda (BUFFERING/CUED/UNSTARTED/PAUSED) mekan sessizdir.
    // Hiç ilerlememiş (mark.time < 0) ve tamponlamayan video: ölü yükleme
    const deadLoad = mark.time < 0 && state !== YT.PlayerState.BUFFERING;
    const ladder = playingState
      ? { nudge: Number.POSITIVE_INFINITY, reload: STALL_PLAYING_RELOAD_MS, skip: STALL_PLAYING_SKIP_MS }
      : {
          nudge: STALL_NUDGE_MS,
          reload: deadLoad ? STALL_DEAD_RELOAD_MS : STALL_RELOAD_MS,
          skip: STALL_SKIP_MS,
        };
    if (stuck >= ladder.nudge && stallStepRef.current < 1) {
      plog(`TAKILDI ${stateName(state)} ${Math.round(stuck / 1000)} sn — konum ${position.toFixed(1)}`);
    }
    // GİZLİ PENCEREDE ATLAMA YOK. Tarayıcı, görünmeyen sayfada YENİ yüklenen
    // videoyu başlatmıyor: video TAMPON'da konum 0.0'da asılı kalıyor ve pencere
    // öne alındığı saniye çalmaya başlıyor. Merdiven bunu "bozuk şarkı" sanıp
    // 30 saniyede bir sıradakine geçiyordu; sıradaki de aynı sebeple çalmadığı
    // için mekan sessiz kalırken kuyruk teker teker eriyordu (6 dakikada 12
    // şarkı — hepsi müşterinin jetonuyla eklenmiş, hiçbiri çalmadan). Bu
    // durumda doğru davranış BEKLEMEK: aynı video denenmeye devam eder,
    // görünürlük gelince zaten anında başlar.
    const hiddenNeverStarted =
      typeof document !== "undefined" &&
      document.visibilityState === "hidden" &&
      mark.time < 0 &&
      position <= 0;
    if (hiddenNeverStarted && stuck >= ladder.skip && stallStepRef.current < 3) {
      // Kayda tek satır düşer (her turda değil): sebebi sonradan okuyabilelim
      if (!skipDeferredRef.current) {
        skipDeferredRef.current = true;
        // Taşıyıcı tonun durumu da yazılır: varsayımımız "sayfa sessizleşince
        // tarayıcı medyayı askıya alıyor". ctx suspended görünüyorsa varsayım
        // doğrulanır, running görünüyorsa sebep başkadır ve orayı kazarız.
        const ctxState = keepAliveRef.current?.ctx.state ?? "yok";
        plog(
          `atlama ERTELENDİ: pencere arkada, video hiç başlamadı — görünürlük beklenecek (${Math.round(stuck / 1000)} sn, taşıyıcı ton: ${ctxState})`
        );
        setBackgroundBlocked(true);
      }
      // Bekleme boş geçmesin: aynı videoyu dürtmeye devam et
      try {
        player.playVideo();
      } catch {}
      return;
    }
    if (stuck >= ladder.skip && stallStepRef.current < 3) {
      // Yeniden yükleme de tutmadı. Sessiz kalmaktansa sıradakine geçiyoruz —
      // ama "error" YOLLAMIYORUZ: o, şarkıyı katalogda kalıcı olarak
      // çalınamaz işaretler. Takılmanın sebebi büyük ihtimalle geçici (ağ,
      // arka plan kısıntısı); sağlam bir şarkıyı ömürlük cezalandırmayalım.
      stallStepRef.current = 3;
      plog(`kurtarma 3/3: pes edildi, sıradakine geçiliyor (${Math.round(stuck / 1000)} sn takılı)`);
      advance({ action: "next" });
      return;
    }
    if (stuck >= ladder.reload && stallStepRef.current < 2) {
      // Dürtmek yetmedi: videoyu AKTİF deck'e yeniden yükle. Gizli sekmede
      // cue'lanan tampon deck hiç veri indirmemiş olabiliyor; loadVideoById
      // yüklemeyi ve oynatmayı birlikte zorlar.
      stallStepRef.current = 2;
      plog(`kurtarma 2/3: video yeniden yükleniyor (${Math.round(stuck / 1000)} sn takılı)`);
      try {
        // Şarkının ORTASINDA takıldıysak (ağ dalgalanması) kaldığımız yerden
        // devam ederiz — baştan sarmak mekanda aynı şarkıyı iki kez çalardı
        const resumeAt = mark.time > 1 ? mark.time : 0;
        player.loadVideoById(resumeAt > 0 ? { videoId, startSeconds: resumeAt } : videoId);
        forceLowQuality(player);
      } catch {}
      // Çapayı BİLEREK sıfırlamıyoruz: merdiven işlemezse bir üst basamağa
      // (atlama) çıkabilmeli. Gerçekten çalmaya başlarsa ilerleme onu sıfırlar.
      lastLoadAtRef.current = now;
      return;
    }
    if (stuck >= ladder.nudge && stallStepRef.current < 1) {
      stallStepRef.current = 1;
      try {
        player.playVideo();
      } catch {}
    }
  }, [activePlayer, advance, fadeBusy, advanceBusy, markProgress, keepAliveAlive]);

  // Emniyet ağı: Realtime kanalı arka plan sekmesinde sessizce kopabilir ve
  // panelden gelen next/play komutları kaçar — now_playing ile mutabakat kur
  // Çevrimdışıyken kendi kararımızla çaldığımız şarkıyı sunucuyla eşitle.
  // Kuyruk o sırada ilerlemediği için now_playing hâlâ ÖNCEKİ şarkıyı gösterir;
  // düz mutabakat bizi geri sardırırdı. "Bir ileri sar" da olmaz: kesinti
  // sırasında müşteri öncelikli şarkı eklediyse sunucu onu döndürür ve çalan
  // şarkıyı ortasından kesmek gerekirdi. Bunun yerine sunucuya gerçeği
  // söylüyoruz — kuyruk bize hizalanıyor, ses hiç kesilmiyor.
  const syncOfflineFallback = useCallback(async () => {
    const videoId = currentVideoRef.current;
    if (!videoId) {
      offlineFallbackRef.current = false;
      return;
    }
    let progress = 0;
    try {
      progress = Math.floor((activePlayer()?.getCurrentTime() ?? 0) * 1000);
    } catch {}
    setAdvancing(true);
    let result: PlayerApiResult | null = null;
    try {
      result = await api({ action: "sync", video_id: videoId, progress_ms: progress });
    } finally {
      setAdvancing(false);
    }
    // Hâlâ ulaşılamıyor: çalmaya devam, sonraki turda yeniden denenir
    if (!result) return;
    offlineFallbackRef.current = false;
    // Şarkı katalogda bulunamadı (olmaması gereken durum): now_playing bize
    // hizalanamadı, kuyruğu ileri sarıp tutarlı duruma dön
    if (result.ok === false) {
      advance({ action: "next" });
      return;
    }
    // Panel ve müşteri ekranı doğru şarkıyı beklemeden görsün
    sendHeartbeat();
  }, [api, activePlayer, sendHeartbeat, advance, setAdvancing]);

  const reconcile = useCallback(async () => {
    if (advanceBusy() || fadeBusy()) return;
    if (offlineFallbackRef.current) {
      await syncOfflineFallback();
      return;
    }
    const np = await readNowPlaying(supabase, venueDbId);
    if (!np || advanceBusy() || fadeBusy()) return;
    // Realtime kopmuşken değişen ses seviyesi/geçiş süresi de burada yakalanır
    if (np.volume !== volumeRef.current) applyVolume(np.volume);
    applyCrossfade(np.crossfade_ms);
    if (np.video_id && np.video_id !== currentVideoRef.current) {
      loadVideo(np.video_id);
      return;
    }
    // Az önce yerelde alınmış bir karar varsa (kullanıcı videoya tıkladı, panel
    // komut yolladı) satır henüz eskidir: okuma yola çıktığında yazımımız daha
    // ulaşmamıştı. Çalma durumunu ezmeyiz — bir sonraki turda zaten uzlaşırız.
    if (!dbStateIsFresh()) return;
    if (np.video_id && np.is_playing) {
      if (!desiredPlayingRef.current) setDesiredPlaying(true);
      nudgePlayback();
      return;
    }
    // Sunucuda "duraklatıldı" yazıyorsa bu ancak açık bir komuttan gelir (player
    // artık dış kaynaklı duraklatmayı DB'ye yazmıyor). Realtime kaçırmış olsa
    // bile panelin duraklat komutu burada uygulanır.
    if (
      np.video_id &&
      !np.is_playing &&
      desiredPlayingRef.current &&
      Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS
    ) {
      explicitPauseAtRef.current = Date.now();
      setDesiredPlaying(false);
      try {
        activePlayer()?.pauseVideo();
      } catch {}
    }
  }, [
    supabase,
    venueDbId,
    loadVideo,
    nudgePlayback,
    applyVolume,
    applyCrossfade,
    activePlayer,
    syncOfflineFallback,
    dbStateIsFresh,
    setDesiredPlaying,
    advanceBusy,
    fadeBusy,
  ]);

  // Arka plandan / bfcache'ten dönüşte kaldığı yerden sürdür: sağlık sinyali ve
  // sahiplik tazelenir, açıkça duraklatılmadıysa çalma devam eder.
  const restorePlayback = useCallback(() => {
    if (blockedRef.current === "claim") return;
    // Taşıyıcı ton askıya alınmış olabilir (ses odağı başka uygulamaya geçti)
    keepAliveAlive();
    // Tam bekçi: dürtmenin yanında ilerleme denetimini de yapar. İlk tur "sekme
    // donmuştu" sayılıp ölçümü sıfırlar, sonraki turlar gerçek durumu görür.
    if (desiredPlayingRef.current) {
      ensurePlaying();
      nudgePlayback();
    }
    sendHeartbeat();
    reconcile();
  }, [ensurePlaying, nudgePlayback, sendHeartbeat, reconcile, keepAliveAlive]);

  // Aşağıdaki sahiplik effect'inin bağımlılıkları sabit kalmalı (temizliği release
  // planlıyor), bu yüzden güncel sürüm ref üzerinden okunur
  // scheduleNudges yükleme sonrası denemeleri bu ref üzerinden çalıştırır
  useEffect(() => {
    nudgeRef.current = nudgePlayback;
  }, [nudgePlayback]);

  const restoreRef = useRef(restorePlayback);
  useEffect(() => {
    restoreRef.current = restorePlayback;
  }, [restorePlayback]);

  // Sunucuyla eşitlenip kaldığı yerden devam et. Eskiden onReady'nin içindeydi;
  // ısınma aşamasında (sahiplik henüz alınmamışken) çalışmaması gerektiği için
  // ayrıldı — "Başlat" dokunuşu sahipliği aldıktan sonra buradan çağrılır.
  const resumeFromServer = useCallback(
    async (alreadyPlaying: boolean) => {
      const np = await readNowPlaying(supabase, venueDbId);
      // Mekanın en son ayarladığı ses seviyesiyle aç — yeniden başlatmada sıfırlanmaz
      applyVolume(np?.volume);
      applyCrossfade(np?.crossfade_ms);
      if (np?.video_id) {
        // Isınmada cue'lanan video zaten buysa ve dokunuşla çalmaya başladıysa
        // TEKRAR YÜKLEME: loadVideoById iOS'ta yeni bir izin turu ister, yani
        // az önce açtığımız kilidi kendi elimizle kapatırdık.
        if (alreadyPlaying && np.video_id === currentVideoRef.current) {
          onTrackChange?.({ videoId: np.video_id, isPlaying: true });
          broadcastState({
            video_id: np.video_id,
            is_playing: true,
            progress_ms: 0,
            duration_ms: null,
          });
          sendHeartbeat();
          scheduleNudges(PLAY_WATCHDOG_DELAYS_MS);
          return;
        }
        loadVideo(np.video_id);
      } else {
        advance({ action: "next" });
      }
    },
    [
      supabase,
      venueDbId,
      applyVolume,
      applyCrossfade,
      loadVideo,
      advance,
      onTrackChange,
      broadcastState,
      sendHeartbeat,
      scheduleNudges,
    ]
  );

  // iOS Safari kilidini açan TEK hamle: ısıtılmış deck'te, dokunuşun içinde,
  // arada hiç await olmadan playVideo(). Bir kez böyle başlayan iframe'e sonradan
  // gelen programatik komutlar (loadVideoById, playVideo) artık engellenmez.
  const unlockPlayback = useCallback(() => {
    const videoId = prewarmCuedRef.current;
    const key = activeDeckRef.current;
    const player = decksRef.current[key];
    if (!videoId || !player || !deckReadyRef.current[key]) return false;
    try {
      player.playVideo();
    } catch {
      return false;
    }
    // İKİNCİ DECK DE AYNI DOKUNUŞLA UYANDIRILIR. Sebep kayıtla doğrulandı:
    // hayatında hiç çalmamış bir deck, pencere arkadayken ilk kez BAŞLAYAMIYOR —
    // TAMPON'da konum 0.0'da asılı kalıyor. Pencere şarkı başladıktan bir saniye
    // sonra arkaya düştüğünde ikinci deck bakir kalıyor, sıradaki şarkı hiç
    // hazırlanamıyor ve geçişte mekan susuyordu. Bir kez çalmış deck'e sonradan
    // gelen komutlar (cue + play) arka planda da kabul ediliyor: çalışan
    // oturumlarda tampon hep böyle kurulmuştu. Ses çıkmaz — sessiz ve 0 sesle.
    // Mobilde YAPILMAZ: orada ikinci medya öğesi çalanı durdurur.
    if (canCrossfadeRef.current) {
      const idleKey = otherDeck(key);
      const idle = decksRef.current[idleKey];
      if (idle && deckReadyRef.current[idleKey]) {
        try {
          idle.setVolume(0);
          idle.mute?.();
          idle.cueVideoById(videoId);
          forceLowQuality(idle);
          idle.playVideo();
          // preloadNext birazdan gerçek sıradaki şarkıyı buraya cue'layacak;
          // o ana kadar deck sessizce çalar durumda tutulur (uyanık kalsın)
          warmDeckRef.current = { deck: idleKey, videoId };
          warmPlayingRef.current = false;
          warmSinceRef.current = Date.now();
          plog(`ikinci deck de dokunuşla uyandırıldı → deck ${idleKey}`);
        } catch {}
      }
    }
    // loadVideo'nun yaptığı defter tutma, yükleme adımı olmadan: video zaten
    // deck'te duruyor. Bunlar olmadan heartbeat ve panel yanlış şarkı görürdü.
    currentVideoRef.current = videoId;
    setDesiredPlaying(true);
    lastLoadAtRef.current = Date.now();
    markProgress(videoId);
    setIdle(false);
    plog(`dokunuşla kilit açıldı → ${videoId}`);
    return true;
  }, [setDesiredPlaying, markProgress]);

  // Kilidi açtık ama sahiplik başka cihazdaymış: derhal sus. Aksi halde ikinci
  // ekran claim yanıtı dönene kadar mekanda ses çıkarırdı.
  const abortUnlock = useCallback(() => {
    desiredPlayingRef.current = false;
    currentVideoRef.current = null;
    warmDeckRef.current = null;
    warmPlayingRef.current = false;
    warmSinceRef.current = 0;
    try {
      decksRef.current.a?.pauseVideo();
      decksRef.current.b?.pauseVideo();
    } catch {}
  }, []);

  // Bir deck kur. İki deck de aynı olay kancalarını paylaşır; olayların çoğu
  // yalnızca AKTİF deck için anlamlıdır (boştaki deck'in ENDED'i kuyruğu
  // ilerletmemeli, tamponlanan videonun CUED'i çalmayı başlatmamalı).
  const createDeck = useCallback(
    (key: DeckKey, host: HTMLDivElement): YTPlayer => {
      const el = document.createElement("div");
      host.replaceChildren(el);
      deckReadyRef.current[key] = false;

      return new window.YT!.Player(el, {
        // controls: 0 — YouTube'un kendi kontrolleri iframe'in İÇİNDE ve iframe'in
        // 256 px'lik boyutuna göre çiziliyor; sahneyi doldurmak için ~8 kat
        // büyüttüğümüzde düğmeler de o kadar büyüyordu ve dışarıdan ters
        // ölçeklenemiyorlar. Mekan zaten paneldeki kendi kontrollerini kullanıyor.
        // Videoya tıklayarak duraklatma çalışmaya devam eder — isExplicitPause()
        // bunu iframe odağından anlar, kontrollere bağlı değildir.
        playerVars: { playsinline: 1, rel: 0, autoplay: 0, controls: 0 },
        events: {
          onReady: async () => {
            deckReadyRef.current[key] = true;
            forceLowQuality(decksRef.current[key]);
            if (key !== activeDeckRef.current) {
              // Boştaki deck sessiz bekler: tamponlanan video kazara çalarsa
              // mekanda duyulmasın
              try {
                decksRef.current[key]?.setVolume(0);
                decksRef.current[key]?.mute?.();
              } catch {}
              return;
            }
            // ISINMA: "Başlat"a daha basılmadı. Sahiplik alınmadığı için hiçbir
            // şey ÇALMAZ; yalnızca çalacak video cue'lanır (cue yükler, oynatmaz).
            // Dokunuş anında iframe hazır ve video yüklü olsun ki geriye tek
            // senkron playVideo() kalsın — iOS'un istediği tam olarak budur.
            if (!startedRef.current) {
              const np = await readNowPlaying(supabase, venueDbId);
              applyVolume(np?.volume);
              applyCrossfade(np?.crossfade_ms);
              // now_playing boşsa (ilk açılış) kuyruğun başına bakılır. peek
              // kuyruğu TÜKETMEZ ve sahiplik istemez — ısınmada güvenlidir.
              const cue = np?.video_id ?? (await api({ action: "peek" }))?.video_id ?? null;
              // Bu arada "Başlat"a basıldıysa akış artık start()'ın elinde
              if (!cue || startedRef.current) return;
              try {
                decksRef.current[key]?.cueVideoById(cue);
                forceLowQuality(decksRef.current[key]);
                prewarmCuedRef.current = cue;
                plog(`ısınma: ${cue} cue'landı (sessiz, sahiplik yok)`);
              } catch {}
              return;
            }
            // Player hazır olmadan gelen ses komutu biriktiyse şimdi uygula
            pushVolume();
            // Hazır olmadan gelen komut biriktiyse önce onu çal
            const pending = pendingVideoRef.current;
            if (pending) {
              loadVideo(pending);
              return;
            }
            // Kaldığı yerden devam: now_playing'de video varsa onu, yoksa sıradakini çal
            resumeFromServer(false);
          },
          onStateChange: (e) => {
            const YT = window.YT!;
            plog(`deck ${key}${key === activeDeckRef.current ? "*" : ""}: ${stateName(e.data)}`);
            // Isınma aşamasının olayları çalma akışını yönetmez: cue'lanan video
            // CUED verir, aşağıdaki dal onu çalmaya kalkardı — sahiplik daha
            // alınmadan ses çıkması demek olurdu.
            if (!startedRef.current) return;
            // Boştaki deck'in olayları çalma akışını yönetmez. Geçiş sırasında
            // çıkan şarkı burada biter (ENDED) — kuyruğu ikinci kez ilerletmemeli.
            if (key !== activeDeckRef.current) {
              // Tek istisna: sıcak tamponun gerçekten ÇALMAYA başlayıp
              // başlamadığı, gizli pencere çözümünün işleyip işlemediğinin tek
              // kanıtıdır — kayda tek satır düşürülür.
              const warm = warmDeckRef.current;
              if (warm?.deck === key && e.data === YT.PlayerState.PLAYING) {
                // Tampon ancak BURADA hazır sayılır — geçişte yapılacak iş artık
                // "sesi aç"tır, gizli pencerede yasak olan "videoyu başlat" değil
                warmPlayingRef.current = true;
                plog(
                  `sıcak tampon HAZIR (sessiz çalıyor, pencere ${
                    typeof document !== "undefined" ? document.visibilityState : "?"
                  })`
                );
              }
              return;
            }
            if (e.data === YT.PlayerState.ENDED) {
              advance({ action: "next" });
            } else if (e.data === YT.PlayerState.PLAYING) {
              // Kullanıcı videonun kendi oynat düğmesine bastıysa niyet BURADA
              // doğar; damga da düşer ki yoldaki "duraklatıldı" yankısı bunu
              // saniyesinde geri almasın (mekan "başlatamıyorum" diyordu).
              setDesiredPlaying(true);
              // Takılma bekçisinin çapası tazelenir: video gerçekten başladı
              markProgress(currentVideoRef.current);
              // Şarkı çaldı: geçici hata sicili temizlenir, bir sonraki aksilik
              // yeniden baştan üç hak alsın
              if (currentVideoRef.current) {
                transientErrorsRef.current.delete(currentVideoRef.current);
              }
              // Müzik akıyor: arka plan uyarısı varsa kalkar
              setBackgroundBlocked(false);
              // Yeni video/aygıt değişiminde player varsayılan sese dönebilir
              // (geçiş sırasında pushVolume kendini devre dışı bırakır)
              pushVolume();
              onTrackChange?.({ videoId: currentVideoRef.current, isPlaying: true });
              sendHeartbeat();
            } else if (e.data === YT.PlayerState.PAUSED) {
              // ÖNCE: bu duraklatma yüklemenin kendisi mi? loadVideoById çalan
              // videoyu söküp yenisini getirirken YouTube arada PAUSED yayınlar —
              // ve bu olay ESKİ videoya aittir. Aşağıdaki "dış kaynaklı" dalı onu
              // toparlanacak bir aksilik sanıp playVideo() diyordu: yeni video
              // henüz hazır olmadığı için eski şarkı bir saniyeliğine geri gelip
              // çalıyor, sonra yeni şarkı onu kesiyordu (panelden "şimdi çal" ve
              // atlama tuşunda duyulan çift kesinti). Yükleme gerçekten başarısız
              // olduysa zaten PLAY_WATCHDOG_DELAYS_MS bekçisi devrede.
              if (Date.now() - lastLoadAtRef.current < LOAD_PAUSE_IGNORE_MS) {
                plog("duraklatma YÜKLEME geçişinin kendisi — yok sayıldı");
                return;
              }
              // Duraklatmanın kaynağı belirleyicidir. Panel komutu ya da videoya
              // yapılan tıklama ise niyet söner ve müzik durur. Aksi halde bu
              // duraklatma DIŞ KAYNAKLIDIR (YouTube'un atalet duraklatması,
              // reklam/ara geçiş, ağ kopması, medya tuşu, ses odağının başka
              // uygulamaya geçmesi) — niyete dokunulmaz ve çalma geri açılır.
              // Eskiden burada niyet körlemesine söndürülüyordu ve hiçbir bekçi
              // devreye giremediği için müzik elle play'e basılana dek susuyordu.
              if (isExplicitPause()) {
                plog("duraklatma AÇIK komut sayıldı — müzik duruyor");
                setDesiredPlaying(false);
                endCrossfade();
                onTrackChange?.({ videoId: currentVideoRef.current, isPlaying: false });
                sendHeartbeat();
              } else {
                plog("duraklatma DIŞ KAYNAKLI — geri açılıyor");
                try {
                  decksRef.current[key]?.playVideo();
                } catch {}
                scheduleNudges(RESUME_RETRY_DELAYS_MS);
              }
            } else if (e.data === YT.PlayerState.CUED) {
              decksRef.current[key]?.playVideo();
            }
          },
          // Video değişiminde YouTube kaliteyi kendi kararıyla yükseltebilir —
          // her seferinde en düşüğe geri çek
          onPlaybackQualityChange: (e) => {
            if (e.data === FORCE_QUALITY) return;
            forceLowQuality(decksRef.current[key]);
          },
          onError: (e) => {
            // KALICI mı GEÇİCİ mi? Damga yalnızca kalıcı kodlarda vurulur
            // (bkz. FATAL_YT_ERROR_CODES) — kalıcı damga şarkıyı kataloglardan
            // da siliyor, geçici bir aksilik bunu hak etmez.
            const code = typeof e.data === "number" ? e.data : -1;
            const fatal = FATAL_YT_ERROR_CODES.has(code);
            plog(`deck ${key}: YOUTUBE HATASI ${code}${fatal ? "" : " (geçici)"}`);
            if (key !== activeDeckRef.current) {
              // BOŞTAKİ deck: çalan şarkı kesilmez, ama şarkı SUNUCUDA da
              // işaretlenmeli. Eskiden yalnızca tampon düşürülüyordu; peek 10 sn
              // sonra AYNI videoyu döndürdüğü için önyükleme sonsuz hata
              // döngüsüne giriyor, çapraz geçiş ve çevrimdışı yedek fiilen
              // devre dışı kalıyordu (mekan kaydında 10 sn'de bir HATA 150).
              const failed = preloadedVideoRef.current ?? prewarmCuedRef.current;
              preloadedVideoRef.current = null;
              preloadedForRef.current = null;
              if (!failed) return;
              if (!fatal) {
                // Geçici: sunucuya HABER GİTMEZ. Tampon düşer, biraz sonra aynı
                // video yeniden denenir; ısrarla düşerse sonsuz döngüye girmesin
                // diye bu oturumluk atlanır.
                const seen = (transientErrorsRef.current.get(failed) ?? 0) + 1;
                transientErrorsRef.current.set(failed, seen);
                if (seen >= TRANSIENT_ERROR_LIMIT) {
                  unplayableRef.current.add(failed);
                  plog(`önyükleme ${seen} kez geçici hata verdi — bu oturumda atlanıyor (${failed})`);
                }
                preloadRetryAtRef.current = Date.now() + PRELOAD_RETRY_MS;
                return;
              }
              unplayableRef.current.add(failed);
              plog(`önyükleme videosu çalınamıyor — işaretleniyor (${failed})`);
              void api({ action: "unplayable", video_id: failed, code }).finally(() => {
                // İşaretleme yolda: sıradaki peek artık bu videoyu atlayacak,
                // 10 sn'lik cezayı beklemeden hemen yeniden dene
                preloadRetryAtRef.current = 0;
              });
              return;
            }
            endCrossfade();
            const failed = currentVideoRef.current;
            if (!failed) {
              advance({ action: "next" });
              return;
            }
            if (fatal) {
              advance({ action: "error", video_id: failed, code });
              return;
            }
            // ÇALAN deck'te geçici hata: mekan sessiz kaldığı için beklemeye yer
            // yok ama şarkıyı da damgalamıyoruz. Önce aynı videoyu bir kez
            // yeniden yükle (hata iframe'in o anki halindense bu yeter), ısrar
            // ederse damgasız biçimde sıradakine geç.
            const seen = (transientErrorsRef.current.get(failed) ?? 0) + 1;
            transientErrorsRef.current.set(failed, seen);
            if (seen < TRANSIENT_ERROR_LIMIT) {
              plog(`çalan şarkı geçici hata verdi (${seen}. kez) — yeniden yükleniyor`);
              loadVideo(failed);
              return;
            }
            plog(`çalan şarkı ${seen} kez geçici hata verdi — damgasız atlanıyor`);
            advance({ action: "next" });
          },
        },
      });
    },
    [
      advance,
      loadVideo,
      sendHeartbeat,
      onTrackChange,
      supabase,
      venueDbId,
      api,
      resumeFromServer,
      applyVolume,
      applyCrossfade,
      pushVolume,
      endCrossfade,
      isExplicitPause,
      scheduleNudges,
      setDesiredPlaying,
      markProgress,
    ]
  );

  // "Başlat" — tarayıcı autoplay politikası gereği ilk oynatma kullanıcı dokunuşuyla.
  //
  // SIRA KRİTİKTİR. Eskiden önce sahiplik alınıp sonra deck'ler kuruluyordu; asıl
  // playVideo() ise iki ağ turu sonra, onReady zincirinde düşüyordu. Masaüstünde
  // sorun çıkmıyordu (Media Engagement Index sesli otomatik oynatmaya zaten izin
  // verir) ama iOS Safari'de dokunuş izni ilk await'te tükendiği için oynatma her
  // seferinde reddediliyor, iframe poster + kırmızı düğme halinde kalıyordu.
  // Artık ısıtılmış deck ilk iş olarak, await'lerden ÖNCE başlatılır; sahiplik
  // hemen ardından sorulur ve başkasındaysa ses derhal kesilir.
  const start = useCallback(
    async (force = false) => {
      setError("");
      // Sekmeyi uyanık tutan taşıyıcı ton bu dokunuşla kurulur (bkz.
      // KEEPALIVE_HZ): AudioContext ancak kullanıcı etkileşimiyle çalışabilir.
      startKeepAlive();
      // Olay kancaları bu andan itibaren gerçek çalma akışını yönetsin: aşağıdaki
      // playVideo'nun PLAYING olayı claim yanıtından önce dönebilir.
      startedRef.current = true;
      const unlocked = unlockPlayback();

      const claim = await api({ action: "claim", force });
      if (blockedRef.current === "auth") {
        if (unlocked) abortUnlock();
        startedRef.current = false;
        return;
      }
      if (claim?.taken) {
        if (unlocked) abortUnlock();
        startedRef.current = false;
        setClaimTaken(true);
        return;
      }
      setClaimTaken(false);

      await loadIframeApi();
      const hostA = deckAHostRef.current;
      const hostB = deckBHostRef.current;
      if (!hostA || !hostB || !window.YT) {
        startedRef.current = false;
        setError("YouTube player yüklenemedi — sayfayı yenileyin");
        return;
      }

      canCrossfadeRef.current = deviceSupportsVolume();
      // Isınmada kurulmuş deck'ler KORUNUR: yeniden yaratmak, dokunuşla az önce
      // açılan oynatma iznini çöpe atar ve ilk şarkı yine başlamaz. Isınma
      // yetişmediyse (script geç geldi, ilk render kaçtı) eski yol aynen işler.
      if (!decksRef.current.a || !decksRef.current.b) {
        activeDeckRef.current = "a";
        setVisibleDeck("a");
        pendingVideoRef.current = null;
        // İki deck de kullanıcı dokunuşunun hemen ardından kurulur: ikincisinin de
        // autoplay izni bu etkileşimden gelir, geçiş anında sessizce engellenmesin
        decksRef.current.a = createDeck("a", hostA);
        decksRef.current.b = createDeck("b", hostB);
      } else if (deckReadyRef.current[activeDeckRef.current]) {
        // Isınma yolundan geldik: onReady'nin "kaldığı yerden devam" adımı o
        // sırada atlanmıştı (sahiplik yoktu), eşitlemeyi şimdi yap.
        resumeFromServer(unlocked);
      }

      setStarted(true);
    },
    [api, createDeck, startKeepAlive, unlockPlayback, abortUnlock, resumeFromServer]
  );

  // Panel içindeki oynatıcının (compact) ilk dokunuşu artık alt bardaki normal
  // oynat düğmesinden gelir: kutunun üstünde ayrı bir "Başlat" düğmesi yok.
  // Başlatıcı senkron çağrılır — dokunuş izni ilk await'te tükeniyor (bkz. start).
  useEffect(() => {
    if (!compact) return;
    if (started || blocked || claimTaken) return;
    const fn = () => {
      void start();
    };
    setPlayerStarter(fn);
    return () => clearPlayerStarter(fn);
  }, [compact, started, blocked, claimTaken, start]);

  // --- Isınma: "Başlat" beklenmeden deck'leri kur, sıradaki videoyu cue'la ---
  // iOS Safari programatik playVideo()'yu ancak daha önce bir kullanıcı dokunuşu
  // oynatmayı başlatmışsa kabul eder — ve dokunuş anında iframe'in HAZIR, videonun
  // YÜKLÜ olması gerekir. Burada ses çıkmaz ve sahiplik alınmaz: cue yalnızca
  // yükler, onStateChange de ısınma boyunca devre dışıdır.
  useEffect(() => {
    if (prewarmDoneRef.current) return;
    prewarmDoneRef.current = true;
    void (async () => {
      // Sahiplik başka cihazdaysa "Başlat" hiç gösterilmesin. Artık oynatma
      // dokunuşun içinde başlıyor (sahiplik yanıtı sonra geliyor); bu önden
      // yoklama olmadan ikinci ekran yanıt dönene dek kısa bir ses çıkarırdı.
      // probe kilidi ALMAZ, yalnızca sorar.
      const probe = await api({ action: "claim", probe: true });
      if (probe?.taken === true) setClaimTaken(true);

      await loadIframeApi();
      // Bu arada "Başlat"a basıldıysa deck'leri start() kuruyor — karışma
      if (startedRef.current || decksRef.current.a) return;
      const hostA = deckAHostRef.current;
      const hostB = deckBHostRef.current;
      if (!hostA || !hostB || !window.YT) return;
      canCrossfadeRef.current = deviceSupportsVolume();
      activeDeckRef.current = "a";
      decksRef.current.a = createDeck("a", hostA);
      decksRef.current.b = createDeck("b", hostB);
    })();
  }, [createDeck, api]);

  // Sahiplik başka cihaza geçtiyse bu sekme derhal susar — çift ses olmasın
  useEffect(() => {
    if (blocked !== "claim") return;
    desiredPlayingRef.current = false;
    endCrossfade();
    try {
      decksRef.current.a?.pauseVideo();
      decksRef.current.b?.pauseVideo();
    } catch {}
  }, [blocked, endCrossfade]);

  // Oturum düştüyse heartbeat yollamaya devam et: yeniden giriş yapılınca
  // (ör. başka sekmede) ilk başarılı istek engeli kaldırır ve çalma sürer.
  useEffect(() => {
    if (!started || blocked === "claim") return;
    // Çevrimdışı yedekteysek her turda önce eşitlemeyi deneriz: bağlantı
    // döndüğü anda (en geç 5 sn) panel ve müşteri ekranı doğru şarkıyı görür
    const beat = () => {
      if (offlineFallbackRef.current) {
        syncOfflineFallback();
        return;
      }
      sendHeartbeat();
    };
    // İlk sinyal beklemeden gitsin: müşteri tarafı player açılır açılmaz "açık" görsün
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [started, blocked, sendHeartbeat, syncOfflineFallback]);

  // Hızlı durum hattı: yalnızca broadcast, veritabanına yazmaz. Heartbeat 5 sn'de
  // bir olduğu için alt bar iki sinyal arasında kendi saatiyle ilerliyor ve
  // tamponlama/atlama sonrası sesin önüne geçebiliyordu; saniyelik sinyal panelin
  // çapasını sürekli gerçek konuma çekiyor.
  useEffect(() => {
    if (!started || blocked) return;
    const interval = setInterval(() => broadcastState(), STATE_BEAT_MS);
    return () => clearInterval(interval);
  }, [started, blocked, broadcastState]);

  // Bekçi: idle'da takılı kalma (kuyruk-boş yarışı, ağ hatası vb.) — periyodik
  // olarak sıradakini iste; sunucu tarafı dolum yaptığı için çalma kendi toparlanır
  useEffect(() => {
    if (!started || !idle || blocked) return;
    const interval = setInterval(() => advance({ action: "next" }), IDLE_RETRY_MS);
    return () => clearInterval(interval);
  }, [started, idle, blocked, advance]);

  // Takılan oynatmayı periyodik dürt; sekme öne gelir gelmez de tam mutabakat —
  // arka planda engellenen autoplay görünürlükte ilk denemede tutar
  useEffect(() => {
    // Yalnızca sahiplik kaybında susarız (çift ses olmasın). Oturum düşmesi gibi
    // geçici engellerde bekçi çalışmaya devam eder: çalan şarkı kesilmesin.
    if (!started || blocked === "claim") return;
    const beat = () => {
      nudgePlayback();
      enforceVolume();
    };
    // İki kaynaktan da darbe alırız: worker (kısıntıya dayanıklı, asıl yol) ve
    // klasik setInterval (worker kurulamayan tarayıcılar için yedek). İkisi aynı
    // anda çalışsa bile bekçi kendi içinde tekrara dayanıklıdır.
    const ticker = createTicker(beat);
    const nudgeInterval = setInterval(beat, ticker ? PLAY_NUDGE_MS * 2 : PLAY_NUDGE_MS);
    const reconcileInterval = setInterval(reconcile, RECONCILE_MS);
    // Sekme öne gelince yalnızca mutabakat değil, çalmayı sürdürme de yapılır:
    // arka planda engellenen/durdurulan oynatma ilk anda toparlanır
    const onVisibility = () => {
      plog(`görünürlük: ${document.visibilityState}`);
      if (document.visibilityState === "visible") restoreRef.current();
    };
    // Chrome sayfayı gerçekten DONDURDUYSA (Page Lifecycle) bu olay düşer:
    // pencere uygulama olarak kurulduğunda ve arkada kaldığında görülür.
    const onFreeze = () => plog("SAYFA DONDURULDU (freeze)");
    // Odak video iframe'ine geçtiyse kullanıcı videonun üstüne tıklamış demektir;
    // hemen ardından gelen duraklatma GERÇEK duraklatmadır, geri açılmaz
    const onBlur = () => {
      if (iframeFocused()) blurToIframeAtRef.current = Date.now();
    };
    // Sekme her şeye rağmen dondurulduysa (Page Lifecycle) çözülme anında da
    // toparla: görünürlük değişmeden çözülen sekmelerde tek sinyal budur
    const onResume = () => {
      plog("SAYFA ÇÖZÜLDÜ (resume)");
      restoreRef.current();
    };
    // Mekanın internetinin gidip gelmesi de kesinti sebebi olabilir — ayırt
    // edebilmek için kaydedilir
    const onOffline = () => plog("AĞ KOPTU (offline)");
    const onOnline = () => plog("ağ geri geldi (online)");
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("resume", onResume);
    document.addEventListener("freeze", onFreeze);
    window.addEventListener("blur", onBlur);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      ticker?.stop();
      clearInterval(nudgeInterval);
      clearInterval(reconcileInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("resume", onResume);
      document.removeEventListener("freeze", onFreeze);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [started, blocked, nudgePlayback, reconcile, enforceVolume, iframeFocused]);

  // Çalma bekçisi: sıradakini önyükler, geçiş vaktini kollar
  useEffect(() => {
    if (!started || blocked) return;
    const interval = setInterval(playbackTick, CROSSFADE_TICK_MS);
    return () => clearInterval(interval);
  }, [started, blocked, playbackTick]);

  // Teşhis panelinin canlı satırı: player'ın o anki gerçek durumu
  useEffect(() => {
    if (!debugOn) return;
    const tick = () => {
      const player = activePlayer();
      let state = "-";
      let pos = "-";
      try {
        if (player) {
          state = stateName(player.getPlayerState());
          pos = player.getCurrentTime().toFixed(0);
        }
      } catch {}
      setLive(
        `deck ${activeDeckRef.current} · ${state} · ${pos}sn · niyet:${
          desiredPlayingRef.current ? "çal" : "dur"
        } · tampon:${preloadedVideoRef.current ?? "-"}${fadingRef.current ? " · GEÇİŞ" : ""}${
          advancingRef.current ? " · İLERLETİYOR" : ""
        } · ses:${volumeRef.current ?? "-"}`
      );
    };
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [debugOn, activePlayer]);

  // HIZLI HAT: panelin oynat/duraklat/atla/ses komutları doğrudan buraya düşer.
  // Aşağıdaki now_playing aboneliği yerini almaz — o kalıcı ve garanti yol, bu
  // ise gecikmesizi. Aynı komut iki yoldan da gelir; ikincisi zaten no-op olur.
  useEffect(() => {
    if (!started || blocked === "claim") return;

    // Aynı işleyici iki hattan da beslenir: sayfa içi (aynı sekmedeki panel) ve
    // Realtime (uzak panel / TV modu). Aynı sekmede çift teslim olmaz, çünkü
    // Realtime kendi mesajımızı bize geri vermiyor (self: false).
    const applyCommand = (cmd: PlayerCommand) => {
      if (blockedRef.current === "claim") return;
      if (!cmd?.type) return;
      {
        switch (cmd.type) {
          case "play": {
            setDesiredPlaying(true);
            try {
              activePlayer()?.playVideo();
            } catch {}
            // Duraklatmada olduğu gibi durumu ANINDA bildir. Yoksa panel yeni
            // durumu ancak saniyelik sinyal turunda öğreniyordu: duraklat anında,
            // başlat gecikmeli görünüyor ve ikisi eş zamanlı hissettirmiyordu.
            // (started alanı hâlâ deck'in gerçek durumundan geliyor: ses akmaya
            // başlamadan ilerleme çubuğu saymaz.)
            broadcastState({ is_playing: true });
            // Arka plan sekmesinde engellenirse bekçi toparlasın
            scheduleNudges([PLAY_NUDGE_MS]);
            break;
          }
          case "pause": {
            // Panelin açık komutu: DB yolundaki "yankı mı, komut mu" belirsizliği
            // burada yok — doğrudan uygulanır
            explicitPauseAtRef.current = Date.now();
            setDesiredPlaying(false);
            endCrossfade();
            try {
              activePlayer()?.pauseVideo();
            } catch {}
            broadcastState({ is_playing: false });
            break;
          }
          case "seeking": {
            // Atlama isteği sunucuya gitti: sürmekte olan geçişi kes ki gelen
            // şarkı yarım rampanın üstüne binmesin
            endCrossfade();
            break;
          }
          case "seek": {
            const target = Math.max(0, Math.floor(cmd.position_ms ?? 0));
            if (!currentVideoRef.current) break;
            // Sarma sırasında geçiş yapmayız: rampanın ortasında konum değişirse
            // çıkan ve giren şarkı birbirine karışır. Önyükleme de geçersizleşir,
            // çünkü kalan süre artık başka.
            endCrossfade();
            const player = activePlayer();
            if (!activeReady() || typeof player?.seekTo !== "function") break;
            try {
              // allowSeekAhead: tamponun ötesine gidildiğinde YouTube yeni parçayı
              // istesin — false olsaydı uzak konumlar yalnızca tampon içinde çalışırdı
              player.seekTo(target / 1000, true);
            } catch {
              break;
            }
            // Takılma bekçisinin çapası yeni konuma taşınır: aksi halde "saniye
            // geriye gitti" görünüp kurtarma merdivenini boşuna tetikliyordu
            markProgress(currentVideoRef.current, target / 1000);
            if (desiredPlayingRef.current) {
              try {
                player.playVideo();
              } catch {}
              scheduleNudges([PLAY_NUDGE_MS]);
            } else {
              // Duraklatılmışken sarma duraklatılmış kalmalı. YouTube seek'ten
              // sonra bazı durumlarda kendiliğinden oynatmaya geçiyor; onStateChange
              // bunu "kullanıcı başlattı" sanıp müziği açardı.
              explicitPauseAtRef.current = Date.now();
              setTimeout(() => {
                if (desiredPlayingRef.current) return;
                try {
                  player.pauseVideo();
                } catch {}
              }, 300);
            }
            // Panel/müşteri ekranı beklemesin: yeni konum hem hızlı hattan hem de
            // (started_at çapası için) sunucudan geçer. getCurrentTime seek'ten
            // hemen sonra eski konumu döndürebildiği için değer elle bildirilir.
            broadcastState({ progress_ms: target });
            api({
              action: "heartbeat",
              progress_ms: target,
              is_playing: desiredPlayingRef.current,
              video_id: currentVideoRef.current,
            });
            break;
          }
          case "load": {
            if (!cmd.video_id || cmd.video_id === currentVideoRef.current) break;
            // Sıradaki şarkı zaten boştaki deck'te tamponlanmış olabilir (şarkının
            // 5. saniyesinden beri hazır bekler). Atlamada onu çalmak baştan
            // yüklemeye göre ANINDA olur: aksi halde deck yeni videoyu tamponlarken
            // mekan yarım saniye susuyordu.
            if (!playPreloaded(cmd.video_id)) loadVideo(cmd.video_id);
            break;
          }
          case "volume": {
            applyVolume(cmd.volume);
            break;
          }
        }
      }
    };

    const channel = playerBusChannel(supabase, venueDbId);
    channel
      .on("broadcast", { event: CMD_EVENT }, ({ payload }: { payload: PlayerCommand }) => {
        applyCommand(payload);
      })
      .subscribe();
    busRef.current = channel;
    const offLocal = onLocalCommand(venueDbId, applyCommand);

    return () => {
      busRef.current = null;
      offLocal();
      supabase.removeChannel(channel);
    };
  }, [
    started,
    blocked,
    supabase,
    venueDbId,
    activePlayer,
    activeReady,
    scheduleNudges,
    endCrossfade,
    loadVideo,
    playPreloaded,
    applyVolume,
    broadcastState,
    setDesiredPlaying,
    markProgress,
    api,
  ]);

  // Kuyruk değişince tamponu geçersiz kıl. Müşteri öncelikli şarkı eklediğinde
  // sıradaki artık başka bir şarkıdır; eskisini tamponda tutmak kesintisiz
  // geçiş avantajını boşa harcardı. Burada yalnızca işaretleriz — asıl peek'i
  // playbackTick yapar ve preloadNext'teki 10 sn'lik kapı, otomatik dolumun
  // tek seferde yüzlerce satır eklediği durumda bile istek seline izin vermez.
  useEffect(() => {
    if (!started || blocked) return;
    const channel = supabase
      .channel(`player-queue:${venueDbId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue", filter: `venue_id=eq.${venueDbId}` },
        () => {
          if (fadingRef.current || advancingRef.current) return;
          preloadedForRef.current = null;
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [started, blocked, supabase, venueDbId]);

  // Dış komutları dinle: admin panelden next/pause, müşteri isteğiyle başlayan çalma
  useEffect(() => {
    if (!started || blocked === "claim") return;

    const channel = supabase
      .channel(`player-np:${venueDbId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "now_playing", filter: `venue_id=eq.${venueDbId}` },
        (payload: { new: NowPlayingRow }) => {
          // Sahiplik kaybedildiyse dinlemeye devam etme — sesi açan taraf sahip
          if (blockedRef.current === "claim") return;
          // Çevrimdışı yedekle çalıyoruz: satırdaki şarkı bayat, bu güncelleme
          // bizi bir önceki şarkıya geri sardırmasın. Eşitlemeyi reconcile yapar.
          if (offlineFallbackRef.current) return;
          const np = payload.new;
          // Ses seviyesi her daldan önce uygulanır: şarkı değişimiyle aynı
          // güncellemede gelse bile (aşağıdaki dallar return ediyor) kaçmasın.
          // Heartbeat yankılarında değer değişmediği için setVolume çağrılmaz.
          if (np.volume !== volumeRef.current) applyVolume(np.volume);
          applyCrossfade(np.crossfade_ms);
          // ŞARKI GEÇİŞİNİN KENDİ YANKISI. Kuyruğu ilerleten "next" isteğini biz
          // attık; sunucu now_playing'i yeni şarkıyla günceller ve Realtime bu
          // satırı bize çoğu zaman HTTP yanıtından ÖNCE getirir. O anda aşağıdaki
          // "video değişti" dalı devreye giriyordu ve:
          //   • tamponlanmış deck yok sayılıp aktif deck'e baştan yükleme yapılıyor
          //     (preload boşa gidiyor, geçiş yeniden ağa bağımlı hâle geliyordu),
          //   • hemen ardından gelen yanıt aynı videoyu İKİNCİ kez yüklüyor —
          //     arka arkaya iki loadVideoById iframe'i UNSTARTED/BUFFERING'de
          //     asılı bırakabiliyor ve şarkı hiç başlamıyordu,
          //   • çapraz geçişin ortasındaysak endCrossfade rampayı kesiyor, çalan
          //     şarkı birkaç saniye erken kesiliyordu.
          // Geçişi zaten biz yürütüyoruz: yanıt geldiğinde doğru deck'ten
          // çalınacak. Bu pencerede DB'nin söylediğine kulak asmayız; gerçekten
          // dışarıdan gelen bir değişiklik olsaydı da hızlı hat (broadcast) onu
          // taşır, kaçarsa reconcile en geç 15 sn içinde uygular.
          if (advancingRef.current || fadingRef.current) return;
          // Panelden "baştan başlat": aynı video, ilerleme sıfırlanmış. Şarkının
          // ilk saniyelerinde gelen heartbeat yankısı da sıfır taşır; o yüzden
          // yalnızca gerçekten ilerlemiş bir videoda başa sarılır. Yeni yüklenen
          // videonun kendi "next" yazması da (crossfade dahil) progress 0 taşır —
          // grace penceresi onu eler.
          if (
            np.video_id &&
            np.video_id === currentVideoRef.current &&
            (np.progress_ms ?? -1) === 0 &&
            !fadingRef.current &&
            Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS
          ) {
            let elapsed = 0;
            try {
              elapsed = (activePlayer()?.getCurrentTime() ?? 0) * 1000;
            } catch {}
            if (elapsed > 2_000) {
              try {
                activePlayer()?.seekTo(0, true);
                if (np.is_playing) activePlayer()?.playVideo();
              } catch {}
              return;
            }
          }
          if (np.video_id && np.video_id !== currentVideoRef.current) {
            // Hızlı hat kaçtıysa geçiş buradan yürür; tampon hazırsa yine ondan
            // çalınır ki uzak panelden atlamada da ses kesilmesin
            if (!playPreloaded(np.video_id)) loadVideo(np.video_id);
            return;
          }
          if (!np.video_id && currentVideoRef.current) {
            endCrossfade();
            currentVideoRef.current = null;
            desiredPlayingRef.current = false;
            setIdle(true);
            pendingVideoRef.current = null;
            preloadedVideoRef.current = null;
            preloadedForRef.current = null;
            try {
              activePlayer()?.pauseVideo();
            } catch {}
            onTrackChange?.({ videoId: null, isPlaying: false });
            return;
          }
          // Aynı video, oynat/duraklat komutu
          if (np.video_id) {
            // KENDİ yankımız mı? Player durumunu 5 sn'de bir bu satıra yazıyor ve
            // yazım bize geri dönüyor. Kullanıcı tam o sırada videoya tıklayıp
            // duraklattıysa/başlattıysa yoldaki BAYAT satır taze niyeti eziyordu:
            // "durduruyorum kendi başlıyor, başlatınca hemen duruyor". Yerel karar
            // taze olduğu sürece DB'nin çalma durumu uygulanmaz — panelin gerçek
            // komutu zaten yukarıdaki hızlı hattan geliyor.
            if (!dbStateIsFresh()) return;
            if (np.is_playing) {
              // Zaten çalıyorsak niyeti yeniden damgalama: dışarıdan gelen bu
              // onay, kullanıcının bir sonraki duraklatmasını geciktirmesin
              if (!desiredPlayingRef.current) setDesiredPlaying(true);
              try {
                activePlayer()?.playVideo();
              } catch {}
              scheduleNudges([PLAY_NUDGE_MS]);
            } else if (desiredPlayingRef.current) {
              // "Durdu" gerçek bir duraklatma komutu mu, yoksa takılı player'ın
              // kendi heartbeat'inin yankısı mı? Hiç başlamamış (CUED/UNSTARTED)
              // videoda ve yüklemeden hemen sonra niyet söndürülmez — söndürülürse
              // bekçi devre dışı kalır ve şarkı sonsuza dek bekler
              let neverStarted = false;
              try {
                const s = activePlayer()?.getPlayerState();
                neverStarted = s === window.YT?.PlayerState.CUED || s === -1;
              } catch {}
              if (!neverStarted && Date.now() - lastLoadAtRef.current > PAUSE_ECHO_GRACE_MS) {
                explicitPauseAtRef.current = Date.now();
                setDesiredPlaying(false);
                // Duraklatma geçişi de keser: iki şarkı yarım rampada donmasın
                endCrossfade();
                try {
                  activePlayer()?.pauseVideo();
                } catch {}
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    started,
    blocked,
    supabase,
    venueDbId,
    loadVideo,
    playPreloaded,
    onTrackChange,
    scheduleNudges,
    applyVolume,
    applyCrossfade,
    endCrossfade,
    activePlayer,
    dbStateIsFresh,
    setDesiredPlaying,
  ]);

  // "Çalmayı buraya al": sahipliği zorla devral ve kaldığı yerden sürdür
  const takeOver = useCallback(async () => {
    const result = await api({ action: "claim", force: true });
    if (!result?.claimed) return;
    setClaimTaken(false);
    setBlock(null);
    reconcile();
  }, [api, setBlock, reconcile]);

  // Sekme/pencere kapanırken sahipliği bırak. Aksi halde kilit 45 sn bayatlayana
  // kadar duruyor ve player hemen yeniden açıldığında kendi eski kilidimiz yüzünden
  // "başka bir cihazda açık" uyarısı çıkıyordu (sessionStorage kimliği sekmeye özel).
  useEffect(() => {
    if (!started) return;
    const url = `/api/player/${venueDbId}`;
    const release = () => {
      const body = JSON.stringify({ action: "release", claim_id: claimId() });
      try {
        // sendBeacon kapanış sırasında da teslim edilir; aynı origin olduğu için cookie gider
        if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
      } catch {}
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    // pagehide hem gerçek kapanışta hem de sayfa bfcache'e alınırken tetiklenir.
    // persisted=true ise sekme KAPANMADI — mobilde ekran kilidi / uygulama
    // değiştirme gibi geçici bir arka plana alınmadır. Orada sahipliği bırakıp
    // "duraklatıldı" yazmak müziği kalıcı olarak durduruyordu; artık dokunmuyoruz
    // ve dönüşte kaldığı yerden devam ediyor.
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      release();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) restoreRef.current();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      // Kısa gecikme: StrictMode geliştirmede effect'i mount→cleanup→mount
      // çalıştırır; hemen bırakırsak daha yeni başlamış player'ın kilidini
      // kendimiz düşürürüz. Gerçek kapanışı zaten pagehide yakalıyor.
      releaseTimerRef.current = setTimeout(release, 300);
    };
  }, [started, venueDbId, claimId]);

  // "Başka cihazda açık" ekranı asılı kalmasın: diğer sekme kapandığında ya da
  // kilit bayatladığında kendiliğinden normal "Başlat" ekranına dönsün.
  useEffect(() => {
    if (!claimTaken) return;
    const probe = async () => {
      const result = await api({ action: "claim", probe: true });
      if (result && result.taken !== true) setClaimTaken(false);
    };
    const interval = setInterval(probe, 5_000);
    return () => clearInterval(interval);
  }, [claimTaken, api]);

  useEffect(() => {
    return () => {
      nudgeTimersRef.current.forEach(clearTimeout);
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      const alive = keepAliveRef.current;
      keepAliveRef.current = null;
      if (alive) {
        try {
          // Rampayla kapat: ani kesme bazı hoparlörlerde tık sesi çıkarır
          alive.gain.gain.setValueAtTime(alive.gain.gain.value, alive.ctx.currentTime);
          alive.gain.gain.linearRampToValueAtTime(0, alive.ctx.currentTime + 0.2);
          setTimeout(() => alive.ctx.close().catch(() => {}), 300);
        } catch {}
      }
      try {
        decksRef.current.a?.destroy();
        decksRef.current.b?.destroy();
      } catch {}
      decksRef.current = { a: null, b: null };
      deckReadyRef.current = { a: false, b: false };
    };
  }, []);

  // Görsel çapraz geçiş: iki iframe üst üste durur, geçiş boyunca çıkan solar,
  // giren belirir. Sesle aynı süre. YouTube kuralı gereği ikisi de ekrandadır,
  // üzerlerine hiçbir şey bindirilmez.
  const deckStyle = (key: DeckKey): React.CSSProperties => ({
    opacity: visibleDeck === key ? 1 : 0,
    transition: `opacity ${fading ? fadeMs : 200}ms linear`,
    // Görünmeyen deck tıklamaları yutmasın (YouTube kendi kontrollerini gösterir).
    // Panel içindeki küçük oynatıcıda İKİSİ DE tıklanamaz: orası yalnızca
    // "müzik çalıyor" göstergesi, kumanda alt barda. Üstüne gelince YouTube'un
    // kendi başlık/duraklat katmanı açılmasın, kazara tıklayınca müzik durmasın.
    pointerEvents: compact || visibleDeck !== key ? "none" : "auto",
    // Deck 256x144 kurulur (bkz. VIDEO_W) ve sahneyi dolduracak kadar büyütülür.
    // transform iframe'in KENDİ görüntü alanını değiştirmez: YouTube içeride hâlâ
    // 256x144 görür ve en düşük kaliteyi gönderir.
    width: VIDEO_W,
    height: VIDEO_H,
    transform: `translate(-50%, -50%) scale(${stageScale})`,
    transformOrigin: "center center",
  });

  return (
    <div className="relative w-full">
      {/* YouTube kuralı: video görünür kalmalı, üzerine hiçbir şey bindirilemez */}
      <div
        ref={stageRef}
        // compact: kural hem sahneye hem doğrudan iframe'e yazılır. Yalnızca
        // sahneye yazmak yetmiyordu — deck'lerin kendi satır içi pointerEvents
        // değeri araya girebiliyor ve YouTube'un üste gelince açılan
        // duraklat/logo katmanı yine görünüyordu.
        className={`relative aspect-video w-full overflow-hidden bg-black [&_iframe]:h-full [&_iframe]:w-full ${
          compact
            ? "pointer-events-none select-none rounded-lg [&_iframe]:pointer-events-none"
            : "rounded-2xl"
        }`}
      >
        <div ref={deckAHostRef} className="absolute left-1/2 top-1/2" style={deckStyle("a")} />
        <div ref={deckBHostRef} className="absolute left-1/2 top-1/2" style={deckStyle("b")} />
      </div>

      {/* Teşhis paneli — yalnızca ?debug=1 ile. Videonun ÜSTÜNE değil ALTINA
          çizilir (YouTube kuralı: video alanına hiçbir şey bindirilemez). */}
      {debugOn && (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/60 p-2 font-mono text-[10px] leading-[1.35] text-[#9ca3af]">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="font-bold text-[#e91e8c]">{live}</p>
            <span className="text-[#6b7280]">({logBuf.length} satır)</span>
            {/* Dökümü mekandan bize taşımanın yolu: pano ya da dosya. DevTools
                açtırmadan, tek tuşla. */}
            <button
              type="button"
              onClick={() => {
                const text = logAsText();
                navigator.clipboard?.writeText(text).catch(() => {});
              }}
              className="rounded-md border border-white/20 px-2 py-0.5 text-white"
            >
              Kopyala
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([logAsText()], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `pmj-player-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-md border border-white/20 px-2 py-0.5 text-white"
            >
              İndir
            </button>
            <button
              type="button"
              onClick={clearLog}
              className="rounded-md border border-white/20 px-2 py-0.5 text-[#9ca3af]"
            >
              Temizle
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {logBuf
              .slice(-LOG_VIEW_LIMIT)
              .reverse()
              .map((line, i) => (
                <p key={`${line.at}-${i}`} className="whitespace-pre-wrap">
                  <span className="text-[#6b7280]">{logStamp(line.at)} </span>
                  {line.text}
                </p>
              ))}
          </div>
        </div>
      )}

      {/* Tarayıcı, arkada kalan pencerede yeni şarkıyı başlatmıyor. Mekan
          ekrana döndüğünde müzik zaten çalmaya başlamış olur; bu şerit sebebi
          söyler ki bir daha aynı sessizlik yaşanmasın. */}
      {backgroundBlocked && !compact && (
        <p className="mt-2 rounded-xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-center text-xs text-[#fbbf24]">
          Player penceresi arkada kaldığı için tarayıcı yeni şarkıyı başlatmadı.
          Bu pencereyi her zaman en önde/açık bırakın — kuyruk korundu, hiçbir şarkı atlanmadı.
        </p>
      )}

      {/* Cihaz ses komutunu kabul etmiyorsa (mobil tarayıcılarda ses donanımdan
          yönetilir) mekan bunu ekranda görsün — panelde boşuna uğraşmasın */}
      {volumeIgnored && !compact && (
        <p className="mt-2 text-center text-xs text-[#fbbf24]">
          Bu cihaz uzaktan ses ayarını kabul etmiyor — sesi cihazın kendi düğmelerinden
          ayarlayın. Uzaktan kontrol ve çapraz geçiş için player&apos;ı bilgisayarda açın.
        </p>
      )}

      {/* Oturum düştü — eskiden bu durumda "kuyruk boş" yazıyor, mekan nedenini anlayamıyordu */}
      {blocked === "auth" ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#1a0e2a] text-center ${compact ? "gap-1 px-2" : "gap-3 px-6"}`}>
          {!compact && <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          <p className={`font-bold text-white ${compact ? "text-[11px] leading-tight" : "text-sm"}`}>Mekan oturumu düştü — müzik durdu</p>
          {!compact && (
            <p className="text-xs text-[#9ca3af]">
              Tekrar giriş yapıldığı anda çalma kaldığı yerden devam eder.
            </p>
          )}
          {loginHref && (
            <a
              href={loginHref}
              className={`font-bold text-white ${compact ? "rounded-lg px-2.5 py-1 text-[10px]" : "mt-1 rounded-2xl px-6 py-3 text-sm"}`}
              style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
            >
              Tekrar Giriş Yap
            </a>
          )}
        </div>
      ) : blocked === "claim" ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#1a0e2a] text-center ${compact ? "gap-1 px-2" : "gap-3 px-6"}`}>
          {!compact && <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="#9ca3af" strokeWidth="2" /><path d="M8 21h8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>}
          <p className={`font-bold text-white ${compact ? "text-[11px] leading-tight" : "text-sm"}`}>Çalma başka bir cihaza geçti</p>
          {!compact && (
            <p className="text-xs text-[#9ca3af]">
              Çift ses olmasın diye bu ekran susturuldu. Müzik diğer cihazdan çalıyor.
            </p>
          )}
          <button
            onClick={takeOver}
            className={`font-bold text-white ${compact ? "rounded-lg px-2.5 py-1 text-[10px]" : "mt-1 rounded-2xl px-6 py-3 text-sm"}`}
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            Çalmayı Buraya Al
          </button>
        </div>
      ) : claimTaken ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#1a0e2a] text-center ${compact ? "gap-1 px-2" : "gap-3 px-6"}`}>
          {!compact && <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="2" stroke="#9ca3af" strokeWidth="2" /><path d="M8 21h8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" /></svg>}
          <p className={`font-bold text-white ${compact ? "text-[11px] leading-tight" : "text-sm"}`}>Player başka bir cihazda/sekmede açık</p>
          {!compact && (
            <p className="text-xs text-[#9ca3af]">
              Buradan da başlatırsan iki ses üst üste biner. Müzik zaten diğer ekrandan çalıyor.
            </p>
          )}
          <button
            onClick={() => start(true)}
            className={`font-bold text-white ${compact ? "rounded-lg px-2.5 py-1 text-[10px]" : "mt-1 rounded-2xl px-6 py-3 text-sm"}`}
            style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
          >
            Yine de Buradan Çal
          </button>
        </div>
      ) : !started ? (
        <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-[#1a0e2a] ${compact ? "gap-1.5" : "gap-4"}`}>
          {/* Panelde ayrı bir "Başlat" düğmesi YOK: dokunuşu alt bardaki oynat
              düğmesi veriyor (bkz. mini-player-store → setPlayerStarter). TV
              modunda alt bar olmadığı için düğme orada duruyor. */}
          {compact ? (
            <div className="flex items-center gap-1.5 text-[#9ca3af]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#e91e8c"><path d="M8 5v14l11-7z" /></svg>
              <span className="text-[11px] font-semibold leading-tight">Oynat&apos;a basın</span>
            </div>
          ) : (
            <button
              onClick={() => start()}
              className="flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-bold text-white transition-transform active:scale-95"
              style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              Başlat
            </button>
          )}
          <p className={`text-center text-[#6b7280] ${compact ? "px-2 text-[9px] leading-tight" : "px-6 text-xs"}`}>
            {compact ? "Alt bardaki oynat düğmesi müziği başlatır" : "Tarayıcı politikası gereği ilk oynatma için bir kez dokunmanız gerekir"}
          </p>
          {error && <p className={compact ? "text-[10px] text-red-400" : "text-sm text-red-400"}>{error}</p>}
        </div>
      ) : idle ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#1a0e2a]">
          <svg width={compact ? 20 : 36} height={compact ? 20 : 36} viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><circle cx="6" cy="18" r="3" stroke="#6b7280" strokeWidth="2" /><circle cx="18" cy="16" r="3" stroke="#6b7280" strokeWidth="2" /></svg>
          <p className={`text-center text-[#9ca3af] ${compact ? "px-2 text-[10px] leading-tight" : "text-sm"}`}>Kuyruk boş — sıradaki şarkı otomatik denenecek</p>
        </div>
      ) : null}
    </div>
  );
}
