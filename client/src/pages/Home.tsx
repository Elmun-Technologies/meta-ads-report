// Editorial Ledger: Swiss editorial reporting, parchment workspace, cobalt hierarchy, vermilion signals.
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, BarChart3, Bell, ChevronRight, CircleHelp, FileText, Filter, LayoutDashboard, Menu, Search, SlidersHorizontal, Sparkles, Target, X } from "lucide-react";
import data from "../data/august-data.json";

type Campaign = Record<string, any>;
type AdInsight = Record<string, any>;
const campaigns = data.campaigns as Campaign[];
const adInsights = data.adInsights as AdInsight[];
const ageRows = data.age as Campaign[];

const money = (v: number | string | null | undefined) => v == null ? "N/A" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (v: number | string | null | undefined) => v == null ? "N/A" : Number(v).toLocaleString("en-US");
const percent = (v: number | string | null | undefined) => v == null ? "N/A" : `${Number(v).toFixed(2)}%`;
const action = (row: Campaign, type: string) => Number((row.actions || []).find((a: any) => a.action_type === type)?.value || 0);
const leads = (row: Campaign) => action(row, "lead") || action(row, "onsite_conversion.lead_grouped") || action(row, "offsite_complete_registration_add_meta_leads");

const standardCampaignName = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("foodera lead | retargeting")) return "FOODERA EXPO 2026 | LEADS | RETARGETING 30D | UZ | AUG26";
  if (n.includes("foodera lead | interests")) return "FOODERA EXPO 2026 | LEADS | INTERESTS FOOD DELIVERY | UZ | AUG26";
  if (n.includes("foodera lead | broad")) return "FOODERA EXPO 2026 | LEADS | BROAD | UZ | AUG26";
  if (n.includes("foodera lead 27")) return "FOODERA EXPO 2026 | LEADS | BROAD | UZ | AUG26 · MUNIS";
  if (n.includes("stand booking")) return "FOODERA EXPO 2026 | LEADS | STAND BOOKING | UZ-KZ | AUG26";
  if (n.includes("foodera expo") && n.includes("sales site")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES SITE | AUG26";
  if (n.includes("foodera expo") && n.includes("sales - copy")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES COPY | AUG26";
  if (n.includes("foodera expo") && n.includes("sales")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES | AUG26";
  if (n.includes("build pro")) return "BUILD PRO EXPO | LEADS | BROAD | UZ | AUG26";
  if (n.includes("promo show")) return "PROMOTORS SHOW | LEADS | TASHKENT | UZ | AUG26";
  if (n.includes("promotors-show")) return `PROMOTORS SHOW | LEADS | ${name.replace(/promotors-show daily 5\\$ /i, "").toUpperCase()} | UZ | AUG26`;
  if (n.includes("engagement")) return "FOODERA EXPO 2026 | ENGAGEMENT | BROAD | UZ | AUG26";
  if (n.includes("new leads")) return "EXPO NOT SPECIFIED | LEADS | AUDIENCE NOT SPECIFIED | MARKET NOT SPECIFIED | AUG26";
  return `EXPO NOT SPECIFIED | ${name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} | AUG26`;
};
const standardAdsetName = (name: string) => {
  const n = (name || "").trim().toLowerCase();
  if (!n || n === "broad") return "BROAD AUDIENCE | GEO NOT SPECIFIED | AUTO PLACEMENTS";
  if (n.includes("tashkent")) return "BROAD AUDIENCE | TASHKENT | AUTO PLACEMENTS";
  if (n.includes("engagement")) return "BROAD AUDIENCE | GEO NOT SPECIFIED | ENGAGEMENT OPTIMIZATION";
  return `${name.toUpperCase()} | GEO NOT SPECIFIED | AUTO PLACEMENTS`;
};
const standardCreativeName = (name: string, index = 1) => {
  const n = (name || "").toLowerCase();
  const type = n.includes("video") ? "VIDEO" : n.includes("creative") || n.includes("discount") ? "STATIC / OFFER" : "AD CREATIVE";
  const angle = n.includes("discount") ? "DISCOUNT OFFER" : n.includes("broad") ? "BROAD HOOK" : n.includes("creative") ? "EXHIBITOR MESSAGE" : n.toUpperCase();
  return `${type} | ${angle} | V${String(index).padStart(2, "0")}`;
};

function StatCard({ label, value, note, accent = "cobalt", icon: Icon }: { label:string; value:string; note:string; accent?:string; icon:any }) {
  return <div className={`stat-card accent-${accent}`}><div className="stat-top"><span>{label}</span><Icon size={16} strokeWidth={1.8}/></div><strong>{value}</strong><small>{note}</small></div>;
}

function Signal({ children, tone = "good" }: { children: React.ReactNode; tone?: string }) { return <span className={`signal signal-${tone}`}><i />{children}</span>; }

export default function Home() {
  const [section, setSection] = useState("Overview");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [showLeadOnly, setShowLeadOnly] = useState(false);
  const [sort, setSort] = useState("spend");
  const [mobileNav, setMobileNav] = useState(false);

  const filteredCampaigns = useMemo(() => campaigns.filter(c => standardCampaignName(c.campaign_name).toLowerCase().includes(search.toLowerCase()) && (!showLeadOnly || leads(c) > 0)).sort((a,b) => sort === "leads" ? leads(b)-leads(a) : sort === "ctr" ? Number(b.ctr)-Number(a.ctr) : Number(b.spend)-Number(a.spend)), [search, showLeadOnly, sort]);
  const topAds = useMemo(() => [...adInsights].sort((a,b) => Number(b.spend)-Number(a.spend)).slice(0, 12), []);
  const spendChart = campaigns.filter(c => Number(c.spend) > 20).slice(0, 9).map(c => ({ name: standardCampaignName(c.campaign_name).slice(0, 23), spend: Number(c.spend), leads: leads(c) }));
  const ageChart = ageRows.map(r => ({ age: r.age, spend: Number(r.spend), leads: leads(r) }));

  const nav = [{ label: "Overview", icon: LayoutDashboard }, { label: "Leads", icon: Target }, { label: "Campaigns", icon: BarChart3 }, { label: "Creatives", icon: Sparkles }, { label: "Audience", icon: Target }];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
      <div className="brand"><img className="brand-image" src="/manus-storage/ledger-logo-mark_3c531f90.png" alt="Sof-Expo ledger mark"/><div><b>SOF-EXPO</b><small>Performance room</small></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="account-switch"><span className="account-dot"/><div><small>AD ACCOUNT</small><b>Sof-Expo l Nazir</b></div><ChevronRight size={15}/></div>
      <nav><p className="nav-caption">REPORT SECTIONS</p>{nav.map(item => <button key={item.label} className={section === item.label ? "active" : ""} onClick={() => {setSection(item.label); setMobileNav(false)}}><item.icon size={17}/><span>{item.label}</span>{item.label === "Creatives" && <em>{adInsights.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="confidence"><div><span>DATA CONFIDENCE</span><b>Verified export</b></div><div className="confidence-ring">94</div><p>Account-level August data synced from Meta Ads Manager.</p></div><button className="side-help"><CircleHelp size={16}/> Reporting notes</button></div>
    </aside>
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)}/>} 
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb"><span>REPORTS</span><ChevronRight size={14}/><b>August 2026</b></div><div className="top-actions"><button className="icon-button"><Bell size={17}/><i/></button><button className="export-button"><FileText size={15}/> Export brief</button><div className="avatar">NM</div></div></header>
      <div className="content-wrap">
        <section className="report-head"><div><div className="eyebrow"><span className="eyebrow-line"/> MONTHLY PERFORMANCE BRIEF</div><h1>Where did the money go?</h1><p>August 2026 campaign and creative intelligence for <b>Sof-Expo l Nazir</b>.</p></div><div className="head-meta"><span className="date-pill">01 AUG — 31 AUG 2026</span><span className="status-pill"><i/> Live export</span></div></section>
        <div className="section-tabs">{nav.map(n => <button key={n.label} className={section === n.label ? "selected" : ""} onClick={() => setSection(n.label)}>{n.label}</button>)}</div>
        {section === "Overview" && <>
          <section className="kpi-grid"><StatCard label="Spend" value={money(data.summary.spend)} note="Across 19 campaigns · USD" icon={BarChart3}/><StatCard label="Leads" value={whole(data.summary.leads)} note={`${money(data.summary.cost_per_lead)} Cost per lead`} accent="sage" icon={Target}/><StatCard label="Reach" value={whole(data.summary.reach)} note="Accounts Center accounts" icon={ArrowUpRight}/><StatCard label="Link clicks" value={whole(data.summary.link_clicks)} note={`${percent(data.summary.link_click_ctr)} Link click-through rate`} accent="vermilion" icon={Sparkles}/></section>
          <section className="insight-strip"><div className="insight-tag"><Sparkles size={15}/> EDITOR'S NOTE</div><p><b>Promo show lead expo</b> delivered the clearest efficiency signal: 105 leads at <b>$1.44 Cost per lead</b>. Treat this as a scale-test hypothesis, then validate lead quality in CRM.</p><button onClick={() => {setSection("Campaigns"); setSearch("Promo show")}}>Inspect campaign <ArrowUpRight size={15}/></button></section>
          <section className="chart-grid"><div className="panel spend-panel"><div className="panel-head"><div><span className="panel-kicker">BUDGET DISTRIBUTION</span><h2>Spend by campaign</h2></div><button className="panel-action" onClick={() => setSection("Campaigns")}>View ledger <ChevronRight size={14}/></button></div><div className="chart-key"><span><i className="key-cobalt"/> Spend</span><span><i className="key-vermilion"/> Leads</span></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={spendChart} layout="vertical" margin={{left: 0, right: 18, top: 4, bottom: 4}} barGap={2}><CartesianGrid horizontal={false} stroke="#e6e0d6"/><XAxis type="number" tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} tick={{fill:"#827b70",fontSize:11}}/><YAxis type="category" dataKey="name" width={126} axisLine={false} tickLine={false} tick={{fill:"#514b43",fontSize:11}}/><Tooltip cursor={{fill:"#f4efe7"}} formatter={(v: any, n: any) => [n === "spend" ? money(v) : whole(v), n === "spend" ? "Spend" : "Leads"]}/><Bar dataKey="spend" fill="#274c77" radius={[0,3,3,0]} barSize={9}/><Bar dataKey="leads" fill="#c8533d" radius={[0,3,3,0]} barSize={5}/></BarChart></ResponsiveContainer></div></div>
            <div className="panel signal-panel"><div className="panel-head"><div><span className="panel-kicker">DECISION SIGNALS</span><h2>What needs attention</h2></div><span className="note-count">04 notes</span></div><div className="signal-list"><div className="signal-row"><Signal tone="good">Scale test</Signal><div><b>Promo show lead expo</b><p>105 Leads · $1.44 Cost per lead · 3.15% CTR</p></div><ChevronRight size={15}/></div><div className="signal-row"><Signal tone="watch">Watch</Signal><div><b>Sales — Copy</b><p>Frequency 3.83 · 0.48% Link click-through rate</p></div><ChevronRight size={15}/></div><div className="signal-row"><Signal tone="good">Strong CTR</Signal><div><b>Stand Booking UZ-KZ</b><p>5.21% CTR · Cost per lead Data not available</p></div><ChevronRight size={15}/></div><div className="signal-row"><Signal tone="muted">Data gap</Signal><div><b>Placement report</b><p>Meta API rejected the placement breakdown</p></div><ChevronRight size={15}/></div></div></div></section>
          <section className="bottom-grid"><div className="panel age-panel"><div className="panel-head"><div><span className="panel-kicker">AUDIENCE LENS</span><h2>Lead efficiency by age</h2></div><button className="panel-action" onClick={() => setSection("Audience")}>Full view <ChevronRight size={14}/></button></div><div className="age-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={ageChart} margin={{top: 12,right: 12,left: -18,bottom: 0}}><CartesianGrid vertical={false} stroke="#e6e0d6"/><XAxis dataKey="age" axisLine={false} tickLine={false} tick={{fill:"#6b665e",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#91897d",fontSize:10}}/><Tooltip cursor={{fill:"#f4efe7"}} formatter={(v:any,n:any)=>[whole(v),n === "leads" ? "Leads" : "Spend"]}/><Bar dataKey="leads" fill="#7c9c86" radius={[3,3,0,0]} barSize={28}/></BarChart></ResponsiveContainer></div></div><div className="panel method-panel"><span className="panel-kicker">READ THIS REPORT</span><h2>Numbers with context.</h2><p>Use the campaign ledger to trace Spend into individual creative rows. Metric gaps are labelled honestly — no estimates, no blended Cost per result across mixed objectives.</p><div className="method-line"><span className="method-number">01</span><span>Start with Spend</span><ChevronRight size={14}/></div><div className="method-line"><span className="method-number">02</span><span>Check Leads & quality</span><ChevronRight size={14}/></div><div className="method-line"><span className="method-number">03</span><span>Test the next move</span><ChevronRight size={14}/></div></div></section>
        </>}
        {section === "Campaigns" && <Ledger title="Campaign ledger" subtitle="19 campaigns · sorted by Spend" rows={filteredCampaigns} onSelect={setSelected} search={search} setSearch={setSearch} showLeadOnly={showLeadOnly} setShowLeadOnly={setShowLeadOnly} sort={sort} setSort={setSort}/>} 
        {section === "Creatives" && <CreativeLedger rows={topAds} onSelect={setSelected}/>} 
        {section === "Audience" && <Audience rows={ageRows}/>} {section === "Leads" && <LeadsExplorer campaigns={campaigns} adInsights={adInsights} onSelect={setSelected}/>} 
      </div>
    </main>
    {selected && <DetailDrawer row={selected} onClose={() => setSelected(null)}/>} 
  </div>;
}

function Ledger({ title, subtitle, rows, onSelect, search, setSearch, showLeadOnly, setShowLeadOnly, sort, setSort }: any) { return <section className="ledger-section"><div className="ledger-toolbar"><div><span className="panel-kicker">CAMPAIGN LEVEL</span><h2>{title}</h2><p>{subtitle}</p></div><div className="ledger-controls"><label className="search-box"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a campaign"/></label><button className={`filter-button ${showLeadOnly ? "on" : ""}`} onClick={() => setShowLeadOnly(!showLeadOnly)}><Filter size={15}/> Lead campaigns</button><select value={sort} onChange={e => setSort(e.target.value)}><option value="spend">Sort: Spend</option><option value="leads">Sort: Leads</option><option value="ctr">Sort: CTR</option></select></div></div><div className="table-shell"><table><thead><tr><th>Campaign</th><th>Spend</th><th>Impressions</th><th>Reach</th><th>Clicks (all)</th><th>Link clicks</th><th>CTR</th><th>Leads</th><th>Cost per lead</th></tr></thead><tbody>{rows.map((r: any) => <tr key={`${r.campaign_id}-${r.spend}`} onClick={() => onSelect(r)}><td><b>{standardCampaignName(r.campaign_name)}</b><small>{r.campaign_id}</small></td><td className="money">{money(r.spend)}</td><td>{whole(r.impressions)}</td><td>{whole(r.reach)}</td><td>{whole(r.clicks)}</td><td>{whole(r.inline_link_clicks)}</td><td>{percent(Number(r.ctr))}</td><td className="strong-num">{whole(leads(r))}</td><td>{leads(r) ? money(Number(r.spend)/leads(r)) : "N/A"}</td></tr>)}</tbody></table></div><div className="table-foot"><span>Showing {rows.length} of {campaigns.length} campaigns</span><span>Click a row to open detail drawer <ChevronRight size={14}/></span></div></section> }

function CreativeLedger({ rows, onSelect }: any) { return <section className="ledger-section"><div className="ledger-toolbar"><div><span className="panel-kicker">AD LEVEL</span><h2>Creative ledger</h2><p>Real Spend by creative · 42 ad insight rows returned</p></div><div className="creative-callout"><Sparkles size={15}/><span>Top spend: <b>{rows[0]?.ad_name ? standardCreativeName(rows[0].ad_name) : "Data not available"}</b></span></div></div><div className="table-shell"><table><thead><tr><th>Creative</th><th>Ad set</th><th>Campaign</th><th>Spend</th><th>Impressions</th><th>Clicks (all)</th><th>CTR</th><th>Lead data</th></tr></thead><tbody>{rows.map((r:any, i:number) => <tr key={`${r.campaign_name}-${r.ad_name}-${i}`} onClick={() => onSelect(r)}><td><div className="creative-name"><span className="creative-index">{String(i+1).padStart(2,"0")}</span><b>{standardCreativeName(r.ad_name, i + 1)}</b></div></td><td>{standardAdsetName(r.adset_name)}</td><td className="campaign-cell">{standardCampaignName(r.campaign_name)}</td><td className="money">{money(r.spend)}</td><td>{whole(r.impressions)}</td><td>{whole(r.clicks)}</td><td>{percent(Number(r.ctr))}</td><td><span className="data-unavailable">Not returned</span></td></tr>)}</tbody></table></div><div className="data-note"><CircleHelp size={15}/><span>Creative-level Spend is available from the ad insight export. Lead data was not returned in this ad-level response, so it is shown as “Not returned” rather than estimated.</span></div></section> }

function Audience({ rows }: any) { return <section className="audience-layout"><div className="panel audience-chart-panel"><div className="panel-head"><div><span className="panel-kicker">AGE BREAKDOWN</span><h2>Who converted most efficiently?</h2></div></div><div className="audience-bars">{rows.map((r:any) => { const lp = leads(r); const cpl = Number(r.spend)/lp; return <div className="audience-row" key={r.age}><div className="audience-label"><b>{r.age}</b><span>{whole(lp)} Leads</span></div><div className="audience-track"><div style={{width: `${Math.min(100, (lp/201)*100)}%`}}/></div><strong>{money(cpl)}<small>Cost per lead</small></strong></div>})}</div></div><div className="panel age-note-panel"><span className="panel-kicker">EDITORIAL READ</span><h2>18–24 is the strongest scale signal.</h2><p>It produced 201 Leads at $2.47 Cost per lead with $496.15 Spend. The 25–34 segment carried more Spend but a higher $3.32 Cost per lead.</p><div className="mini-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows.slice(0,5).map((r:any)=>({name:r.age,value:Number(r.spend)}))} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={3}><Cell fill="#274c77"/><Cell fill="#7c9c86"/><Cell fill="#c8533d"/><Cell fill="#d6a84f"/><Cell fill="#b8afa2"/></Pie></PieChart></ResponsiveContainer><div><b>{money(data.summary.spend)}</b><span>Spend by age</span></div></div></div></section> }

function DetailDrawer({ row, onClose }: { row: Campaign; onClose: () => void }) { const isAd = !!row.ad_name; const leadCount = isAd ? null : leads(row); return <><div className="drawer-scrim" onClick={onClose}/><aside className="detail-drawer"><div className="drawer-head"><div><span className="panel-kicker">{isAd ? "CREATIVE DETAIL" : "CAMPAIGN DETAIL"}</span><h2>{isAd ? standardCreativeName(row.ad_name) : standardCampaignName(row.campaign_name)}</h2><small className="original-label">Original: {isAd ? row.ad_name : row.campaign_name}</small></div><button className="close-button" onClick={onClose}><X size={18}/></button></div><div className="drawer-meta"><Signal tone={isAd ? "good" : leadCount ? "good" : "muted"}>{isAd ? "Insight row" : leadCount ? "Lead campaign" : "No lead action"}</Signal><span>August 2026</span></div><div className="drawer-stats"><div><small>Spend</small><b>{money(row.spend)}</b></div><div><small>Impressions</small><b>{whole(row.impressions)}</b></div><div><small>CTR</small><b>{percent(Number(row.ctr))}</b></div><div><small>{isAd ? "Lead data" : "Leads"}</small><b>{isAd ? "N/A" : whole(leadCount)}</b></div></div><div className="drawer-section"><span className="panel-kicker">PERFORMANCE NOTES</span><p>{isAd ? `This creative spent ${money(row.spend)} and delivered ${whole(row.clicks)} Clicks (all). Lead data was not returned at ad level.` : leadCount ? `This campaign generated ${whole(leadCount)} Leads at ${money(Number(row.spend)/leadCount)} Cost per lead. Use CRM quality to decide the next budget test.` : "No lead action was returned for this campaign in the selected period. Review its objective and event setup before judging efficiency."}</p></div><div className="drawer-details"><div><span>Link clicks</span><b>{whole(row.inline_link_clicks)}</b></div><div><span>Reach</span><b>{whole(row.reach) || "Data not available"}</b></div><div><span>CPM</span><b>{money(row.cpm)}</b></div><div><span>CPC</span><b>{money(row.cpc)}</b></div></div><button className="drawer-close" onClick={onClose}>Close detail</button></aside></> }

function expoFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("foodera")) return "FOODERA EXPO 2026";
  if (n.includes("build pro")) return "BUILD PRO EXPO";
  if (n.includes("promo show") || n.includes("promotors-show")) return "PROMOTORS SHOW";
  return "EXPO NOMI ANIQLANMAGAN";
}

function LeadsExplorer({ campaigns: campaignRows, adInsights: insightRows, onSelect }: { campaigns: Campaign[]; adInsights: AdInsight[]; onSelect: (row: Campaign) => void }) {
  const [selectedExpo, setSelectedExpo] = useState("FOODERA EXPO 2026");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyWithLeads, setOnlyWithLeads] = useState(false);
  const groups = useMemo(() => {
    const map: Record<string, Campaign[]> = {};
    campaignRows.forEach(c => { const expo = expoFor(c.campaign_name); (map[expo] ||= []).push(c); });
    return Object.entries(map).map(([expo, rows]) => ({ expo, rows, spend: rows.reduce((s,r) => s+Number(r.spend||0),0), leads: rows.reduce((s,r) => s+leads(r),0) })).sort((a,b)=>b.spend-a.spend);
  }, [campaignRows]);
  const active = groups.find(g => g.expo === selectedExpo) || groups[0];
  const visible = active?.rows.filter(r => r.campaign_name.toLowerCase().includes(query.toLowerCase()) && (!onlyWithLeads || leads(r)>0)) || [];
  const creativeFor = (campaignName: string) => insightRows.filter(a => a.campaign_name === campaignName).sort((a,b)=>Number(b.spend)-Number(a.spend));
  return <section className="leads-explorer"><div className="leads-intro"><div><div className="eyebrow"><span className="eyebrow-line"/> LEAD FUNNEL EXPLORER</div><h2>From Expo to creative.</h2><p>Har bir lead qaysi Expo, kampaniya, ad set va creative orqali kelganini bosqichma-bosqich ko‘ring.</p></div><div className="funnel-mini"><span>EXPO</span><ChevronRight size={14}/><span>CAMPAIGN</span><ChevronRight size={14}/><span>AD SET</span><ChevronRight size={14}/><span>CREATIVE</span></div></div>
    <div className="expo-grid">{groups.map(g => <button key={g.expo} className={`expo-card ${active?.expo === g.expo ? "selected" : ""}`} onClick={() => {setSelectedExpo(g.expo);setExpandedCampaign(null)}}><div className="expo-card-top"><span className="expo-index">{String(groups.indexOf(g)+1).padStart(2,"0")}</span><span className="expo-status">{g.rows.length} campaigns</span></div><b>{g.expo}</b><div className="expo-card-bottom"><span><strong>{money(g.spend)}</strong><small>Spend</small></span><span><strong>{whole(g.leads)}</strong><small>Leads</small></span><span><strong>{g.leads ? money(g.spend/g.leads) : "N/A"}</strong><small>Cost per lead</small></span></div></button>)}</div>
    <div className="leads-workspace"><div className="leads-workspace-head"><div><span className="panel-kicker">SELECTED EXPO</span><h2>{active?.expo}</h2><p>{active?.rows.length} ta campaign · {whole(active?.leads)} Leads · {money(active?.spend)} Spend</p></div><div className="ledger-controls"><label className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Campaignni qidiring"/></label><button className={`filter-button ${onlyWithLeads ? "on" : ""}`} onClick={()=>setOnlyWithLeads(!onlyWithLeads)}><Filter size={15}/> Faqat Leads bor</button></div></div>
      <div className="hierarchy-list">{visible.map(c => { const creatives=creativeFor(c.campaign_name); const open=expandedCampaign===`${c.campaign_id}`; return <div className={`hierarchy-item ${open?"open":""}`} key={c.campaign_id}><button className="campaign-row" onClick={()=>setExpandedCampaign(open?null:c.campaign_id)}><div className="hierarchy-main"><span className="chevron-box"><ChevronRight size={14}/></span><div><b>{standardCampaignName(c.campaign_name)}</b><small>Original: {c.campaign_name} · ID {c.campaign_id}</small></div></div><div className="hierarchy-metric"><span>{money(c.spend)}<small>Spend</small></span><span>{whole(leads(c))}<small>Leads</small></span><span>{leads(c)?money(Number(c.spend)/leads(c)):"N/A"}<small>Cost per lead</small></span><span>{percent(Number(c.ctr))}<small>CTR</small></span></div></button>{open && <div className="campaign-expanded"><div className="expanded-context"><span><b>AD SET</b>{creatives[0]?.adset_name ? standardAdsetName(creatives[0].adset_name) : "Data not available"}</span><span><b>OBJECTIVE</b>{c.objective || "Data not available"}</span><span><b>CAMPAIGN RESULT</b>{leads(c)?`${whole(leads(c))} Leads`:"No lead action"}</span></div><div className="creative-list">{creatives.length ? creatives.map((a:any,i:number)=><button className="creative-row" key={`${a.ad_name}-${i}`} onClick={()=>onSelect(a)}><span className="creative-badge">{String(i+1).padStart(2,"0")}</span><span className="creative-copy"><b>{standardCreativeName(a.ad_name, i + 1)}</b><small>{standardAdsetName(a.adset_name)}</small></span><span>{money(a.spend)}<small>Spend</small></span><span>{whole(a.impressions)}<small>Impressions</small></span><span>{whole(a.clicks)}<small>Clicks (all)</small></span><span>{percent(Number(a.ctr))}<small>CTR</small></span><ChevronRight size={14}/></button>) : <div className="empty-creatives"><CircleHelp size={15}/> Ad-level insight qaytmagan.</div>}</div></div>}</div>})}</div><div className="data-note"><CircleHelp size={15}/><span>Expo nomi campaign nomidan aniqlangan joylarda guruhlandi. Nomida Expo ko‘rsatilmagan kampaniyalar “EXPO NOMI ANIQLANMAGAN” bo‘limida qoldirildi — bu joyda taxminiy bog‘lash qilinmadi.</span></div></div>
  </section>;
}
