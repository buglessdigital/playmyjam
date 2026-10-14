export default function ProfileLoading() {
  const block = (style: React.CSSProperties) => (
    <div style={{ background: "rgb(var(--pmj-ink-rgb) / 0.07)", ...style }} className="animate-pulse" />
  );
  return (
    <div style={{ background: "var(--pmj-bg)", minHeight: "100dvh", width: "100%", padding: "56px 20px 112px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {block({ width: 68, height: 68, borderRadius: "50%", flexShrink: 0 })}
        <div style={{ flex: 1 }}>
          {block({ height: 26, width: 160, borderRadius: 8 })}
          {block({ height: 14, width: 190, borderRadius: 8, marginTop: 8 })}
        </div>
      </div>
      {block({ height: 124, borderRadius: 24, marginTop: 28 })}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        {block({ height: 112, borderRadius: 16 })}
        {block({ height: 112, borderRadius: 16 })}
      </div>
      {block({ height: 18, width: 150, borderRadius: 6, marginTop: 36 })}
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {block({ height: 112, width: 112, borderRadius: 12, flexShrink: 0 })}
        {block({ height: 112, width: 112, borderRadius: 12, flexShrink: 0 })}
        {block({ height: 112, width: 112, borderRadius: 12, flexShrink: 0 })}
      </div>
    </div>
  );
}
