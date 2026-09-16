import { Fragment, useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Users } from "lucide-react";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { ago, dateLabel, money, whole } from "@/lib/format";
import { PageHint } from "@/components/Help";
import { Panel } from "@/components/widgets";
import { toast } from "sonner";

interface OfflineCampaign {
  id: string;
  name: string;
  expo: string;
  createdAt: string;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    linkClicks: number;
    leadsCount: number;
  };
}

interface OfflineLead {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  createdAt: string;
  stageName: string;
  price: number;
  campaignId: string | null;
}

export default function OfflineSources() {
  const { refresh, lastEventAt } = useDashboardContext();
  const [campaigns, setCampaigns] = useState<OfflineCampaign[] | null>(null);
  const [leads, setLeads] = useState<OfflineLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [leadFor, setLeadFor] = useState<string | null>(null);

  /** Ro'yxatni yuklash — har real-time hodimada (lastEventAt) qayta chaqriladi */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/channels/offline");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
        setLeads(data.leads ?? []);
      } else {
        setCampaigns([]);
      }
    } catch {
      setCampaigns(prev => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, lastEventAt]);

  const handleAddCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/channels/offline/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          spend: Number(formData.get("spend") || 0),
          expo: formData.get("expo") || "General",
        }),
      });
      if (res.ok) {
        toast.success("Offline manba qo'shildi!");
        e.currentTarget.reset();
        await Promise.all([load(), refresh()]);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLead = async (campaignId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/channels/offline/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone") || undefined,
          price: Number(formData.get("price") || 0),
          campaignId,
        }),
      });
      if (res.ok) {
        toast.success("Murojaat qo'shildi — umumiy hisobga kirdi");
        setLeadFor(null);
        await Promise.all([load(), refresh()]);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Tarmoq xatosi");
    } finally {
      setLoading(false);
    }
  };

  const totalSpend = (campaigns ?? []).reduce((s, c) => s + (c.metrics.spend || 0), 0);
  const totalLeads = (campaigns ?? []).reduce((s, c) => s + (c.metrics.leadsCount || 0), 0);
  const campaignName = (id: string | null) =>
    id ? (campaigns ?? []).find(c => c.id === id)?.name ?? "—" : "—";

  return (
    <div className="fade-in">
      <PageHint>
        Bu yerda offline kanallar samaradorligini o'lchaysiz (masalan: ko'rgazmadagi
        stend, QR-kodli flyer, banner yoki vizitkalar). Sarf va murojaatlarni
        kiritasiz — ular darhol umumiy hisobga (yagona oyna) qo'shiladi.
      </PageHint>

      <div className="grid-12" style={{ marginTop: 24 }}>
        {/* Qo'shish formasi */}
        <div className="col-5">
          <Panel
            kicker="Offline manba qo'shish"
            title="Yangi kanal yarating"
            sub="Nomi, sarf summasi va qaysi ko'rgazmaga tegishliligi"
            style={{ height: "100%" }}
          >
            <form onSubmit={handleAddCampaign} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--text-2)", fontWeight: 500 }}>
                  Manba nomi (masalan: Expo Banner)
                </label>
                <input
                  name="name"
                  required
                  placeholder="Nomi"
                  className="panel"
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--text-2)", fontWeight: 500 }}>
                  Umumiy sarf (so'm/$)
                </label>
                <input
                  name="spend"
                  type="number"
                  step="any"
                  required
                  placeholder="0"
                  className="panel"
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--text-2)", fontWeight: 500 }}>
                  Ko'rgazma (Expo)
                </label>
                <input
                  name="expo"
                  defaultValue="General"
                  className="panel"
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }}
                />
              </div>
              <button type="submit" disabled={loading} className="primary-btn" style={{ padding: "10px 20px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                <Plus size={16} /> Qo'shish
              </button>
            </form>
          </Panel>
        </div>

        {/* Ro'yxat */}
        <div className="col-7">
          <Panel
            kicker="Offline manbalar"
            title="Qanday ishlayapti?"
            sub={
              campaigns == null
                ? "Yuklanmoqda…"
                : `${campaigns.length} manba · ${money(totalSpend)} sarf · ${whole(totalLeads)} murojaat` +
                  (totalLeads > 0 ? ` · ${money(totalSpend / totalLeads)} / murojaat` : "")
            }
            style={{ height: "100%" }}
          >
            {campaigns != null && campaigns.length === 0 && (
              <div className="empty-state">
                <Megaphone size={28} style={{ margin: "0 auto 10px", color: "var(--text-3)" }} />
                Hozircha offline manba yo'q — chapdagi forma orqali qo'shing.
              </div>
            )}
            {campaigns != null && campaigns.length > 0 && (
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>Manba</th>
                      <th>Expo</th>
                      <th>Sarf</th>
                      <th>Murojaat</th>
                      <th>Narxi</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const cpl = c.metrics.leadsCount > 0 ? c.metrics.spend / c.metrics.leadsCount : null;
                      return (
                        <Fragment key={c.id}>
                          <tr>
                            <td>
                              <div className="cell-name">
                                <span className="n">
                                  <b>{c.name}</b>
                                  <small>qo'shilgan: {ago(c.createdAt)}</small>
                                </span>
                              </div>
                            </td>
                            <td>{c.expo}</td>
                            <td className="num">{money(c.metrics.spend)}</td>
                            <td className="num">{whole(c.metrics.leadsCount)}</td>
                            <td className="num">{cpl != null ? money(cpl) : "—"}</td>
                            <td>
                              <button
                                className="primary-btn"
                                style={{ padding: "5px 10px", fontSize: 11 }}
                                onClick={() => setLeadFor(leadFor === c.id ? null : c.id)}
                              >
                                <Plus size={11} /> Murojaat
                              </button>
                            </td>
                          </tr>
                          {leadFor === c.id && (
                            <tr>
                              <td colSpan={6}>
                                <form
                                  onSubmit={e => void handleAddLead(c.id, e)}
                                  style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 10, alignItems: "center", padding: "4px 0" }}
                                >
                                  <input name="name" required placeholder="Mijoz ismi" className="panel" style={{ padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
                                  <input name="phone" placeholder="+998.." className="panel" style={{ padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
                                  <input name="price" type="number" step="any" placeholder="Summa" className="panel" style={{ padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
                                  <button type="submit" disabled={loading} className="primary-btn" style={{ padding: "8px 14px", fontSize: 11.5 }}>
                                    Saqlash
                                  </button>
                                </form>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Oxirgi offline murojaatlar */}
        <div className="col-12">
          <Panel
            kicker="Offline murojaatlar"
            title="Oxirgi kiritilganlar"
            sub="Har biri umumiy voronka va CRM hisobiga kiradi"
            action={
              <span className="chip muted">
                <Users size={10} style={{ marginRight: 4, display: "inline" }} />
                {leads.length} ta
              </span>
            }
          >
            {leads.length === 0 ? (
              <div className="empty-state">
                Hozircha offline murojaat yo'q — jadvaldagi «Murojaat» tugmasi orqali qo'shing.
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>Ism</th>
                      <th>Telefon</th>
                      <th>Manba</th>
                      <th>Summa</th>
                      <th>Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...leads]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 15)
                      .map(l => (
                        <tr key={l.id}>
                          <td className="mono" style={{ fontSize: 11 }}>
                            {dateLabel(l.createdAt)}
                          </td>
                          <td>
                            <b style={{ fontSize: 12.5 }}>{l.name}</b>
                          </td>
                          <td className="mono" style={{ fontSize: 11.5 }}>
                            {l.phone ?? "—"}
                          </td>
                          <td>{campaignName(l.campaignId)}</td>
                          <td className="num">{l.price > 0 ? money(l.price) : "—"}</td>
                          <td>
                            <span className="chip muted">{l.stageName}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
