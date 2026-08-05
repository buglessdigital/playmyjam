"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LangToggle from "@/components/ui/LangToggle";
import { fmt, useT } from "@/lib/i18n";
import {
  getNotifPref,
  setNotifPref,
  getPermission,
  requestPermission,
  notify,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
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

const DELETE_CONFIRM_PHRASE = "HESABIMI SİL";

export default function SettingsPage() {
  const router = useRouter();
  const t = useT();
  const venueId = String(useParams()?.venueId ?? "");
  const notifNearby = useSyncExternalStore(subscribeNotifPrefs, () => getNotifPref("nearby"), () => true);
  const notifQueue = useSyncExternalStore(subscribeNotifPrefs, () => getNotifPref("queue"), () => false);
  const notifPush = useSyncExternalStore(subscribeNotifPrefs, () => getNotifPref("push"), () => false);
  const permission = useSyncExternalStore(subscribeNotifPrefs, getPermission, () => "default" as const);
  const [pushBusy, setPushBusy] = useState(false);
  // Sunucu snapshot'ı false — SSR ile hydration tutarlı, istemcide gerçek destek durumu okunur
  const pushSupported = useSyncExternalStore(subscribeNotifPrefs, isPushSupported, () => false);

  const toggleNotif = async (pref: NotifPref, current: boolean) => {
    const next = !current;
    if (next) {
      const perm = await requestPermission();
      if (perm === "granted" && !getNotifPref(pref)) {
        notify(t.settings.notifEnabledTitle, t.settings.notifEnabledBody);
      }
    }
    // setNotifPref olayı tetikler; toggle ve izin durumu store üzerinden tazelenir
    setNotifPref(pref, next);
  };

  // Push aboneliği sunucuda tutulur; toggle abonelik oluşturur/siler
  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!notifPush) {
        const ok = await subscribeToPush();
        setNotifPref("push", ok);
      } else {
        await unsubscribeFromPush();
        setNotifPref("push", false);
      }
    } finally {
      setPushBusy(false);
    }
  };
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // Google ile açılmış hesapta şifre yoktur; o durumda mevcut şifre sorulmaz
  const [hasPassword, setHasPassword] = useState(true);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordInfo, setPasswordInfo] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailInfo, setEmailInfo] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      // getSession lokal cache'ten okur — ağ çağrısı yapmaz
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      setEmail(user.email ?? "");
      setHasPassword((user.app_metadata?.providers ?? []).includes("email"));
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
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      // upsert: profil satırı herhangi bir nedenle yoksa update sessizce 0 satır
      // günceller ve kullanıcı kaydettiğini sanır
      const { error } = await supabase.from("profiles").upsert({ id: user.id, username });
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

  const savePassword = async () => {
    if (passwordSaving) return;
    setPasswordError("");
    setPasswordInfo("");
    if (newPassword.length < 6) {
      setPasswordError(t.settings.errShortPassword);
      return;
    }
    if (hasPassword && !currentPassword) {
      setPasswordError(t.settings.errCurrentPassword);
      return;
    }

    setPasswordSaving(true);
    try {
      const supabase = createClient();

      // Supabase şifre değişiminde mevcut şifreyi sormaz; açık kalmış bir cihazda
      // hesabın ele geçirilmemesi için doğrulamayı biz yapıyoruz.
      if (hasPassword) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (error) {
          setPasswordError(t.settings.errWrongPassword);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("should be different") || msg.includes("same as the")) {
          setPasswordError(t.settings.errSamePassword);
        } else if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
          setPasswordError(t.settings.errTooMany);
        } else {
          setPasswordError(t.settings.errPasswordUpdate);
        }
        return;
      }

      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordModal(false);
    } finally {
      setPasswordSaving(false);
    }
  };

  const saveEmail = async () => {
    if (emailSaving) return;
    const target = newEmail.trim();
    setEmailError("");
    setEmailInfo("");
    if (!target || !target.includes("@")) {
      setEmailError(t.settings.errInvalidEmail);
      return;
    }
    if (target.toLowerCase() === email.toLowerCase()) {
      setEmailError("Bu zaten mevcut adresin.");
      return;
    }

    setEmailSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/venue/${venueId}/settings` }
      );
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already") || msg.includes("registered")) {
          setEmailError(t.settings.errEmailTaken);
        } else if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
          setEmailError(t.settings.errTooMany);
        } else {
          setEmailError(t.settings.errEmailUpdate);
        }
        return;
      }
      // Güvenli e-posta değişimi açıkken hem eski hem yeni adrese onay gider
      setEmailInfo(
        `Onay bağlantısı gönderildi. Hem ${email} hem ${target} adresindeki bağlantılara tıkladığında adresin değişecek.`
      );
      setNewEmail("");
    } finally {
      setEmailSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleteError("");
    if (deleteConfirm.trim().toLocaleUpperCase("tr") !== DELETE_CONFIRM_PHRASE) {
      setDeleteError(`Onaylamak için "${DELETE_CONFIRM_PHRASE}" yaz.`);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: DELETE_CONFIRM_PHRASE }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error ?? t.settings.errDelete);
        setDeleting(false);
        return;
      }
      // Hesap gitti; mekan çerezini ve yerel oturumu da temizle
      const supabase = createClient();
      await fetch(`/api/venue/${venueId}/auth`, { method: "DELETE" }).catch(() => null);
      await supabase.auth.signOut().catch(() => null);
      router.replace("/");
    } catch {
      setDeleteError(t.settings.errDelete);
      setDeleting(false);
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
        <h1 className="text-white font-bold text-xl">{t.settings.title}</h1>
      </div>

      {/* Bildirimler */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">{t.settings.notifSection}</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex-1 pr-4">
              <p className="text-white text-sm font-medium">{t.settings.nearbyTitle}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">{t.settings.nearbyDesc}</p>
            </div>
            <Toggle value={notifNearby} onChange={() => toggleNotif("nearby", notifNearby)} />
          </div>
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex-1 pr-4">
              <p className="text-white text-sm font-medium">{t.settings.queueTitle}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">{t.settings.queueDesc}</p>
            </div>
            <Toggle value={notifQueue} onChange={() => toggleNotif("queue", notifQueue)} />
          </div>
          {pushSupported && (
            <div className="flex items-center justify-between px-4 py-4" style={{ opacity: pushBusy ? 0.6 : 1 }}>
              <div className="flex-1 pr-4">
                <p className="text-white text-sm font-medium">{t.settings.pushTitle}</p>
                <p className="text-[#6b7280] text-xs mt-0.5">{t.settings.pushDesc}</p>
              </div>
              <Toggle value={notifPush} onChange={togglePush} />
            </div>
          )}
        </div>
        {permission === "denied" && (notifNearby || notifQueue) && (
          <p className="text-amber-400/80 text-xs mt-2 px-1">
            {t.settings.permissionDenied}
          </p>
        )}
        {permission === "unsupported" && (
          <p className="text-amber-400/80 text-xs mt-2 px-1">
            {t.settings.unsupported}
          </p>
        )}
      </div>

      {/* Dil */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">{t.settings.langSection}</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-white text-sm font-medium">{t.settings.langRow}</span>
            <LangToggle />
          </div>
        </div>
      </div>

      {/* Hesap */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">{t.settings.accountSection}</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <button
            onClick={() => { setEditName(name); setSaveError(""); setShowUpdateModal(true); }}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-colors"
          >
            <span className="text-white text-sm font-medium">{t.settings.updateInfo}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => {
              setCurrentPassword(""); setNewPassword("");
              setPasswordError(""); setPasswordInfo(""); setShowPasswordModal(true);
            }}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-colors"
          >
            <div className="text-left">
              <p className="text-white text-sm font-medium">
                {hasPassword ? t.settings.changePassword : t.settings.setPassword}
              </p>
              {!hasPassword && (
                <p className="text-[#6b7280] text-xs mt-0.5">
                  {t.settings.googleNoPassword}
                </p>
              )}
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => { setNewEmail(""); setEmailError(""); setEmailInfo(""); setShowEmailModal(true); }}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors"
          >
            <span className="text-white text-sm font-medium">{t.settings.changeEmail}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hesabı sil */}
      <div className="px-5 mb-4">
        <h2 className="text-[#6b7280] text-xs font-semibold tracking-wider mb-3">{t.settings.dangerSection}</h2>
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1a0e2a" }}>
          <button
            onClick={() => { setDeleteConfirm(""); setDeleteError(""); setShowDeleteModal(true); }}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors"
          >
            <div className="text-left">
              <p className="text-red-400 text-sm font-medium">{t.settings.deleteAccount}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">{t.settings.deleteAccountDesc}</p>
            </div>
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
            <h2 className="text-white font-bold text-lg mb-5">{t.settings.updateInfo}</h2>
            {saveError && (
              <p className="text-red-400 text-sm mb-3">{saveError}</p>
            )}
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[#6b7280] text-xs mb-1 block">{t.settings.username}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#e91e8c]/40"
                />
              </div>
              <div>
                <label className="text-[#6b7280] text-xs mb-1 block">{t.settings.email}</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-[#6b7280] text-sm focus:outline-none"
                />
                <p className="text-[#4b5563] text-xs mt-1">
                  {t.settings.emailChangeHint}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !editName.trim()}
                className="flex-1 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
              >
                {saving ? t.settings.saving : t.settings.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Şifre Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-t-3xl p-6" style={{ background: "#1a0e2a" }}>
            <h2 className="text-white font-bold text-lg mb-5">
              {hasPassword ? t.settings.changePassword : t.settings.setPassword}
            </h2>
            {passwordError && <p className="text-red-400 text-sm mb-3">{passwordError}</p>}
            {passwordInfo && <p className="text-emerald-400 text-sm mb-3">{passwordInfo}</p>}
            <div className="space-y-3 mb-5">
              {hasPassword && (
                <div>
                  <label className="text-[#6b7280] text-xs mb-1 block">{t.settings.currentPassword}</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#e91e8c]/40"
                  />
                </div>
              )}
              <div>
                <label className="text-[#6b7280] text-xs mb-1 block">{t.settings.newPassword}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePassword()}
                  autoComplete="new-password"
                  className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#e91e8c]/40"
                />
                <p className="text-[#4b5563] text-xs mt-1">{t.settings.minChars}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={savePassword}
                disabled={passwordSaving || !newPassword}
                className="flex-1 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
              >
                {passwordSaving ? t.settings.saving : t.settings.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E-posta Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-t-3xl p-6" style={{ background: "#1a0e2a" }}>
            <h2 className="text-white font-bold text-lg mb-1">{t.settings.changeEmail}</h2>
            <p className="text-[#6b7280] text-xs mb-5">{fmt(t.settings.currentEmail, { email })}</p>
            {emailError && <p className="text-red-400 text-sm mb-3">{emailError}</p>}
            {emailInfo && <p className="text-emerald-400 text-sm mb-3">{emailInfo}</p>}
            <div className="mb-5">
              <label className="text-[#6b7280] text-xs mb-1 block">{t.settings.newEmail}</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEmail()}
                placeholder={t.settings.newEmailPlaceholder}
                className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#e91e8c]/40"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm"
              >
                {emailInfo ? t.common.close : t.common.cancel}
              </button>
              <button
                onClick={saveEmail}
                disabled={emailSaving || !newEmail.trim()}
                className="flex-1 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
              >
                {emailSaving ? t.settings.sending : t.settings.sendConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hesap Silme Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-t-3xl p-6" style={{ background: "#1a0e2a" }}>
            <h2 className="text-white font-bold text-lg mb-2">{t.settings.deleteTitle}</h2>
            <p className="text-[#9ca3af] text-sm mb-3 leading-relaxed">
              {t.settings.deleteDesc}
            </p>
            <p className="text-[#6b7280] text-xs mb-5 leading-relaxed">
              {t.settings.deleteNote}
            </p>
            {deleteError && <p className="text-red-400 text-sm mb-3">{deleteError}</p>}
            <div className="mb-5">
              <label className="text-[#6b7280] text-xs mb-1 block">
                {t.settings.deleteConfirmPrefix} <span className="text-white font-semibold">{DELETE_CONFIRM_PHRASE}</span> {t.settings.deleteConfirmSuffix}
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-red-500/40"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm disabled:opacity-60"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting || !deleteConfirm.trim()}
                className="flex-1 py-3 rounded-xl font-bold text-white text-sm bg-red-600 disabled:opacity-60"
              >
                {deleting ? t.settings.deleting : t.settings.deleteButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
