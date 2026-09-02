/**
 * Dashboard live-data hook:
 *   - /api/snapshot + /api/connections olinadi
 *   - /api/stream (SSE) ga obuna — server yangi snapshot tushsa UI avtomatik yangilanadi
 *   - SSE ishlamasa 60s polling fallback
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionInfo, CrmData, NormalizedSnapshot, SnapshotInfo } from "@shared/types";

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
  loading: boolean;
  syncing: boolean;
  error: string | null;
  live: boolean;
  lastEventAt: string | null;
  refresh: () => Promise<void>;
}

export function useDashboard(): DashboardState {
  const [snapshot, setSnapshot] = useState<NormalizedSnapshot | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [crm, setCrm] = useState<CrmData | null>(null);
  const [crmConnected, setCrmConnected] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [snapshotFile, setSnapshotFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(
    async (showSync = true, file = snapshotFile) => {
      if (showSync) setSyncing(true);
      try {
        const snapUrl = file ? `/api/snapshot?file=${encodeURIComponent(file)}` : "/api/snapshot?platform=meta";
        const [snapRes, connRes, crmRes, snapsRes] = await Promise.all([fetch(snapUrl), fetch("/api/connections"), fetch("/api/crm"), fetch("/api/snapshots")]);
        if (!snapRes.ok) {
          const body = await snapRes.json().catch(() => ({}));
          throw new Error(body.error || `Snapshot olinmadi (${snapRes.status})`);
        }
        setSnapshot(await snapRes.json());
        setConnections(connRes.ok ? await connRes.json() : []);
        if (crmRes.ok) {
          const crmData = await crmRes.json();
          setCrm(crmData.connected ? crmData : null);
          setCrmConnected(Boolean(crmData.connected));
        } else {
          setCrm(null);
          setCrmConnected(false);
        }
        if (snapsRes.ok) {
          const list = await snapsRes.json();
          if (Array.isArray(list)) setSnapshots(list);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [snapshotFile],
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
      es.addEventListener("sync", (ev) => {
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
    [load],
  );

  return { snapshot, connections, crm, crmConnected, snapshots, snapshotFile, setSnapshotFile: selectFile, loading, syncing, error, live, lastEventAt, refresh };
}
