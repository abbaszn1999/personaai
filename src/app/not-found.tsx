export default function NotFound() {
  return (
    <iframe
      src="/lamp"
      title="Page not found"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        zIndex: 50,
        background: "#050607",
      }}
    />
  );
}
