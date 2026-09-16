/**
 * Dashboard live-data hook:
 *   - /api/snapshot + /api/connections + /api/crm olinadi
 *   - /api/stream (SSE) ga obuna — server yangi snapshot tushsa UI avtomatik yangilanadi:
 *       · sync     → ma'lumot qayta o'qiladi
 *       · activity → "Jonli harakat" feed'ga hodisa qo'shiladi (+toast)
 *       · sync_state → sync dvigatelining holati (keyingi sync vaqti, natijalar)
 *   - SSE ishlamasa 30s polling fallback
 *   - Tab fokusga qaytganda darhol yangilanadi (visibilitychange)
 *
 * Muhim: API javob bermasa (Vercel'da serverless funksiya ishlamasa, deployment
 * protection yoki boshqa sabab) — build vaqtida yaratilgan statik
 * /data/bootstrap.json faylidan o'qiydi. Shunda UI hech qachon bo'sh qolmaydi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { desktopNotify } from "./notify";
import type {
  ActivityEvent,
  ConnectionInfo,
  CrmData,
  NormalizedSnapshot,
  PlatformId,
  SnapshotInfo,
  SyncState,
} from "@shared/types";

export type DataSource = "api" | "static";

export interface DashboardState {
  snapshot: NormalizedSnapshot | null;
  connections: ConnectionInfo[];
  crm: CrmData | null;
  crmConnected: boolean;
  /** Mavjud kabinet/davr snapshotlari (fayl ro'yxati) */
  snapshots: SnapshotInfo[];
  /** Tanlangan snapshot fayli (null = eng yangi) */
  snapshotFile: string | null;
  setSnapshotFile: (file: string | null) => void;
  /** Tanlangan platforma (file tanlanmagan bo'lsa shu platformaning eng yangi snapshoti ko'rsatiladi) */
  platform: PlatformId;
  setPlatform: (platform: PlatformId) => void;
  loading: boolean;
  syncing: boolean;
  /** Haqiqiy manbalardan tortish (POST /api/sync) ishlab turibdi */
  syncRunning: boolean;
  error: string | null;
  /** Server parol so'rayapti — LoginScreen ko'rsatiladi */
  authRequired: boolean;
  /** Login muvaffaqiyatli bo'lgach — true (LoginScreen yopiladi) */
  onLoggedIn: () => void;
  live: boolean;
  lastEventAt: string | null;
  /** Sync dvigateli holati — interval, keyingi sync, natijalar */
  syncState: SyncState | null;
  /** Jonli harakat feed'i — sync, yangi leadlar, webhooklar */
  activity: ActivityEvent[];
  /** "api" — serverdan, "static" — build vaqtidagi fayldan */
  source: DataSource;
  refresh: () => Promise<void>;
  /** Haqiqiy sync — serverdan barcha manbalarni hoziroq tortishini so'raydi */
  syncNow: () => Promise<void>;
}

/** JSON kafolati bilan o'qish: HTML (404 sahifa / Vercel SSO login) kelsa xato beradi */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    if (type.includes("application/json")) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body?.error) message = body.error;
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (!type.includes("application/json"))
    throw new Error("Javob JSON formatida emas (HTML?)");
  return (await res.json()) as T;
}

