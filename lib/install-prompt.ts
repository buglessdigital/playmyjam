"use client";

// Tarayıcının "bu siteyi uygulama olarak kurabilirsin" olayı (beforeinstallprompt)
// sayfa yüklenirken BİR KEZ tetiklenir ve yakalanmazsa kaybolur. Kurulum kartları
// (talep gönderildikten sonra çıkan kart, panelin ayarlar kartı) ise ekrana çok
// daha sonra geldiği için kendi içlerinde dinleseler olayı hep kaçırırlar.
//
// Bu yüzden dinleyici modül yüklenir yüklenmez, uygulamanın kökünden bağlanır ve
// olay burada saklanır; kartlar abone olup hazır olanı kullanır.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let attached = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

export function startInstallPromptCapture(): void {
  if (attached || typeof window === "undefined") return;
  attached = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome'un kendi çubuğunu bastır: kurulumu kendi kartımızdan öneriyoruz
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

// Modül istemcide çözülür çözülmez dinlemeye başla — kök layout'taki bir
// bileşenin effect'ini beklemek bile olayı kaçırmaya yetebiliyor.
startInstallPromptCapture();

export function subscribeInstallPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Kurulum istemi hazır mı? (useSyncExternalStore anlık görüntüsü) */
export function installPromptReady(): boolean {
  return deferred !== null;
}

/**
 * Kurulum istemini açar. İstem tek kullanımlıktır: açıldıktan sonra tarayıcı
 * yenisini yollayana kadar elden çıkar.
 */
export async function runInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "dismissed";
  } finally {
    deferred = null;
    emit();
  }
}
