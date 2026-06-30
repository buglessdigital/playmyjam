export default function ProfileLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%", paddingBottom: 100 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "72px 20px 32px" }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} className="animate-pulse" />
        <div style={{ height: 20, width: 160, borderRadius: 8, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
        <div style={{ height: 13, width: 120, borderRadius: 8, background: "rgba(255,255,255,0.06)" }} className="animate-pulse" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 20px 24px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 88, borderRadius: 18, background: "rgba(255,255,255,0.05)" }} className="animate-pulse" />
        ))}
      </div>

      <div style={{ margin: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 18, background: "rgba(255,255,255,0.05)" }} className="animate-pulse" />
        ))}
      </div>
    </div>
  );
}
