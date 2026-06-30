export default function SongDetailLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 20px 0" }}>
        <div style={{ width: 240, height: 240, borderRadius: 16, background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
        <div style={{ height: 22, width: 200, borderRadius: 8, background: "rgba(255,255,255,0.1)", marginTop: 24 }} className="animate-pulse" />
        <div style={{ height: 15, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.06)", marginTop: 10 }} className="animate-pulse" />
        <div style={{ height: 48, width: "100%", maxWidth: 360, borderRadius: 14, background: "rgba(255,255,255,0.06)", marginTop: 28 }} className="animate-pulse" />
      </div>
    </div>
  );
}
