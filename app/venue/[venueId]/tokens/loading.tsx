export default function TokensLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ height: 36, width: 36, borderRadius: 999, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
        <div style={{ height: 22, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
      </div>

      <div style={{ padding: "0 20px" }}>
        <div style={{ height: 108, borderRadius: 24, background: "rgba(255,255,255,0.06)", marginBottom: 28 }} className="animate-pulse" />

        <div style={{ height: 12, width: 80, borderRadius: 6, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} className="animate-pulse" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 148, borderRadius: 16, background: "#1a0e2a" }} className="animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
