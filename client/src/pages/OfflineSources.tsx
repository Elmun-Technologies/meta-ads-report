import { useState } from "react";
import { Megaphone, Plus, Link as LinkIcon, BarChart3 } from "lucide-react";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { setCurrency } from "@/lib/format";
import { PageHint } from "@/components/Help";
import { toast } from "sonner";

export default function OfflineSources() {
  const { refresh } = useDashboardContext();
  const [loading, setLoading] = useState(false);

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
        })
      });
      if (res.ok) {
        toast.success("Офлайн источник добавлен!");
        e.currentTarget.reset();
        await refresh();
      } else {
        toast.error("Произошла ошибка");
      }
    } catch (err) {
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <PageHint>
        Здесь вы можете измерить эффективность офлайн-каналов (например, стенд на выставке, флаер с QR-кодом, баннер или визитки).
      </PageHint>

      <div className="grid-12" style={{ marginTop: 24 }}>
        <div className="col-12 panel" style={{ padding: "32px 40px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Megaphone size={24} style={{ color: "var(--text)" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 4px", color: "var(--text)" }}>Добавить офлайн источник</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>Создайте новый офлайн-канал и введите сумму расходов на него</p>
            </div>
          </div>

          <form onSubmit={handleAddCampaign} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, marginBottom: 8, color: "var(--text-2)", fontWeight: 500 }}>Название источника (Например: Expo Banner)</label>
              <input name="name" required placeholder="Название" className="panel" style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, marginBottom: 8, color: "var(--text-2)", fontWeight: 500 }}>Общий расход (сум/$)</label>
              <input name="spend" type="number" required placeholder="0" className="panel" style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, marginBottom: 8, color: "var(--text-2)", fontWeight: 500 }}>Выставка (Expo)</label>
              <input name="expo" defaultValue="General" className="panel" style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", background: "var(--bg)", borderRadius: 6, color: "var(--text)" }} />
            </div>
            <button type="submit" disabled={loading} className="primary-btn" style={{ padding: "10px 20px", height: 42, display: "flex", gap: 8, alignItems: "center" }}>
              <Plus size={16} /> Добавить
            </button>
          </form>
        </div>

        <div className="col-12">
          <div className="empty-state" style={{ padding: 60, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 12 }}>
            <BarChart3 size={40} style={{ color: "var(--text-3)", margin: "0 auto 16px" }} />
            <h3 style={{ margin: "0 0 8px", color: "var(--text)" }}>Пока нет данных</h3>
            <p style={{ margin: 0, color: "var(--text-2)", fontSize: 14 }}>Список источников появится здесь после подключения к базе.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
