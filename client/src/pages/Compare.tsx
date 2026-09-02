import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, Info } from "lucide-react";
import type { NormalizedSnapshot, SnapshotInfo } from "@shared/types";
import { money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, Panel } from "@/components/widgets";

interface ExpoRow {
  expo: string;
  campaigns: number;
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
}

function delta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function DeltaBadge({ value, invert = false, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value == null) return <span className="tone-muted">—</span>;
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`mono tone-${good ? "good" : "risk"}`} style={{ fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}>
      <Icon size={11} />
      {positive ? "+" : ""}
      {value.toFixed(1)}%{suffix}
    </span>
  );
}

export default function Compare() {
  const { snapshot } = useDashboardContext();
  const [snapList, setSnapList] = useState<SnapshotInfo[] | null>(null);
  const [fileA, setFileA] = useState<string>("");
  const [fileB, setFileB] = useState<string>("");
  const [snapA, setSnapA] = useState<NormalizedSnapshot | null>(null);
  const [snapB, setSnapB] = useState<NormalizedSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SnapshotInfo[]) => {
        if (Array.isArray(list) && list.length) {
          setSnapList(list);
          setFileA(list[0]?.file ?? "");
          setFileB(list[1]?.file ?? "");
        } else {
          setSnapList([]);
        }
      })
      .catch(() => setSnapList([]));
  }, []);

  const canCompare = snapList != null && snapList.length >= 2 && fileA && fileB && fileA !== fileB;

  useEffect(() => {
    if (!canCompare) {
      setSnapA(null);
      setSnapB(null);
      return;
    }
    setLoading(true);
    Promise.all([fetch(`/api/snapshot?file=${encodeURIComponent(fileA)}`).then((r) => r.json()), fetch(`/api/snapshot?file=${encodeURIComponent(fileB)}`).then((r) => r.json())])
      .then(([a, b]) => {
        setSnapA(a.meta ? a : null);
        setSnapB(b.meta ? b : null);
      })
      .catch(() => {
        setSnapA(null);
        setSnapB(null);
      })
      .finally(() => setLoading(false));
  }, [canCompare, fileA, fileB]);

  const expoRows = useMemo<ExpoRow[]>(() => {
    if (!snapshot) return [];
    const map = new Map<string, ExpoRow>();
    for (const c of snapshot.campaigns) {
      const row = map.get(c.expo) ?? { expo: c.expo, campaigns: 0, spend: 0, leads: 0, cpl: null, ctr: null, frequency: null };
      row.campaigns += 1;
      row.spend += c.metrics.spend;
      row.leads += c.metrics.leads;
      map.set(c.expo, row);
    }
    return [...map.values()]
      .map((r) => ({ ...r, cpl: r.leads ? r.spend / r.leads : null, ctr: null, frequency: null }))
      .sort((a, b) => b.spend - a.spend);
  }, [snapshot]);

  if (!snapshot) return null;

  const avgCpl = snapshot.totals.cpl ?? 0;
  const maxSpend = Math.max(...expoRows.map((r) => r.spend), 1);

  /* A/B KPI qatori */
  const abRows =
    snapA && snapB
      ? [
          { label: "Spend", a: money(snapA.totals.spend), b: money(snapB.totals.spend), d: delta(snapA.totals.spend, snapB.totals.spend), invert: false },
          { label: "Leads", a: whole(snapA.totals.leads), b: whole(snapB.totals.leads), d: delta(snapA.totals.leads, snapB.totals.leads), invert: false },
          { label: "Cost per lead", a: money(snapA.totals.cpl), b: money(snapB.totals.cpl), d: delta(snapA.totals.cpl, snapB.totals.cpl), invert: true },
          { label: "CTR", a: pct(snapA.totals.ctr), b: pct(snapB.totals.ctr), d: delta(snapA.totals.ctr, snapB.totals.ctr), invert: false },
          { label: "CPM", a: money(snapA.totals.cpm), b: money(snapB.totals.cpm), d: delta(snapA.totals.cpm, snapB.totals.cpm), invert: true },
          { label: "Reach", a: whole(snapA.totals.reach), b: whole(snapB.totals.reach), d: delta(snapA.totals.reach, snapB.totals.reach), invert: false },
        ]
      : [];

  /* Kampaniyalar kesimida delta (id bo'yicha join) */
  const campaignDeltas =
    snapA && snapB
      ? snapA.campaigns
          .map((ca) => {
            const cb = snapB.campaigns.find((c) => c.id === ca.id);
            if (!cb) return null;
            return {
              name: ca.originalName,
              id: ca.id,
              spendA: ca.metrics.spend,
              spendD: delta(ca.metrics.spend, cb.metrics.spend),
              leadsA: ca.metrics.leads,
              leadsD: delta(ca.metrics.leads, cb.metrics.leads || null),
              cplA: ca.metrics.cpl,
              cplD: delta(ca.metrics.cpl, cb.metrics.cpl),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null)
          .sort((x, y) => Math.abs(y.spendD ?? 0) - Math.abs(x.spendD ?? 0))
          .slice(0, 10)
      : [];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            TAQQOSLASH
          </span>
          <h1>Nima o'zgardi?</h1>
          <p>Davrlar, Expo guruhlari va account benchmark kesimida taqqoslash. Ikkinchi davr snapshoti papkaga tushganda A/B taqqoslash avtomatik yonadi.</p>
        </div>
      </div>

      {/* A/B davrlar */}
      <Panel kicker="DAVRLARARO A/B" title="Ikki davrni taqqoslash" style={{ marginBottom: 14 }}>
        {snapList == null ? (
          <EmptyState text="Snapshot ro'yxati yuklanmoqda…" />
        ) : !canCompare ? (
          <div className="note-strip">
            <Info size={15} style={{ flex: "none", color: "var(--accent)" }} />
            <span>
              A/B taqqoslash uchun kamida <b>2 ta davr snapshoti</b> kerak. Hozir <b>{snapList.length}</b> ta bor ({snapList.map((s) => s.periodLabel).join(", ") || "—"}).
              <br />
              Manus/MCP keyingi oy eksportini <b>server/data/snapshots/</b> papkaga tushirsa (masalan <span className="mono">meta_act-..._september-2026.json</span>), bu panel o'zi % delta bilan ochiladi — UI tarafi tayyor.
            </span>
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <select className="select-btn" value={fileA} onChange={(e) => setFileA(e.target.value)}>
                {snapList.map((s) => (
                  <option key={s.file} value={s.file}>
                    A: {s.periodLabel}
                  </option>
                ))}
              </select>
              <span className="chip muted">vs</span>
              <select className="select-btn" value={fileB} onChange={(e) => setFileB(e.target.value)}>
                {snapList.map((s) => (
                  <option key={s.file} value={s.file}>
                    B: {s.periodLabel}
                  </option>
                ))}
              </select>
              {loading && <span className="chip muted">yuklanmoqda…</span>}
            </div>
            {snapA && snapB && (
              <>
                <div className="tbl-wrap">
                  <table className="tbl" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>KPI</th>
                        <th>Davr A</th>
                        <th>Davr B</th>
                        <th>O'zgarish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abRows.map((r) => (
                        <tr key={r.label} style={{ cursor: "default" }}>
                          <td>
                            <b style={{ fontSize: 12.5 }}>{r.label}</b>
                          </td>
                          <td className="num">{r.a}</td>
                          <td className="num">{r.b}</td>
                          <td className="num">
                            <DeltaBadge value={r.d} invert={r.invert} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {campaignDeltas.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <span className="kicker">KAMPANIYA KESIMIDA ENG KATTA O'ZGARISHLAR</span>
                    <div className="tbl-wrap" style={{ marginTop: 8 }}>
                      <table className="tbl" style={{ minWidth: 640 }}>
                        <thead>
                          <tr>
                            <th>Kampaniya</th>
                            <th>Spend (A)</th>
                            <th>Spend Δ</th>
                            <th>Leads (A)</th>
                            <th>Leads Δ</th>
                            <th>CPL Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaignDeltas.map((r) => (
                            <tr key={r.id} style={{ cursor: "default" }}>
                              <td>
                                <b style={{ fontSize: 12 }}>{r.name}</b>
                              </td>
                              <td className="num">{money(r.spendA)}</td>
                              <td className="num">
                                <DeltaBadge value={r.spendD} />
                              </td>
                              <td className="num">{whole(r.leadsA)}</td>
                              <td className="num">
                                <DeltaBadge value={r.leadsD} />
                              </td>
                              <td className="num">
                                <DeltaBadge value={r.cplD} invert />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Panel>

      {/* Expo benchmark — hozir ishlaydi */}
      <Panel kicker="EXPO BENCHMARK" title="Expo guruhlari taqqoslash" sub={`Account o'rtacha CPL: ${money(avgCpl)} — undan farq foizda ko'rsatilgan`} style={{ marginBottom: 14 }}>
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Expo</th>
                <th>Kampaniya</th>
                <th>Spend</th>
                <th>Spend ulushi</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>CPL vs o'rtacha</th>
              </tr>
            </thead>
            <tbody>
              {expoRows.map((r) => {
                const cplDelta = r.cpl != null && avgCpl > 0 ? ((r.cpl - avgCpl) / avgCpl) * 100 : null;
                return (
                  <tr key={r.expo} style={{ cursor: "default" }}>
                    <td>
                      <b style={{ fontSize: 12.5 }}>{r.expo}</b>
                    </td>
                    <td className="num">{r.campaigns}</td>
                    <td className="num">{money(r.spend)}</td>
                    <td className="num">
                      <span className="share-bar">
                        <i style={{ width: `${(r.spend / maxSpend) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {whole(r.leads)}
                    </td>
                    <td className="num">{r.cpl != null ? money(r.cpl) : "N/A"}</td>
                    <td className="num">{cplDelta != null ? <DeltaBadge value={cplDelta} invert /> : <span className="tone-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Kampaniya benchmark */}
      <Panel kicker="ACCOUNT BENCHMARK" title="O'rtacha chizig'dan yuqorida va pastda" sub="CPL bo'yicha eng yaxshi 5 va eng qimmat 5 kampaniya (kamida 3 lead)">
        <div className="grid-12">
          <div className="col-6">
            <span className="kicker" style={{ color: "var(--good)" }}>
              ✓ O'RTACHADAN ARZON (scale kandidatlari)
            </span>
            {snapshot.campaigns
              .filter((c) => c.metrics.leads >= 3 && c.metrics.cpl != null && (c.metrics.cpl ?? 0) <= avgCpl)
              .sort((a, b) => (a.metrics.cpl ?? 0) - (b.metrics.cpl ?? 0))
              .slice(0, 5)
              .map((c) => (
                <div className="d-kv" key={c.id}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.originalName}</span>
                  <b className="tone-good">
                    {money(c.metrics.cpl)} <DeltaBadge value={((c.metrics.cpl! - avgCpl) / avgCpl) * 100} invert />
                  </b>
                </div>
              ))}
          </div>
          <div className="col-6">
            <span className="kicker" style={{ color: "var(--risk)" }}>
              ✕ O'RTACHADAN QIMMAT (ko'chirish/tahlil)
            </span>
            {snapshot.campaigns
              .filter((c) => c.metrics.leads >= 3 && c.metrics.cpl != null && (c.metrics.cpl ?? 0) > avgCpl)
              .sort((a, b) => (b.metrics.cpl ?? 0) - (a.metrics.cpl ?? 0))
              .slice(0, 5)
              .map((c) => (
                <div className="d-kv" key={c.id}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.originalName}</span>
                  <b className="tone-risk">
                    {money(c.metrics.cpl)} <DeltaBadge value={((c.metrics.cpl! - avgCpl) / avgCpl) * 100} invert />
                  </b>
                </div>
              ))}
          </div>
        </div>
        <div className="note-strip" style={{ marginTop: 12 }}>
          <Clock size={14} style={{ flex: "none", color: "var(--text-3)" }} />
          <span>Benchmark — tanlangan davrning o'z o'rtachasi. Ikkinchi davr kelgach, «o'tgan davrga nisbatan» ham qo'shiladi (yuqoridagi A/B paneli).</span>
        </div>
      </Panel>
    </>
  );
}
