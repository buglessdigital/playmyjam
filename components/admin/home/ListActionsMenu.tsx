"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Library, Playlist } from "./useLibrary";

const MENU_WIDTH = 250;

/**
 * Liste araç çubuğundaki "⋯" menüsü: sık kullanılmayan liste işlemleri
 * (müşteri görünürlüğü, YouTube'dan güncelleme, ad değiştirme, silme) çubuğu
 * kalabalıklaştırmasın diye burada. Menü portal ile body'ye basılır: araç
 * çubuğundaki backdrop-filter, içindeki `position: fixed` öğeleri çubuğa göre
 * konumlandırıyor (menü yanlış yerde açılıp kırpılıyordu).
 */
export default function ListActionsMenu({
  list,
  lib,
  hasSource,
  onRename,
}: {
  list: Playlist;
  lib: Library;
  hasSource: boolean;
  onRename: () => void;
}) {
  const { setCustomerVisible, syncNow, syncingId, deleteList } = lib;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 6,
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
        ),
      });
    }
    setOpen(true);
  };

  const act = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const itemClass =
    "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#e5e7eb] transition-colors hover:bg-white/[0.06] disabled:opacity-40";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        aria-label="Liste işlemleri"
        aria-expanded={open}
        title="Liste işlemleri"
        className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors hover:bg-white/10"
        style={{
          background: open
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.08)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-50 rounded-xl border border-white/10 overflow-hidden shadow-2xl py-1"
              style={{
                top: pos.top,
                left: pos.left,
                width: MENU_WIDTH,
                background: "#1a1025",
              }}
            >
              {/* Müşteri aktifliği (0040): kapalıyken listenin şarkıları müşteri
                panelinde hiç görünmez. Otomatik çalmayı etkilemez. Menü
                kapanmaz — anahtarın yeni durumu görülsün. */}
              <button
                onClick={() => setCustomerVisible(list, !list.customer_visible)}
                role="menuitemcheckbox"
                aria-checked={list.customer_visible}
                className={itemClass}
                title={
                  list.customer_visible
                    ? "Bu listedeki şarkılar müşteri panelinde görünür ve jetonla istenebilir"
                    : "Bu listedeki şarkılar müşteride görünmez; otomatik çalmaya devam eder"
                }
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                    stroke="#9ca3af"
                    strokeWidth="1.8"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    stroke="#9ca3af"
                    strokeWidth="1.8"
                  />
                </svg>
                <span className="flex-1">Müşteriye açık</span>
                <span
                  className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
                  style={{
                    background: list.customer_visible
                      ? "#3b82f6"
                      : "rgba(255,255,255,0.15)",
                  }}
                >
                  <span
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                    style={{ left: list.customer_visible ? 16 : 2 }}
                  />
                </span>
              </button>

              {/* Senkron her YouTube listesinde daima açık; bu yalnızca günlük
                cron'u beklemeden elle tetikler. */}
              {hasSource && (
                <button
                  onClick={act(() => syncNow(list))}
                  disabled={syncingId !== null}
                  className={itemClass}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0"
                  >
                    <path
                      d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
                      stroke="#9ca3af"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  YouTube&apos;dan şimdi güncelle
                </button>
              )}

              <button onClick={act(onRename)} className={itemClass}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M4 20h4L19 9l-4-4L4 16v4z"
                    stroke="#9ca3af"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                Yeniden adlandır
              </button>

              <div className="my-1 h-px bg-white/10" />

              <button
                onClick={act(() => deleteList(list))}
                className={itemClass}
                style={{ color: "#f87171" }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                    stroke="#ef4444"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                Listeyi sil
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
