export default function RequestsLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px" }}>
        <div style={{ height: 24, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
      </div>

      <div style={{ padding: "0 20px 120px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, background: "#1a0e2a" }} className="animate-pulse">
            <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 14, width: "65%", borderRadius: 6, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ height: 12, width: "40%", borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
            </div>
            <div style={{ width: 50, height: 20, borderRadius: 10, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