export function useDashboard(): DashboardState {
  const [snapshot, setSnapshot] = useState<NormalizedSnapshot | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [crm, setCrm] = useState<CrmData | null>(null);
  const [crmConnected, setCrmConnected] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshotFile, setSnapshotFile] = useState<string | null>(null);
  const [platform, setPlatformState] = useState<PlatformId>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState<DataSource>("api");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(
    async (showSync = true, file = snapshotFile, plat = platform) => {
      if (showSync) setSyncing(true);
      try {
        const snapUrl = file
          ? `/api/snapshot?file=${encodeURIComponent(file)}`
          : `/api/snapshot?platform=${encodeURIComponent(plat)}`;
        // 401 (parol) holatini alohida ushlaymiz — statik zaxiraga O'TMAYMIZ,
        // aks holda parol himoyasi chetlab o'tilgan bo'lardi.
        let snapStatus: number | null = null;
        const [snapRes, connRes, crmRes, snapsRes, syncRes, actRes] = await Promise.all([
          fetchJson<NormalizedSnapshot>(snapUrl).catch(err => {
            snapStatus = (err as { status?: number })?.status ?? null;
            return null;
          }),
          fetchJson<ConnectionInfo[]>("/api/connections").catch(() => []),
          fetchJson<{ connected?: boolean } & CrmData>("/api/crm").catch(
            () => null
          ),
          fetchJson<SnapshotInfo[]>("/api/snapshots").catch(() => []),
          fetchJson<SyncState>("/api/sync").catch(() => null),
          fetchJson<{ events: ActivityEvent[] }>("/api/activity?limit=30").catch(
            () => null
          ),
        ]);

        if (!snapRes) {
          if (snapStatus === 401) {
            // Parol talab qilinadi — LoginScreen ko'rsatamiz, xato emas
            setAuthRequired(true);
            setError(null);
            return;
          }
          throw new Error("API javob bermadi");
        }
        setAuthRequired(false);
        setSnapshot(snapRes);
        setConnections(connRes);
        if (crmRes?.connected) {
          setCrm(crmRes as CrmData);
          setCrmConnected(true);
        } else {
          setCrm(null);
          setCrmConnected(false);
        }
        if (Array.isArray(snapsRes)) setSnapshots(snapsRes);
        if (syncRes) setSyncState(syncRes);
        if (actRes?.events?.length) setActivity(actRes.events);
        setSource("api");
        setError(null);
      } catch (err) {
        // API ishlamadi — build vaqtidagi statik faylga o'tamiz
        try {
          const boot = await fetchJson<{
            snapshot: NormalizedSnapshot;
            snapshotsByPlatform?: Partial<Record<PlatformId, NormalizedSnapshot>>;
            connections: ConnectionInfo[];
            snapshots: SnapshotInfo[];
            crm: CrmData | null;
          }>("/data/bootstrap.json");
          const targetPlatform = file
            ? boot.snapshots?.find(s => s.file === file)?.platform ?? plat
            : plat;
          setSnapshot(boot.snapshotsByPlatform?.[targetPlatform] ?? boot.snapshot);
          setConnections(boot.connections ?? []);
          setSnapshots(Array.isArray(boot.snapshots) ? boot.snapshots : []);
          if (boot.crm) {
            setCrm(boot.crm);
            setCrmConnected(true);
          } else {
            setCrm(null);
            setCrmConnected(false);
          }
          setSource("static");
          setError(null);
        } catch {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [snapshotFile, platform]
  );

  useEffect(() => {
    void load(false);

    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!poll) poll = setInterval(() => void load(false), 30000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    try {
      const es = new EventSource("/api/stream");
      esRef.current = es;
      // Faqat obuna bo'lgandan KEYIN ro'y bergan hodisalarga toast chiqaramiz —
      // server ulanishda oxirgi hodisalarni qayta yuboradi (feed uchun), ular
      // jimgina qoladi.
      const subscribedAt = Date.now();
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("ping", () => setLive(true));
      es.addEventListener("sync", ev => {
        let at = new Date().toISOString();
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          at = data.at ?? at;
        } catch {
          /* ignore */
        }
        setLastEventAt(at);
        void load(false);
      });
      es.addEventListener("sync_state", ev => {
        try {
          setSyncState(JSON.parse((ev as MessageEvent).data));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("activity", ev => {
        try {
          const event = JSON.parse((ev as MessageEvent).data) as ActivityEvent;
          setActivity(prev =>
            prev.some(p => p.id === event.id) ? prev : [event, ...prev].slice(0, 60)
          );
          // Real-time bildirishnoma — faqat yangi hodisalar uchun
          if (new Date(event.at).getTime() > subscribedAt - 2000) {
            if (event.kind === "lead") {
              toast.success(event.title, {
                description: event.body,
                duration: 6000,
              });
              desktopNotify(`Yangi murojaat: ${event.title.replace("Yangi murojaat: ", "")}`, event.body);
            } else if (event.kind === "stage") {
              toast.info(event.title, { description: event.body, duration: 5000 });
            } else if (event.kind === "error") {
              toast.error(event.title, { description: event.body, duration: 8000 });
              desktopNotify(event.title, event.body);
            } else if (
              event.tone === "risk" ||
              (event.tone === "warn" && event.kind !== "sync")
            ) {
              desktopNotify(event.title, event.body);
            }
          }
        } catch {
          /* ignore */
        }
      });
      es.onopen = () => {
        setLive(true);
        stopPolling();
      };
      es.onerror = () => {
        setLive(false);
        startPolling();
      };
    } catch {
      startPolling();
    }

    // Tab fokusga qaytdi — darhol yangilaymiz (odam qaytib kelganda yangi raqam ko'rsin)
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      esRef.current?.close();
    };
  }, [load]);

  /** Login muvaffaqiyatli — ekranni ochib, ma'lumotni qayta yuklaymiz */
  const handleLoggedIn = useCallback(() => {
    setAuthRequired(false);
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      /* boshqa clientlarga push muhim emas */
    }
  }, [load]);

  /** Haqiqiy sync — server barcha sozlangan manbalardan (Meta/Google/Telegram) hoziroq tortadi */
  const syncNow = useCallback(async () => {
    setSyncRunning(true);
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch {
      /* serverless yoki vaqtinchalik xato — baribir load qilamiz */
    } finally {
      await load(false);
      setSyncRunning(false);
    }
  }, [load]);

  const selectFile = useCallback(
    (file: string | null) => {
      setSnapshotFile(file);
      void load(true, file);
    },
    [load]
  );

  const selectPlatform = useCallback(
    (plat: PlatformId) => {
      setPlatformState(plat);
      setSnapshotFile(null);
      void load(true, null, plat);
    },
    [load]
  );

  return {
    snapshot,
    connections,
    crm,
    crmConnected,
    snapshots,
    snapshotFile,
    setSnapshotFile: selectFile,
    platform,
    setPlatform: selectPlatform,
    loading,
    syncing,
    syncRunning,
    error,
    authRequired,
    onLoggedIn: handleLoggedIn,
    live,
    lastEventAt,
    syncState,
    activity,
    source,
    refresh,
    syncNow,
  };
}
