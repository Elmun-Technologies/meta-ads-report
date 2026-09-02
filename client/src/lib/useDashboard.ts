/**
 * Dashboard live-data hook:
 *   - /api/snapshot + /api/connections olinadi
 *   - /api/stream (SSE) ga obuna — server yangi snapshot tushsa UI avtomatik yangilanadi
 *   - SSE ishlamasa 60s polling fallback
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionInfo, CrmData, NormalizedSnapshot } from "@shared/types";

export interface DashboardState {
  snapshot: NormalizedSnapshot | null;
  connections: ConnectionInfo[];
  crm: CrmData | null;
  crmConnected: boolean;
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async (showSync = true) => {
    if (showSync) setSyncing(true);
    try {
      const [snapRes, connRes, crmRes] = await Promise.all([fetch("/api/snapshot?platform=meta"), fetch("/api/connections"), fetch("/api/crm")]);
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

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

  return { snapshot, connections, crm, crmConnected, loading, syncing, error, live, lastEventAt, refresh };
}
