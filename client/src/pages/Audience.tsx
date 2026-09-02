import { money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Panel, RankRow } from "@/components/widgets";
import { PageHint } from "@/components/Help";
import { AgeSpendLeadsChart } from "@/components/charts";

export default function Audience() {
  const { snapshot } = useDashboardContext();
  if (!snapshot) return null;

  const { age, totals } = snapshot;
  const maxLeads = Math.max(...age.map(a => a.leads), 1);
  const maxSpend = Math.max(...age.map(a => a.spend), 1);
  const totalLeads = age.reduce((s, a) => s + a.leads, 0) || 1;
  const bestCplAge = age
    .filter(a => a.leads > 0)
    .sort((x, y) => x.spend / x.leads - y.spend / y.leads)[0];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">Yosh kesimi</span>
          <h1>Qaysi yosh javob berayapti?</h1>
          <p>
            Yosh guruhlari bo'yicha sarf va murojaatlar taqsimoti. Umumiy qamrov{" "}
            {whole(totals.reach)} kishi, o'rtacha takroriylik{" "}
            {ratio(totals.frequency)}.
            {bestCplAge && (
              <>
                {" "}
                Eng arzon murojaat shu guruhdan:{" "}
                <b style={{ color: "var(--text)" }}>{bestCplAge.age}</b> —{" "}
                {money(bestCplAge.spend / bestCplAge.leads)}.
              </>
            )}
          </p>
        </div>
      </div>

      <PageHint>
        Savol:{" "}
        <b>
          qaysi yoshdagi odamlar murojaat qoldiryapti va ularning narxi qancha?
        </b>{" "}
        Chapdagi grafik sarf va murojaat solishtiruvi, o'ngda har bir yosh
        guruhining ulushi.
      </PageHint>

      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-7">
          <Panel kicker="Yosh bo'yicha" title="Sarf va murojaatlar">
            <div style={{ height: 300 }}>
              <AgeSpendLeadsChart
                data={age.map(a => ({
                  age: a.age,
                  spend: a.spend,
                  leads: a.leads,
                }))}
              />
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel
            kicker="Murojaatlar ulushi"
            title="Yosh guruhlari bo'yicha taqsimot"
          >
            {age.map(a => (
              <RankRow
                key={a.age}
                label={a.age}
                value={a.leads}
                valueLabel={`${whole(a.leads)} · ${pct((a.leads / totalLeads) * 100, 1)}`}
                share={a.leads / maxLeads}
                tone="var(--cyan)"
                sub={`Sarf ${money(a.spend)} · murojaat narxi ${a.leads ? money(a.spend / a.leads) : "N/A"} · takroriylik ${ratio(a.frequency)}`}
              />
            ))}
          </Panel>
        </div>
      </div>

      <Panel kicker="Batafsil jadval" title="Barcha yosh guruhlari">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Yosh</th>
                <th>
                  Sarf<small>Spend</small>
                </th>
                <th>
                  Ko'rsatuvlar<small>Impressions</small>
                </th>
                <th>
                  Qamrov<small>Reach</small>
                </th>
                <th>
                  Takroriylik<small>Frequency</small>
                </th>
                <th>
                  Bosishlar<small>Clicks</small>
                </th>
                <th>
                  Bosish ulushi<small>CTR</small>
                </th>
                <th>
                  1000 ko'rsatuv narxi<small>CPM</small>
                </th>
                <th>
                  Murojaatlar<small>Leads</small>
                </th>
                <th>
                  Murojaat narxi<small>CPL</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...age]
                .sort((a, b) => b.spend - a.spend)
                .map(a => (
                  <tr key={a.age} style={{ cursor: "default" }}>
                    <td>
                      <b style={{ fontSize: 12.5 }}>{a.age}</b>
                    </td>
                    <td className="num">
                      {money(a.spend)}
                      <span className="share-bar">
                        <i
                          style={{ width: `${(a.spend / maxSpend) * 100}%` }}
                        />
                      </span>
                    </td>
                    <td className="num">{whole(a.impressions)}</td>
                    <td className="num">
                      {a.reach != null ? whole(a.reach) : "N/A"}
                    </td>
                    <td
                      className={`num ${(a.frequency ?? 0) >= 3 ? "tone-warn" : ""}`}
                    >
                      {ratio(a.frequency)}
                    </td>
                    <td className="num">{whole(a.clicks)}</td>
                    <td className="num">{pct(a.ctr)}</td>
                    <td className="num">{money(a.cpm)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {whole(a.leads)}
                    </td>
                    <td className="num">
                      {a.leads ? money(a.spend / a.leads) : "N/A"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="note-strip" style={{ marginTop: 13 }}>
          <span className="kicker" style={{ flex: "none" }}>
            Nima uchun faqat yosh
          </span>
          <span>
            Meta API bu eksport jins (gender) va joylashuv (placement) kesimini
            qaytarmagan — shuning uchun auditoriya tahlili faqat yosh bo'yicha.
            Keyingi snapshotda bu kesimlar qo'shilishi mumkin.
          </span>
        </div>
      </Panel>
    </>
  );
}
