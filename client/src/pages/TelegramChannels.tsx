import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Plus,
  RefreshCw,
  Eye,
  Heart,
  Share2,
  MessageCircle,
  Users,
  TrendingUp,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { PageHint } from "@/components/Help";
import { toast } from "sonner";
import { money, whole, compact, pct } from "@/lib/format";

interface TelegramChannel {
  id: string;
  username: string;
  name: string;
  subscribers: number;
  avgPostReach: number;
  advReach12h: number;
  advReach24h: number;
  advReach48h: number;
  errPercent: number;
  dailyReach: number;
  forwardsCount: number;
  mentionsCount: number;
  postsCount: number;
  syncedAt: string;
  posts: TelegramPost[];
}

interface TelegramPost {
  id: string;
  text: string;
  date: string;
  views: number;
  shares: number;
  forwards: number;
  reactions: number;
  commentsCount: number;
  link: string;
  cost: number;
  channel?: { username: string; name: string };
}

export default function TelegramChannels() {
  const { refresh } = useDashboardContext();
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [editCost, setEditCost] = useState<{ postId: string; value: string } | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels ?? []);
        setHasToken(data.hasToken ?? false);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const addChannel = async () => {
    if (!newUsername.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/telegram/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.channel?.name ?? newUsername} добавлен!`);
        setNewUsername("");
        await loadChannels();
        void refresh();
      } else {
        toast.error(data.error ?? "Произошла ошибка");
      }
    } catch {
      toast.error("Нет связи с сервером");
    } finally {
      setAdding(false);
    }
  };

  const syncChannel = async (id: string) => {
    setSyncing(id);
    try {
      const res = await fetch(`/api/telegram/channels/${id}/sync`);
      if (res.ok) {
        toast.success("Данные обновлены!");
        await loadChannels();
      } else {
        toast.error("Ошибка синхронизации");
      }
    } catch {
      toast.error("Нет связи с сервером");
    } finally {
      setSyncing(null);
    }
  };

  const saveCost = async (postId: string, cost: number) => {
    try {
      const res = await fetch(`/api/telegram/posts/${postId}/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost }),
      });
      if (res.ok) {
        toast.success("Цена сохранена");
        await loadChannels();
        setEditCost(null);
      }
    } catch {
      toast.error("Ошибка");
    }
  };

  if (loading) {
    return <div className="empty-state">Загрузка…</div>;
  }

  const totalPosts = channels.reduce((s, ch) => s + ch.posts.length, 0);
  const totalViews = channels.reduce(
    (s, ch) => s + ch.posts.reduce((ps, p) => ps + p.views, 0),
    0
  );
  const totalCost = channels.reduce(
    (s, ch) => s + ch.posts.reduce((ps, p) => ps + p.cost, 0),
    0
  );
  const totalReactions = channels.reduce(
    (s, ch) => s + ch.posts.reduce((ps, p) => ps + p.reactions, 0),
    0
  );

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">Telegram · TGStat API</span>
          <h1>Telegram Каналы</h1>
          <p>
            {channels.length} каналов подключено · отслеживается {totalPosts} постов
            {!hasToken && (
              <span style={{ color: "var(--warn)", marginLeft: 8 }}>
                ⚠ TGSTAT_TOKEN не настроен — добавьте в файл .env
              </span>
            )}
          </p>
        </div>
      </div>

      <PageHint>
        Добавьте @username вашего Telegram канала — через TGStat API
        автоматически загрузятся подписчики, охваты, посты и реакции.
      </PageHint>

      {/* Kanal qo'shish */}
      <div
        className="panel"
        style={{ marginBottom: 14, padding: "16px 20px" }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Send size={18} style={{ color: "#0088cc", flex: "none" }} />
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addChannel()}
            placeholder="Введите @channelname или username"
            style={{
              flex: 1,
              minWidth: 200,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--panel-2)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <button
            className="primary-btn"
            onClick={addChannel}
            disabled={adding || !newUsername.trim()}
            style={{ gap: 6 }}
          >
            <Plus size={14} />
            {adding ? "Добавление…" : "Добавить канал"}
          </button>
        </div>
      </div>

      {/* Umumiy KPI */}
      {channels.length > 0 && (
        <div className="grid-12" style={{ marginBottom: 14 }}>
          <div className="col-3">
            <div className="kpi-card">
              <small className="kpi-label">
                <Users size={11} style={{ display: "inline", marginRight: 4 }} />
                Всего подписчиков
              </small>
              <b className="kpi-value" style={{ color: "#0088cc" }}>
                {compact(channels.reduce((s, ch) => s + ch.subscribers, 0))}
              </b>
            </div>
          </div>
          <div className="col-3">
            <div className="kpi-card">
              <small className="kpi-label">
                <Eye size={11} style={{ display: "inline", marginRight: 4 }} />
                Всего просмотров
              </small>
              <b className="kpi-value" style={{ color: "var(--cyan)" }}>
                {compact(totalViews)}
              </b>
            </div>
          </div>
          <div className="col-3">
            <div className="kpi-card">
              <small className="kpi-label">
                <Heart size={11} style={{ display: "inline", marginRight: 4 }} />
                Всего реакций
              </small>
              <b className="kpi-value" style={{ color: "var(--violet)" }}>
                {compact(totalReactions)}
              </b>
            </div>
          </div>
          <div className="col-3">
            <div className="kpi-card">
              <small className="kpi-label">
                <DollarSign size={11} style={{ display: "inline", marginRight: 4 }} />
                Общий расход
              </small>
              <b className="kpi-value" style={{ color: "var(--good)" }}>
                {totalCost > 0 ? money(totalCost) : "—"}
              </b>
              {totalCost > 0 && totalViews > 0 && (
                <small style={{ color: "var(--text-3)", fontSize: 10 }}>
                  CPV: {money(totalCost / totalViews)}
                </small>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kanallar va Postlar */}
      {channels.length === 0 ? (
        <div className="panel" style={{ padding: 32, textAlign: "center" }}>
          <Send size={32} style={{ color: "var(--text-3)", marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 6px" }}>Telegram каналы еще не добавлены</h3>
          <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>
            Добавьте каналы, введя @username в поле выше.
            Если TGStat API подключен, статистика будет загружаться автоматически.
          </p>
        </div>
      ) : (
        channels.map((ch) => (
          <div key={ch.id} className="panel" style={{ marginBottom: 14 }}>
            {/* Kanal sarlavhasi */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #0088cc, #00aaff)",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  flex: "none",
                }}
              >
                TG
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{ch.name}</b>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {ch.username} · {compact(ch.subscribers)} подписчиков · ERR{" "}
                  {pct(ch.errPercent, 1)} · Средний охват{" "}
                  {compact(ch.avgPostReach)}
                </div>
              </div>
              <button
                className={`icon-btn ${syncing === ch.id ? "spin" : ""}`}
                onClick={() => syncChannel(ch.id)}
                title="Обновить из TGStat"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Kanal KPI qatorlari */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {[
                { l: "Подписчики", v: compact(ch.subscribers), c: "#0088cc" },
                { l: "Средний охват", v: compact(ch.avgPostReach), c: "var(--cyan)" },
                { l: "Рекламный 24ч", v: compact(ch.advReach24h), c: "var(--violet)" },
                { l: "ERR %", v: pct(ch.errPercent, 1), c: "var(--warn)" },
                { l: "Дневной охват", v: compact(ch.dailyReach), c: "var(--good)" },
                { l: "Репосты", v: whole(ch.forwardsCount), c: "var(--text-2)" },
              ].map((k) => (
                <div key={k.l} className="mini-stat">
                  <small>{k.l}</small>
                  <b style={{ color: k.c }}>{k.v}</b>
                </div>
              ))}
            </div>

            {/* Postlar jadvali */}
            {ch.posts.length > 0 && (
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Пост</th>
                      <th>Дата</th>
                      <th>
                        <Eye size={11} /> Просмотры
                      </th>
                      <th>
                        <Heart size={11} /> Реакции
                      </th>
                      <th>
                        <Share2 size={11} /> Поделились
                      </th>
                      <th>
                        <MessageCircle size={11} /> Комментарии
                      </th>
                      <th>
                        <DollarSign size={11} /> Цена
                      </th>
                      <th>CPV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ch.posts.map((p) => {
                      const cpv =
                        p.cost > 0 && p.views > 0
                          ? p.cost / p.views
                          : null;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div
                              className="cell-name"
                              style={{ maxWidth: 200 }}
                            >
                              <span className="n">
                                <b>
                                  {p.text
                                    ? p.text.slice(0, 60) +
                                      (p.text.length > 60 ? "…" : "")
                                    : "—"}
                                </b>
                              </span>
                            </div>
                          </td>
                          <td className="num" style={{ fontSize: 11 }}>
                            {new Date(p.date).toLocaleDateString("ru")}
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {compact(p.views)}
                          </td>
                          <td className="num">{whole(p.reactions)}</td>
                          <td className="num">{whole(p.shares)}</td>
                          <td className="num">{whole(p.commentsCount)}</td>
                          <td className="num">
                            {editCost?.postId === p.id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editCost.value}
                                onChange={(e) =>
                                  setEditCost({
                                    postId: p.id,
                                    value: e.target.value,
                                  })
                                }
                                onBlur={() =>
                                  saveCost(p.id, Number(editCost.value) || 0)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    saveCost(
                                      p.id,
                                      Number(editCost.value) || 0
                                    );
                                  if (e.key === "Escape") setEditCost(null);
                                }}
                                style={{
                                  width: 70,
                                  padding: "2px 6px",
                                  borderRadius: 6,
                                  border: "1px solid var(--accent)",
                                  background: "var(--panel-2)",
                                  color: "var(--text)",
                                  fontSize: 12,
                                }}
                              />
                            ) : (
                              <button
                                className="ghost-btn"
                                onClick={() =>
                                  setEditCost({
                                    postId: p.id,
                                    value: String(p.cost || ""),
                                  })
                                }
                                style={{
                                  fontSize: 12,
                                  padding: "2px 6px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  color:
                                    p.cost > 0
                                      ? "var(--good)"
                                      : "var(--text-3)",
                                }}
                                title="Нажмите, чтобы изменить цену"
                              >
                                {p.cost > 0 ? money(p.cost) : "ввести"}
                              </button>
                            )}
                          </td>
                          <td className="num">
                            {cpv != null ? (
                              <span style={{ color: "var(--good)" }}>
                                {money(cpv)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {ch.posts.length === 0 && (
              <div
                className="empty-state"
                style={{ padding: 16, fontSize: 12 }}
              >
                Посты еще не загружены — нажмите кнопку «Обновить» или добавьте
                токен TGStat в .env
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
