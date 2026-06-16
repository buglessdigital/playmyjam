"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifPref,
  setNotifPref,
  getPermission,
  requestPermission,
  notify,
  type NotifPref,
} from "@/lib/notifications";

function subscribeNotifPrefs(callback: () => void) {
  window.addEventListener("pmj-notif-pref-changed", callback);
  return () => window.removeEventListener("pmj-notif-pref-changed", callback);
}

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className="relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0"
    style={{ background: value ? "#e91e8c" : "rgba(255,255,255,0.15)" }}
  >
    <div
      className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300"
      style={{ left: value ? "28px" : "4px" }}
    />
  </button>
);

export default function SettingsPage() {
  const router = useRouter();
  const notifNearby = useSyncExternalStore(subscribeNotifPrefs, () => getNotifPref("nearby"), () => true);
  const notifQueue = useSyncExternalStore(subscribeNotifPrefs, () => getNotifPref("queue"), () => false);
  const permission = useSyncExternalStore(subscribeNotifPrefs, getPermission, () => "default" as const);

  const toggleNotif = async (pref: NotifPref, current: boolean) => {
    const next = !current;
    if (next) {
      const perm = await requestPermission();
      if (perm === "granted" && !getNotifPref(pref)) {
        notify("Bildirimler açık 🎉", "PlayMyJam bildirimleri bu cihazda etkin.");
      }
    }
    // setNotifPref olayı tetikler; toggle ve izin durumu store üzerinden tazelenir
    setNotifPref(pref, next);
  };
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      setName(profile?.username ?? user.email?.split("@")[0] ?? "");
    };
    load();
  }, []);

  const saveProfile = async () => {
    const username = editName.trim();
    if (!username || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);
      if (error) {
        setSaveError("Kaydedilemedi, tekrar deneyin");
        return;
      }
      setName(username);
      setShowUpdateModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center gap-3 px-5 pt-12 pb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-xl">Ayarlar</h1>
      </div>

      {/* Bildirimler */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">BİLDİRİMLER</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex-1 pr-4">
              <p className="text-white text-sm font-medium">Şarkım çalmaya yakın</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Şarkın çalmak üzereyken bildirim al</p>
            </div>
            <Toggle value={notifNearby} onChange={() => toggleNotif("nearby", notifNearby)} />
          </div>
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <p className="text-white text-sm font-medium">Kuyruk güncellemeleri</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Sıra değişimlerinde bildirim al</p>
            </div>
            <Toggle value={notifQueue} onChange={() => toggleNotif("queue", notifQueue)} />
          </div>
        </div>
        {permission === "denied" && (notifNearby || notifQueue) && (
          <p className="text-amber-400/80 text-xs mt-2 px-1">
            Tarayıcı bildirim izni reddedilmiş. Bildirim almak için tarayıcı ayarlarından bu siteye izin ver.
          </p>
        )}
        {permission === "unsupported" && (
          <p className="text-amber-400/80 text-xs mt-2 px-1">
            Bu tarayıcı bildirimleri desteklemiyor.
          </p>
        )}
      </div>

      {/* Hesap */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">HESAP</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <button
            onClick={() => { setEditName(name); setSaveError(""); setShowUpdateModal(true); }}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors"
          >
            <span className="text-white text-sm font-medium">Bilgileri Güncelle</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Versiyon */}
      <div className="px-5 pb-8">
        <p className="text-center text-[#4b5563] text-xs">PlayMyJam v1.0.0</p>
      </div>

      {/* Bilgileri Güncelle Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-t-3xl p-6" style={{ background: "#1a0e2a" }}>
            <h2 className="text-white font-bold text-lg mb-5">Bilgileri Güncelle</h2>
            {saveError && (
              <p className="text-red-400 text-sm mb-3">{saveError}</p>
            )}
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[#6b7280] text-xs mb-1 block">Kullanıcı Adı</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#e91e8c]/40"
                />
              </div>
              <div>
                <label className="text-[#6b7280] text-xs mb-1 block">E-posta</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-[#6b7280] text-sm focus:outline-none"
                />
                <p className="text-[#4b5563] text-xs mt-1">E-posta adresi değiştirilemez.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm"
              >
                İptal
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !editName.trim()}
                className="flex-1 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
