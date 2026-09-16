import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

/**
 * Parol ekrani — server DASHBOARD_PASSWORD yoqgan bo'lsa, /api/* 401 qaytarganda
 * ko'rsatiladi. Muvaffaqiyatli loginda cookie o'rnatiladi va dashboard ochiladi.
 */
export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        onLoggedIn();
        return;
      }
      setError(data.error ?? "Parol noto'g'ri");
    } catch {
      setError("Server bilan aloqa yo'q — birozdan so'ng qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(380px, 100%)",
          padding: "28px 28px 24px",
          textAlign: "center",
        }}
      >
        <span
          className="brand-mark"
          style={{ margin: "0 auto 14px", width: 44, height: 44, borderRadius: 13 }}
        >
          <ShieldCheck size={20} strokeWidth={2.2} />
        </span>
        <h1 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
          SOF·EXPO Command Center
        </h1>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          Bu dashboard parol bilan himoyalangan. Ma'lumotlarni ko'rish uchun
          parolni kiriting.
        </p>
        <form onSubmit={submit}>
          <div
            className="cmdk-input"
            style={{ marginBottom: 10, cursor: "text" }}
          >
            <KeyRound size={14} />
            <input
              type="password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Parol"
              autoFocus
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          {error && (
            <div
              className="chip risk"
              style={{ display: "flex", width: "100%", justifyContent: "center", marginBottom: 10 }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            className="primary-btn"
            disabled={busy || !password.trim()}
            style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
          >
            {busy ? "Tekshirilmoqda…" : "Kirish"}
          </button>
        </form>
      </div>
    </div>
  );
}
