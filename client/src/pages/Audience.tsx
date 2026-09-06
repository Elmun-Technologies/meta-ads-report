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
          <span className="kicker">Срез по возрасту</span>
          <h1>Какой возраст реагирует?</h1>
          <p>
            Распределение расхода и лидов по возрастным группам. Общий охват{" "}
            {whole(totals.reach)} человек, средняя частота{" "}
            {ratio(totals.frequency)}.
            {bestCplAge && (
              <>
                {" "}
                Самые дешевые лиды в этой группе:{" "}
                <b style={{ color: "var(--text)" }}>{bestCplAge.age}</b> —{" "}
                {money(bestCplAge.spend / bestCplAge.leads)}.
              </>
            )}
          </p>
        </div>
      </div>

      <PageHint>
        Вопрос:{" "}
        <b>
          люди какого возраста оставляют лиды и сколько они стоят?
        </b>{" "}
        Слева — сравнение расхода и лидов, справа — доля каждой возрастной
        группы.
      </PageHint>

      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-7">
          <Panel kicker="По возрасту" title="Расход и лиды">
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
            kicker="Доля лидов"
            title="Распределение по возрастным группам"
          >
            {age.map(a => (
              <RankRow
                key={a.age}
                label={a.age}
                value={a.leads}
                valueLabel={`${whole(a.leads)} · ${pct((a.leads / totalLeads) * 100, 1)}`}
                share={a.leads / maxLeads}
                tone="var(--cyan)"
                sub={`Расход ${money(a.spend)} · стоимость лида ${a.leads ? money(a.spend / a.leads) : "N/A"} · частота ${ratio(a.frequency)}`}
              />
            ))}
          </Panel>
        </div>
      </div>

      <Panel kicker="Детальная таблица" title="Все возрастные группы">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Возраст</th>
                <th>
                  Расход<small>Spend</small>
                </th>
                <th>
                  Показы<small>Impressions</small>
                </th>
                <th>
                  Охват<small>Reach</small>
                </th>
                <th>
                  Частота<small>Frequency</small>
                </th>
                <th>
                  Клики<small>Clicks</small>
                </th>
                <th>
                  Кликабельность<small>CTR</small>
                </th>
                <th>
                  Цена 1000 показов<small>CPM</small>
                </th>
                <th>
                  Лиды<small>Leads</small>
                </th>
                <th>
                  Стоимость лида<small>CPL</small>
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
