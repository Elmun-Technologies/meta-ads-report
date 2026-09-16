/**
 * «Ulash» oynasi — platformani ulashning IKKI yo'li bir joyda.
 *
 * Nega kerak: ilgari tugma faqat .env da app kalitlari bo'lsa ishlardi, aks holda
 * `disabled` turardi — foydalanuvchi tugmani bosolmas, nima qilishni ham bilmas edi.
 * Endi tugma har doim bosiladi va shu oyna ochiladi:
 *
 *   1) «App kalitlari»  — kalitlar UI'dan kiritiladi, serverga (store.json) yoziladi.
 *      Serverni qayta ishga tushirish shart emas: saqlagach tugma darhol ishlaydi.
 *   2) «Token bilan ulash» — app yaratmasdan, tayyor token bilan hisob ulanadi
 *      (Meta System User tokeni, Google refresh token, AmoCRM API kaliti).
 *
 * Har ikki yo'l ham serverda TEKSHIRILADI: kalit noto'g'ri bo'lsa aniq xato qaytadi.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { OAUTH_SETUP, type OAuthPlatformId } from "@shared/oauthSetup";
import type { OAuthAppStatus } from "@shared/types";

export type SetupTab = "keys" | "token";

export interface ConnectSetupProps {
  platform: OAuthPlatformId;
  tab: SetupTab;
  status: OAuthAppStatus | null;
  onClose: () => void;
  /** App kalitlari saqlangach — holatni yangilash */
  onSaved: () => void | Promise<void>;
  /** Token bilan ulanish muvaffaqiyatli bo'lgach */
  onConnected: () => void | Promise<void>;
}

async function postJson(url: string, body: unknown): Promise<{ ok?: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `Server xatosi (${res.status})`);
  return data as { ok?: boolean; error?: string };
}

