export default function MapLoading() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-0 animate-pulse"
      style={{
        bottom: "calc(4rem + var(--pmj-request-bar, 0px))",
        background: "radial-gradient(120% 80% at 50% 40%, #1b1030 0%, #0f0a18 70%)",
      }}
    />
  );
}
