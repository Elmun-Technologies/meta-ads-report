import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compact, money, moneyShort, pct, whole } from "@/lib/format";

const AXIS = { fontSize: 10, fontFamily: "var(--mono)", fill: "var(--text-3)" };
const GRID = { stroke: "var(--grid-line)", strokeDasharray: "3 6" };

function TipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="chart-tip">
      <div className="t-title">{title}</div>
      {rows.map(r => (
        <div className="t-row" key={r.label}>
          {r.color && (
            <span className="t-dot" style={{ background: r.color }} />
          )}
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

/* Kampaniyalar bo'yicha Spend (ranked, gorizontal) */
export function SpendByCampaignChart({
  data,
}: {
  data: { name: string; short: string; spend: number; leads: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 6, right: 14, top: 4, bottom: 4 }}
        barCategoryGap={6}
      >
        <CartesianGrid
          horizontal={false}
          stroke={GRID.stroke}
          strokeDasharray={GRID.strokeDasharray}
        />
        <XAxis
          type="number"
          tickFormatter={v => moneyShort(v)}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="short"
          width={128}
          tick={{ ...AXIS, fontSize: 9.5 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--panel-hover)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <TipBox
                title={d.name}
                rows={[
                  {
                    label: "Sarf",
                    value: money(d.spend),
                    color: "var(--accent)",
                  },
                  {
                    label: "Murojaatlar",
                    value: whole(d.leads),
                    color: "var(--cyan)",
                  },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="spend" radius={[0, 5, 5, 0]} maxBarSize={18}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill="var(--accent)"
              fillOpacity={Math.max(0.95 - i * 0.075, 0.3)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Leads ustuni + CPL chizig'i (combined) */
export function LeadsCplChart({
  data,
}: {
  data: { short: string; name: string; leads: number; cpl: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ left: -8, right: 6, top: 8, bottom: 0 }}
        barCategoryGap={22}
      >
        <CartesianGrid
          stroke={GRID.stroke}
          strokeDasharray={GRID.strokeDasharray}
          vertical={false}
        />
        <XAxis
          dataKey="short"
          tick={{ ...AXIS, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={0}
        />
        <YAxis
          yAxisId="l"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="r"
          orientation="right"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => moneyShort(v)}
        />
        <Tooltip
          cursor={{ fill: "var(--panel-hover)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <TipBox
                title={d.name}
                rows={[
                  {
                    label: "Murojaatlar",
                    value: whole(d.leads),
                    color: "var(--cyan)",
                  },
                  {
                    label: "Murojaat narxi",
                    value: d.cpl != null ? money(d.cpl) : "N/A",
                    color: "var(--violet)",
                  },
                ]}
              />
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10.5, fontFamily: "var(--mono)" }}
          iconType="circle"
          iconSize={7}
        />
        <Bar
          yAxisId="l"
          dataKey="leads"
          name="Murojaatlar"
          fill="var(--cyan)"
          radius={[5, 5, 0, 0]}
          maxBarSize={26}
          fillOpacity={0.85}
        />
        <Line
          yAxisId="r"
          dataKey="cpl"
          name="Murojaat narxi"
          stroke="var(--violet)"
          strokeWidth={2.2}
          dot={{ r: 2.6, fill: "var(--violet)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* Yosh segmentlari: Spend area + Leads line */
export function AgeSpendLeadsChart({
  data,
}: {
  data: { age: string; spend: number; leads: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ left: -12, right: 6, top: 8, bottom: 0 }}
      >
        <defs>
          <linearGradient id="ageSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke={GRID.stroke}
          strokeDasharray={GRID.strokeDasharray}
          vertical={false}
        />
        <XAxis
          dataKey="age"
          tick={{ ...AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="l"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => moneyShort(v)}
        />
        <YAxis
          yAxisId="r"
          orientation="right"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--panel-hover)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <TipBox
                title={`${d.age} yosh`}
                rows={[
                  {
                    label: "Sarf",
                    value: money(d.spend),
                    color: "var(--accent)",
                  },
                  {
                    label: "Murojaatlar",
                    value: whole(d.leads),
                    color: "var(--cyan)",
                  },
                ]}
              />
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10.5, fontFamily: "var(--mono)" }}
          iconType="circle"
          iconSize={7}
        />
        <Area
          yAxisId="l"
          dataKey="spend"
          name="Sarf"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#ageSpend)"
        />
        <Line
          yAxisId="r"
          dataKey="leads"
          name="Murojaatlar"
          stroke="var(--cyan)"
          strokeWidth={2.2}
          dot={{ r: 2.6, fill: "var(--cyan)", strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* CTR top-10 (gorizontal) */
export function CtrTopChart({
  data,
  avg,
}: {
  data: { name: string; short: string; ctr: number }[];
  avg: number | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 6, right: 16, top: 4, bottom: 4 }}
        barCategoryGap={7}
      >
        <CartesianGrid
          horizontal={false}
          stroke={GRID.stroke}
          strokeDasharray={GRID.strokeDasharray}
        />
        <XAxis
          type="number"
          tickFormatter={v => `${v.toFixed(1)}%`}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="short"
          width={120}
          tick={{ ...AXIS, fontSize: 9.5 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--panel-hover)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <TipBox
                title={d.name}
                rows={[
                  {
                    label: "Bosish ulushi",
                    value: pct(d.ctr),
                    color: "var(--cyan)",
                  },
                  ...(avg != null
                    ? [
                        {
                          label: "Hisob bo'yicha o'rtacha",
                          value: pct(avg),
                          color: "var(--text-3)",
                        },
                      ]
                    : []),
                ]}
              />
            );
          }}
        />
        <Bar dataKey="ctr" radius={[0, 5, 5, 0]} maxBarSize={16}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill="var(--cyan)"
              fillOpacity={d.ctr >= (avg ?? 0) ? 0.95 : 0.4}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Kichik area sparkline (umumiy trendlar uchun — real distribution ma'lumotlari) */
export function MiniAreaChart({
  data,
  dataKey,
  tone = "var(--accent)",
}: {
  data: Record<string, number>[];
  dataKey: string;
  tone?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={`mini-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.3} />
            <stop offset="100%" stopColor={tone} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          dataKey={dataKey}
          stroke={tone}
          strokeWidth={1.8}
          fill={`url(#mini-${dataKey})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const compactNum = compact;
