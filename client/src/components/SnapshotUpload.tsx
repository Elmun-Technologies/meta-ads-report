/**
 * Eksport faylni browser'dan yuklash.
 *
 * Nega kerak: hosting'da (Vercel/Railway) `server/data/snapshots/` papkasiga qo'lda
 * fayl tashlashning iloji yo'q (SSH yo'q). Shu panel orqali istalgan platformaning
 * eksport JSON'i yuklanadi — fayl yozilgach server uni darhol normalizatsiya qiladi,
 * fs.watch sezadi va barcha ochiq dashboardlar SSE orqali yangilanadi.
 *
 * Fayl YOZILISHDAN OLDIN tekshiriladi: format tanilmasa yoki ma'lumot bo'sh bo'lsa
 * aniq xato qaytadi, papkaga buzilgan fayl tushmaydi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Trash2, UploadCloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { SnapshotInfo } from "@shared/types";
import { dateLabel } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";

const NAMING: { prefix: string; platform: string; example: string }[] = [
  { prefix: "meta_", platform: "Meta Ads", example: "meta_act-123456789_2026-09.json" },
  { prefix: "google_", platform: "Google Ads", example: "google_123-456-7890_2026-09.json" },
  { prefix: "yandex_", platform: "Yandex Direct", example: "yandex_login_2026-09.json" },
  { prefix: "amo_", platform: "AmoCRM (leadlar)", example: "amo_sofexpo_2026-09.json" },
];

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta Ads",
  "google-ads": "Google Ads",
  "yandex-direct": "Yandex Direct",
  amocrm: "AmoCRM",
  telegram: "Telegram",
  offline: "Offline",
  all: "Jami",
};

interface FilesResponse {
  dir: string;
  writable: boolean;
  files: SnapshotInfo[];
}

function summaryText(summary: Record<string, unknown> | undefined, platform: string): string {
  if (!summary) return "";
  const parts: string[] = [];
  if (typeof summary.campaigns === "number") parts.push(`${summary.campaigns} kampaniya`);
  if (typeof summary.creatives === "number") parts.push(`${summary.creatives} kreativ`);
  if (typeof summary.leads === "number") parts.push(`${summary.leads} lead`);
  if (typeof summary.matched === "number") parts.push(`${summary.matched} bog'langan`);
  if (typeof summary.spend === "number") parts.push(`sarf ${Number(summary.spend).toFixed(2)}`);
  if (typeof summary.account === "string" && summary.account) parts.push(summary.account);
  return parts.length ? parts.join(" · ") : platform;
}

export function SnapshotUpload() {
  const { refresh } = useDashboardContext();
  const [data, setData] = useState<FilesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshots/all", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      setData((await res.json()) as FilesResponse);
    } catch {
      /* server javob bermasa — panel bo'sh qoladi */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(file.name);
    try {
      const text = await file.text();
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, content: text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        file?: string;
        platform?: string;
        replaced?: boolean;
        summary?: Record<string, unknown>;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? `Yuklab bo'lmadi (${res.status})`, { duration: 9000 });
        return;
      }
      toast.success(`${body.replaced ? "Yangilandi" : "Yuklandi"}: ${body.file}`, {
        description: summaryText(body.summary, PLATFORM_LABEL[body.platform ?? ""] ?? ""),
        duration: 7000,
      });
      await load();
      await refresh();
    } catch (err) {
      toast.error("Faylni o'qib bo'lmadi", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    for (const f of Array.from(list)) {
      if (!/\.json$/i.test(f.name)) {
        toast.error(`${f.name} — faqat .json fayllar qabul qilinadi`);
        continue;
      }
      void upload(f);
    }
  };

  const remove = async (name: string) => {
    setBusy(name);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(name)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) toast.error(body.error ?? "O'chirib bo'lmadi");
      else toast.success(`O'chirildi: ${name}`);
      await load();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const files = data?.files ?? [];

  return (
    <div className="panel" style={{ padding: "16px 20px" }}>
      <div
        className="upload-zone"
        onDragOver={e => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          onFiles(e.dataTransfer?.files ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        data-drag={drag ? "1" : "0"}
      >
        <UploadCloud size={20} />
        <div>
          <b>Eksport faylni bu yerga tashlang yoki tanlash uchun bosing</b>
          <small>
            Fayl serverda tekshiriladi (format + ma'lumot), so'ng snapshot papkasiga yoziladi —
            dashboard darhol yangilanadi.
          </small>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          style={{ display: "none" }}
          onChange={e => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {data && !data.writable && (
        <div className="setup-note warn" style={{ marginTop: 10 }}>
          <FileUp size={14} />
          <span>
            Server snapshot papkasiga yoza olmaydi (read-only disk / serverless rejim). Uzoq
            muddatli server rejimida ishga tushiring yoki <b>SNAPSHOTS_DIR</b> ni yoziladigan
            papkaga (volume) sozlang.
          </span>
        </div>
      )}

      <div className="upload-naming">
        {NAMING.map(n => (
          <span key={n.prefix}>
            <code>{n.prefix}…</code> {n.platform} <em>{n.example}</em>
          </span>
        ))}
      </div>

      {files.length > 0 && (
        <div className="upload-list">
          <div className="ul-head">
            <span>Papkadagi fayllar ({files.length})</span>
            <button className="tf-btn" onClick={() => void load()} disabled={Boolean(busy)}>
              <RefreshCw size={12} className={busy ? "spin" : ""} /> Yangilash
            </button>
          </div>
          {files.map(f => (
            <div className="ul-row" key={f.file}>
              <span className="chip muted" style={{ flex: "none" }}>
                {f.kind === "crm" ? "AmoCRM" : (PLATFORM_LABEL[f.platform] ?? f.platform)}
              </span>
              <span className="ul-name" title={f.file}>
                {f.file}
              </span>
              <span className="ul-meta">{f.accountName}</span>
              <span className="ul-meta">{f.periodLabel}</span>
              <span className="ul-meta">{dateLabel(f.syncedAt)}</span>
              <button
                className="icon-btn"
                title="Faylni o'chirish"
                disabled={busy === f.file}
                onClick={() => void remove(f.file)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
