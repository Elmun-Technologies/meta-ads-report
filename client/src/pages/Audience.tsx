import { money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Panel, RankRow } from "@/components/widgets";
import { AgeSpendLeadsChart } from "@/components/charts";

export default function Audience() {
  const { snapshot } = useDashboardContext();
  if (!snapshot) return null;

  const { age, totals } = snapshot;
  const maxLeads = Math.max(...age.map((a) => a.leads), 1);
  const maxSpend = Math.max(...age.map((a) => a.spend), 1);
  const totalLeads = age.reduce((s, a) => s + a.leads, 0) || 1;
  const bestCplAge = age.filter((a) => a.leads > 0).sort((x, y) => x.spend / x.leads - y.spend / y.leads)[0];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            AUDITORIYA TAHLILI
          </span>
          <h1>Kim javob berayapti?</h1>
          <p>
            Yosh segmentlari bo'yicha spend va lead taqsimoti. Umumiy reach {whole(totals.reach)}, o'rtacha frequency {ratio(totals.frequency)}.
            {bestCplAge && (
              <>
                {" "}Eng arzon lead segmenti: <b style={{ color: "var(--text)" }}>{bestCplAge.age}</b> ({money(bestCplAge.spend / bestCplAge.leads)}).
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-7">
          <Panel kicker="YOSH KESIMI" title="Spend va Leads dinamikasi">
            <div style={{ height: 300 }}>
              <AgeSpendLeadsChart data={age.map((a) => ({ age: a.age, spend: a.spend, leads: a.leads }))} />
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel kicker="LEAD ULUSHI" title="Segmentlar bo'yicha leads">
            {age.map((a) => (
              <RankRow
                key={a.age}
                label={a.age}
                value={a.leads}
                valueLabel={`${whole(a.leads)} · ${pct((a.leads / totalLeads) * 100, 1)}`}
                share={a.leads / maxLeads}
                tone="var(--cyan)"
                sub={`Spend ${money(a.spend)} · CPL ${a.leads ? money(a.spend / a.leads) : "N/A"} · freq ${ratio(a.frequency)}`}
              />
            ))}
          </Panel>
        </div>
      </div>

      <Panel kicker="SEGMENT JADVALI" title="Barcha yosh segmentlari">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Segment</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Reach</th>
                <th>Frequency</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>CPM</th>
                <th>Leads</th>
                <th>CPL</th>
              </tr>
            </thead>
            <tbody>
              {[...age]
                .sort((a, b) => b.spend - a.spend)
                .map((a) => (
                  <tr key={a.age} style={{ cursor: "default" }}>
                    <td>
                      <b style={{ fontSize: 12.5 }}>{a.age}</b>
                    </td>
                    <td className="num">
                      {money(a.spend)}
                      <span className="share-bar">
                        <i style={{ width: `${(a.spend / maxSpend) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">{whole(a.impressions)}</td>
                    <td className="num">{a.reach != null ? whole(a.reach) : "N/A"}</td>
                    <td className={`num ${(a.frequency ?? 0) >= 3 ? "tone-warn" : ""}`}>{ratio(a.frequency)}</td>
                    <td className="num">{whole(a.clicks)}</td>
                    <td className="num">{pct(a.ctr)}</td>
                    <td className="num">{money(a.cpm)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {whole(a.leads)}
                    </td>
                    <td className="num">{a.leads ? money(a.spend / a.leads) : "N/A"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="note-strip" style={{ marginTop: 13 }}>
          <span className="kicker" style={{ flex: "none" }}>
            IZOH
          </span>
          <span>
            Meta API bu eksportda gender va placement kesimini qaytarmadi (placement so'rovi API tomonidan rad etildi) — segment tahlili yosh bo'yicha. Gender/placement keyingi snapshotda qo'shilishi mumkin.
          </span>
        </div>
      </Panel>
    </>
  );
}
