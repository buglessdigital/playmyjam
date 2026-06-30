export default function TokensLoading() {
  return (
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px" }}>
        <div style={{ height: 24, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.1)" }} className="animate-pulse" />
      </div>

      <div style={{ padding: "0 20px" }}>
        <div style={{ height: 80, borderRadius: 20, background: "rgba(255,255,255,0.06)", marginBottom: 24 }} className="animate-pulse" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 110, borderRadius: 18, background: "#1a0e2a" }} className="animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
