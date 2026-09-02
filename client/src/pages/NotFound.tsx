import { Compass, LayoutDashboard } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div
      className="panel"
      style={{
        textAlign: "center",
        padding: "56px 24px",
        maxWidth: 520,
        margin: "40px auto",
      }}
    >
      <span
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--accent-soft)",
          color: "var(--accent)",
          marginBottom: 16,
        }}
      >
        <Compass size={26} />
      </span>
      <h1
        style={{
          margin: "0 0 6px",
          fontSize: 30,
          fontWeight: 750,
          letterSpacing: "-0.02em",
        }}
      >
        404
      </h1>
      <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 650 }}>
        Sahifa topilmadi
      </h2>
      <p
        style={{
          color: "var(--text-2)",
          fontSize: 12.5,
          lineHeight: 1.6,
          margin: "0 0 18px",
        }}
      >
        Bunday sahifa yo'q. Chapdagi menyudan kerakli bo'limni tanlang yoki ⌘K
        (Ctrl+K) bilan qidiring.
      </p>
      <Link href="/" className="primary-btn" style={{ display: "inline-flex" }}>
        <LayoutDashboard size={14} /> Umumiy natijalarga qaytish
      </Link>
    </div>
  );
}
