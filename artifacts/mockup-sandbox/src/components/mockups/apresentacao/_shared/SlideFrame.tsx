export function SlideFrame({ children, pageNum, totalPages = 5 }: { children: React.ReactNode; pageNum?: number; totalPages?: number }) {
  return (
    <div style={{
      width: "100vw",
      minHeight: "100vh",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: "linear-gradient(90deg, #1a1a1a 0%, #4a4a4a 50%, #1a1a1a 100%)",
      }} />
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        background: "linear-gradient(90deg, #1a1a1a 0%, #4a4a4a 50%, #1a1a1a 100%)",
      }} />
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: 6,
        background: "linear-gradient(180deg, #1a1a1a 0%, #4a4a4a 50%, #1a1a1a 100%)",
      }} />
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 6,
        background: "linear-gradient(180deg, #1a1a1a 0%, #4a4a4a 50%, #1a1a1a 100%)",
      }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "40px 48px", position: "relative", zIndex: 1 }}>
        {children}
      </div>

      {pageNum && (
        <div style={{
          position: "absolute",
          bottom: 20,
          right: 32,
          fontFamily: "'Montserrat', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: "#b0b0b0",
          letterSpacing: "0.1em",
          zIndex: 2,
        }}>
          {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
        </div>
      )}
    </div>
  );
}
