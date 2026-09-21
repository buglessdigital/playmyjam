"use client";

/**
 * Açık / koyu tema düğmesi.
 *
 * Tema <html> üzerindeki data-hub-theme ile taşınıyor; sayfanın <style> bloğu
 * değişkenleri oradan okuyor. Düğmenin KENDİSİ tema durumunu state'te tutmuyor:
 * iki simge de basılıyor, hangisinin görüneceğine CSS karar veriyor. Böylece
 * sunucu render'ı ile istemci render'ı hep aynı oluyor, hidrasyon uyuşmazlığı
 * ve ilk karede yanlış simge görünmesi olmuyor.
 *
 * Tercih localStorage'da; erişilemezse (gizli sekme, engelli site verisi) düğme
 * yine çalışır, yalnızca hatırlanmaz.
 */

const STORAGE_KEY = "pmj-hub-theme";

// Sayfa boyanmadan ÖNCE çalışır: kayıtlı tercih yoksa cihazın tercihine düşer.
// Bu satır olmadan koyu temayı seçmiş biri her açılışta beyaz bir kare görürdü.
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.hubTheme=t;}catch(e){document.documentElement.dataset.hubTheme="light";}})();`;

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M6.3 6.3L4.8 4.8M19.2 19.2l-1.5-1.5M6.3 17.7l-1.5 1.5M19.2 4.8l-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20.5 14.2A8.4 8.4 0 019.8 3.5a8.5 8.5 0 1010.7 10.7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.hubTheme === "dark" ? "light" : "dark";
    root.dataset.hubTheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    // Tarayıcı çubuğu da tema ile birlikte dönsün
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#120c1c" : "#faf7fc");
  };

  return (
    <button type="button" onClick={toggle} className="hub-theme" aria-label="Temayı değiştir">
      <span className="hub-theme-dark">
        <MoonIcon />
        Koyu
      </span>
      <span className="hub-theme-light">
        <SunIcon />
        Açık
      </span>
    </button>
  );
}