function TextInput({
  label,
  help,
  value,
  onChange,
  placeholder,
  secret,
  multiline,
  savedMask,
  missing,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
  /** Avval saqlangan qiymat niqobi — "bo'sh qoldirsangiz o'zgarmaydi" */
  savedMask?: string;
  missing?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label className="setup-field" htmlFor={id}>
      <span className="sf-label">
        {label}
        {missing && <em className="sf-missing">kerak</em>}
        {savedMask && !value && <em className="sf-saved">saqlangan: {savedMask}</em>}
      </span>
      <span className="sf-input">
        {multiline ? (
          <textarea
            id={id}
            rows={3}
            value={value}
            placeholder={placeholder ?? (savedMask ? "o'zgartirish uchun yangi qiymat qo'ying" : "")}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <input
            id={id}
            type={secret && !reveal ? "password" : "text"}
            value={value}
            placeholder={placeholder ?? (savedMask ? "o'zgartirish uchun yangi qiymat qo'ying" : "")}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        )}
        {secret && (
          <button
            type="button"
            className="sf-eye"
            onClick={() => setReveal(r => !r)}
            title={reveal ? "Yashirish" : "Ko'rsatish"}
          >
            {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </span>
      <small className="sf-help">{help}</small>
    </label>
  );
}

function Steps({ items, color }: { items: string[]; color: string }) {
  return (
    <ol className="setup-steps">
      {items.map((s, i) => (
        <li key={i}>
          <span className="ss-num" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function ConnectSetup({ platform, tab, status, onClose, onSaved, onConnected }: ConnectSetupProps) {
  const spec = OAUTH_SETUP[platform];
  const [active, setActive] = useState<SetupTab>(tab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [redirectUri, setRedirectUri] = useState<string>("");

  /* Redirect URI — provider sozlamasiga yoziladi (host shu yerdan olinadi) */
  useEffect(() => {
    let alive = true;
    fetch("/api/oauth/apps/redirect-uris")
      .then(r => (r.ok ? r.json() : null))
      .then((d: { uris?: Record<string, string> } | null) => {
        if (alive && d?.uris) setRedirectUri(d.uris[platform] ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [platform]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = useCallback(async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} nusxalandi`);
    } catch {
      toast.error("Nusxalab bo'lmadi — qo'lda belgilab oling");
    }
  }, []);

  const filledKeys = useMemo(
    () => Object.entries(keys).filter(([, v]) => v.trim().length > 0),
    [keys]
  );
  const manualFields = spec.manual?.fields ?? [];
  const filledManual = useMemo(
    () =>
      manualFields.filter(f => {
        const v = (manualValues[f.key] ?? "").trim();
        return f.optional ? v.length > 0 : v.length > 0;
      }),
    [manualFields, manualValues]
  );
  const manualMissing = manualFields.filter(
    f => !f.optional && !(manualValues[f.key] ?? "").trim()
  );

  const saveKeys = async () => {
    if (filledKeys.length === 0) {
      setError("Kamida bitta maydonni to'ldiring");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of filledKeys) body[k] = v.trim();
      const res = await postJson(`/api/oauth/apps/${platform}`, body);
      const st = (res as { status?: OAuthAppStatus }).status;
      if (st?.ready) {
        toast.success(`${spec.name} kalitlari saqlandi — endi «${spec.button}» ishlaydi`);
      } else {
        toast.warning("Saqlandi, lekin hali ham maydon yetishmayapti", {
          description: st?.missing.map(m => m.label).join(", "),
        });
      }
      setKeys({});
      await onSaved();
      if (st?.ready) setActive("keys");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error("Kalitlarni saqlab bo'lmadi", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const clearKeys = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/oauth/apps/${platform}`, { method: "DELETE" });
      toast.success("Saqlangan kalitlar o'chirildi");
      await onSaved();
    } catch {
      toast.error("O'chirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  const connectWithToken = async () => {
    if (manualMissing.length > 0) {
      setError(`To'ldirish kerak: ${manualMissing.map(m => m.label).join(", ")}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const f of filledManual) body[f.key] = (manualValues[f.key] ?? "").trim();
      const res = await postJson(`/api/oauth/${platform}/token`, body);
      const accounts = Array.isArray((res as { accounts?: unknown[] }).accounts)
        ? ((res as { accounts: unknown[] }).accounts.length as number)
        : 0;
      const warning = (res as { warning?: string }).warning;
      toast.success(`${spec.name} ulandi`, {
        description: warning ?? (accounts > 0 ? `${accounts} kabinet topildi — ma'lumot tortilmoqda` : "Ma'lumot hozir tortiladi"),
      });
      setManualValues({});
      await onConnected();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error("Ulanmadi", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = () => {
    if (platform === "amocrm") {
      toast.info("AmoCRM uchun subdomenni kiriting", {
        description: "Oynani yopib, kartadagi subdomain maydonini to'ldiring — keyin tugma ishlaydi.",
      });
      onClose();
      return;
    }
    window.location.href = `/api/oauth/${platform}/start`;
  };

  return (
    <div className="setup-overlay" onClick={onClose} role="presentation">
      <div
        className="setup-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${spec.name} ulash`}
      >
        <div className="setup-head">
          <span className="conn-logo" style={{ background: spec.color, width: 32, height: 32 }}>
            {spec.logo}
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{spec.name} — ulash</b>
            <small>
              {status?.ready
                ? `App kalitlari tayyor (${status.source === "env" ? ".env" : "server"})`
                : `Yetishmayapti: ${status?.missing.map(m => m.label).join(", ") || "—"}`}
            </small>
          </div>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} title="Yopish">
            <X size={15} />
          </button>
        </div>

        <div className="setup-tabs">
          <button
            className={`setup-tab ${active === "keys" ? "on" : ""}`}
            onClick={() => {
              setActive("keys");
              setError(null);
            }}
          >
            <KeyRound size={13} /> App kalitlari
            {status?.ready && <i className="dot-ok" />}
          </button>
          {spec.manual && (
            <button
              className={`setup-tab ${active === "token" ? "on" : ""}`}
              onClick={() => {
                setActive("token");
                setError(null);
              }}
            >
              <KeyRound size={13} /> Token bilan ulash
            </button>
          )}
        </div>

        <div className="setup-body">
          {active === "keys" ? (
            <>
              {!status?.ready && (
                <div className="setup-note warn">
                  <TriangleAlert size={14} />
                  <span>{status?.reason ?? "App kalitlari kiritilmagan — quyidagi maydonlarni to'ldiring."}</span>
                </div>
              )}
              {status?.ready && (
                <div className="setup-note good">
                  <Check size={14} />
                  <span>
                    Kalitlar tayyor — «{spec.button}» tugmasi ishlaydi. Qiymatlar{" "}
                    <b>{status.source === "env" ? ".env dan" : status.source === "store" ? "shu oynadan kiritilgan" : ".env + oynadan"}</b>{" "}
                    olingan.
                  </span>
                </div>
              )}

              <Steps items={spec.appSteps} color={spec.color} />

              {redirectUri && (
                <div className="setup-uri">
                  <span>Redirect URI (provider sozlamasiga yoziladi)</span>
                  <code>{redirectUri}</code>
                  <button className="tf-btn" type="button" onClick={() => void copy(redirectUri, "Redirect URI")}>
                    <Copy size={12} /> Nusxa
                  </button>
                </div>
              )}

              <div className="setup-fields">
                {spec.appFields.map(f => (
                  <TextInput
                    key={f.key}
                    label={f.label + (f.optional ? " (ixtiyoriy)" : "")}
                    help={f.help}
                    placeholder={f.placeholder}
                    secret={f.secret}
                    value={keys[f.key] ?? ""}
                    onChange={v => setKeys(s => ({ ...s, [f.key]: v }))}
                    savedMask={status?.values?.[f.key]}
                    missing={Boolean(status?.missing.some(m => m.key === f.key))}
                  />
                ))}
              </div>

              {spec.docs && (
                <a className="setup-link" href={spec.docs.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} /> {spec.docs.label}
                </a>
              )}

              {error && <div className="setup-error">{error}</div>}

              <div className="setup-actions">
                <button className="primary-btn" type="button" onClick={() => void saveKeys()} disabled={busy}>
                  {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Kalitlarni saqlash
                </button>
                {status?.ready && (
                  <button className="primary-btn" type="button" onClick={startOAuth} disabled={busy}>
                    {spec.button}
                  </button>
                )}
                {(status?.source === "store" || status?.source === "mixed") && (
                  <button className="tf-btn" type="button" onClick={() => void clearKeys()} disabled={busy}>
                    Saqlanganni o'chirish
                  </button>
                )}
              </div>
              <small className="setup-foot">
                Kalitlar faqat serverda (server/data/store.json) saqlanadi — browserga qaytmaydi,
                bu oynada niqoblangan ko'rinishi ko'rinadi.
              </small>
            </>
          ) : (
            spec.manual && (
              <>
                <div className="setup-note">
                  <KeyRound size={14} />
                  <span>{spec.manual.hint}</span>
                </div>
                <Steps items={spec.manual.steps} color={spec.color} />
                <div className="setup-fields">
                  {spec.manual.fields.map(f => (
                    <TextInput
                      key={f.key}
                      label={f.label}
                      help={f.help}
                      placeholder={f.placeholder}
                      secret={f.secret}
                      multiline={f.multiline}
                      value={manualValues[f.key] ?? ""}
                      onChange={v => setManualValues(s => ({ ...s, [f.key]: v }))}
                      missing={!f.optional && !(manualValues[f.key] ?? "").trim()}
                    />
                  ))}
                </div>
                {error && <div className="setup-error">{error}</div>}
                <div className="setup-actions">
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => void connectWithToken()}
                    disabled={busy || manualMissing.length > 0}
                  >
                    {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Tekshirish va ulash
                  </button>
                  <button className="tf-btn" type="button" onClick={onClose} disabled={busy}>
                    Bekor qilish
                  </button>
                </div>
                <small className="setup-foot">
                  Token serverda tekshiriladi (haqiqiy API so'rovi) va shu yerga saqlanadi —
                  ma'lumot har {Math.round(300 / 60)} daqiqada avtomatik yangilanadi.
                </small>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
