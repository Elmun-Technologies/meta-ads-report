/**
 * Dashboard live-data hook:
 *   - /api/snapshot + /api/connections olinadi
 *   - /api/stream (SSE) ga obuna — server yangi snapshot tushsa UI avtomatik yangilanadi
 *   - SSE ishlamasa 60s polling fallback
 *
 * Muhim: API javob bermasa (Vercel'da serverless funksiya ishlamasa, deployment
 * protection yoki boshqa sabab) — build vaqtida yaratilgan statik
 * /data/bootstrap.json faylidan o'qiydi. Shunda UI hech qachon bo'sh qolmaydi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionInfo,
  CrmData,
  NormalizedSnapshot,
  PlatformId,
  SnapshotInfo,
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
  error: string | null;
  live: boolean;
  lastEventAt: string | null;
  /** "api" — serverdan, "static" — build vaqtidagi fayldan */
  source: DataSource;
  refresh: () => Promise<void>;
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
    throw new Error(message);
  }
  if (!type.includes("application/json"))
    throw new Error("JSON emas javob (HTML?)");
  return (await res.json()) as T;
}

export function useDashboard(): DashboardState {
  const [snapshot, setSnapshot] = useState<NormalizedSnapshot | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [crm, setCrm] = useState<CrmData | null>(null);
  const [crmConnected, setCrmConnected] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshotFile, setSnapshotFile] = useState<string | null>(null);
  const [platform, setPlatformState] = useState<PlatformId>("meta");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState<DataSource>("api");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(
    async (showSync = true, file = snapshotFile, plat = platform) => {
      if (showSync) setSyncing(true);
      try {
        const snapUrl = file
          ? `/api/snapshot?file=${encodeURIComponent(file)}`
          : `/api/snapshot?platform=${encodeURIComponent(plat)}`;
        const [snapRes, connRes, crmRes, snapsRes] = await Promise.all([
          fetchJson<NormalizedSnapshot>(snapUrl).catch(() => null),
          fetchJson<ConnectionInfo[]>("/api/connections").catch(() => []),
          fetchJson<{ connected?: boolean } & CrmData>("/api/crm").catch(
            () => null
          ),
          fetchJson<SnapshotInfo[]>("/api/snapshots").catch(() => []),
        ]);

        if (!snapRes) throw new Error("API javob bermadi");
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
        setSource("api");
        setError(null);
      } catch (err) {
        // API ishlamadi — build vaqtidagi statik faylga o'tamiz
        try {
          const boot = await fetchJson<{
            snapshot: NormalizedSnapshot;
            connections: ConnectionInfo[];
            snapshots: SnapshotInfo[];
            crm: CrmData | null;
          }>("/data/bootstrap.json");
          setSnapshot(boot.snapshot);
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
      if (!poll) poll = setInterval(() => void load(false), 60000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    try {
      const es = new EventSource("/api/stream");
      esRef.current = es;
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("ping", () => setLive(true));
      es.addEventListener("sync", ev => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          setLastEventAt(data.at ?? new Date().toISOString());
        } catch {
          setLastEventAt(new Date().toISOString());
        }
        void load(false);
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

    return () => {
      stopPolling();
      esRef.current?.close();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      /* boshqa clientlarga push muhim emas */
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
    error,
    live,
    lastEventAt,
    source,
    refresh,
  };
}
