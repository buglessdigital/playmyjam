export default function ProfileLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%", paddingBottom: 112 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "68px 20px 32px" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
        <div style={{ height: 22, width: 160, borderRadius: 8, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
        <div style={{ height: 13, width: 130, borderRadius: 8, background: "rgba(255,255,255,0.06)", marginTop: -8 }} className="animate-pulse" />
      </div>

      <div style={{ margin: "0 20px 28px", height: 92, borderRadius: 16, background: "rgba(255,255,255,0.05)" }} className="animate-pulse" />

      <div style={{ margin: "0 20px" }}>
        <div style={{ height: 12, width: 60, borderRadius: 6, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} className="animate-pulse" />
        <div style={{ height: 217, borderRadius: 16, background: "rgba(255,255,255,0.05)", marginBottom: 16 }} className="animate-pulse" />
        <div style={{ height: 73, borderRadius: 16, background: "rgba(239,68,68,0.05)" }} className="animate-pulse" />
      </div>
    </div>
  );
}
