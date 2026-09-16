/**
 * Telegram kanal statistikasi — TGStat API integratsiyasi (JSON store ustida).
 *
 * Endpointlar:
 *   GET  /api/telegram/channels        — barcha ulangan kanallar
 *   POST /api/telegram/channels        — yangi kanal qo'shish (@username)
 *   GET  /api/telegram/channels/:id/sync — kanalni TGStat dan yangilash
 *   GET  /api/telegram/posts           — kanal postlari (query: channelId)
 *   POST /api/telegram/posts/:id/cost  — post uchun narx kiritish
 *
 * Har bir o'zgarish SSE orqali barcha clientlarga broadcast qilinadi.
 */
import { Router } from "express";
import { broadcast } from "../app";
import { getStore, mutate, logActivity, type TelegramChannel } from "../store";
import { registerTelegramSyncer } from "../sync";
import { tgstatToken } from "../oauthApps";

const TGSTAT_BASE = "https://api.tgstat.ru";

/** Token .env DAN yoki UI'dan kiritilgan holda (server/data/store.json) olinadi */
function getToken(): string | null {
  return tgstatToken();
}

async function tgstatGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const token = getToken();
  if (!token) return null;
  const qs = new URLSearchParams({ token, ...params }).toString();
  try {
    const res = await fetch(`${TGSTAT_BASE}${endpoint}?${qs}`);
    if (!res.ok) {
      console.error(`[tgstat] ${endpoint} → ${res.status} ${res.statusText}`);
      return null;
    }
    const json = await res.json() as any;
    if (json.status !== "ok") {
      console.error(`[tgstat] ${endpoint} → status: ${json.status}`, json.error);
      return null;
    }
    return json.response as T;
  } catch (err) {
    console.error(`[tgstat] ${endpoint} xato:`, err);
    return null;
  }
}

interface TGStatChannelStat {
  id: number;
  title: string;
  username: string;
  participants_count: number;
  avg_post_reach: number;
  adv_post_reach_12h: number;
  adv_post_reach_24h: number;
  adv_post_reach_48h: number;
  err_percent: number;
  daily_reach: number;
  forwards_count: number;
  mentions_count: number;
  posts_count: number;
}

interface TGStatPost {
  id: number;
  date: number; // unix timestamp
  views: number;
  link: string;
  channel_id: number;
  forwarded_from: number | null;
  is_deleted: number;
  text: string;
  media?: { type: string };
  forwards?: number;
  reactions?: number;
  shares?: number;
  comments_count?: number;
}

export const telegramRouter = Router();

// GET /api/telegram/channels — barcha kanallar
telegramRouter.get("/channels", (_req, res) => {
  try {
    const channels = getStore().channels.map(ch => ({
      ...ch,
      posts: [...ch.posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    }));
    const hasToken = !!getToken();
    res.json({ channels, hasToken });
  } catch (err) {
    console.error("[telegram] channels list xato:", err);
    res.status(500).json({ error: "Kanallar ro'yxatini o'qishda xato" });
  }
});

// POST /api/telegram/channels — yangi kanal qo'shish
telegramRouter.post("/channels", async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username) {
    res.status(400).json({ error: "username maydoni kerak (@channelname)" });
    return;
  }

  const cleanUsername = username.startsWith("@") ? username : `@${username}`;

  // TGStat dan kanal ma'lumotlarini olish
  const stat = await tgstatGet<TGStatChannelStat>("/channels/stat", {
    channelId: cleanUsername,
  });

  try {
    const now = new Date().toISOString();
    const channel = mutate(store => {
      const existing = store.channels.find(c => c.username === cleanUsername);
      const fields = {
        name: stat?.title ?? cleanUsername,
        subscribers: stat?.participants_count ?? 0,
        avgPostReach: stat?.avg_post_reach ?? 0,
        advReach12h: stat?.adv_post_reach_12h ?? 0,
        advReach24h: stat?.adv_post_reach_24h ?? 0,
        advReach48h: stat?.adv_post_reach_48h ?? 0,
        errPercent: stat?.err_percent ?? 0,
        dailyReach: stat?.daily_reach ?? 0,
        forwardsCount: stat?.forwards_count ?? 0,
        mentionsCount: stat?.mentions_count ?? 0,
        postsCount: stat?.posts_count ?? 0,
        tgstatId: stat?.id ?? null,
        syncedAt: now,
      };
      if (existing) {
        Object.assign(existing, fields);
        return existing;
      }
      const created: TelegramChannel = {
        id: `tg-${cleanUsername.replace(/[^a-z0-9_]/gi, "")}-${Date.now()}`,
        username: cleanUsername,
        createdAt: now,
        posts: [],
        ...fields,
      };
      store.channels.push(created);
      return created;
    });

    // Postlarni ham sync qilish
    if (stat?.id) {
      await syncChannelPosts(channel.id, cleanUsername);
    }

    logActivity({
      kind: "channel",
      source: "telegram",
      tone: "good",
      title: `Telegram kanal qo'shildi: ${channel.name}`,
      body: stat ? `${stat.participants_count} obunachi · TGStat'dan sinxronlandi` : "TGStat token yo'q — qo'lda kiritildi",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "telegram-channel-added" });
    res.json({ channel, synced: !!stat });
  } catch (err) {
    console.error("[telegram] kanal qo'shishda xato:", err);
    res.status(500).json({ error: "Kanal qo'shishda xato yuz berdi" });
  }
});

// GET /api/telegram/channels/:id/sync — kanalni qayta sync qilish
telegramRouter.get("/channels/:id/sync", async (req, res) => {
  try {
    const channel = getStore().channels.find(c => c.id === req.params.id);
    if (!channel) {
      res.status(404).json({ error: "Kanal topilmadi" });
      return;
    }

    const stat = await tgstatGet<TGStatChannelStat>("/channels/stat", {
      channelId: channel.username,
    });

    if (stat) {
      mutate(store => {
        const c = store.channels.find(x => x.id === channel.id);
        if (!c) return;
        c.name = stat.title;
        c.subscribers = stat.participants_count;
        c.avgPostReach = stat.avg_post_reach;
        c.advReach12h = stat.adv_post_reach_12h ?? 0;
        c.advReach24h = stat.adv_post_reach_24h ?? 0;
        c.advReach48h = stat.adv_post_reach_48h ?? 0;
        c.errPercent = stat.err_percent;
        c.dailyReach = stat.daily_reach;
        c.forwardsCount = stat.forwards_count;
        c.mentionsCount = stat.mentions_count;
        c.postsCount = stat.posts_count;
        c.tgstatId = stat.id;
        c.syncedAt = new Date().toISOString();
      });

      await syncChannelPosts(channel.id, channel.username);
    }

    const updated = getStore().channels.find(c => c.id === channel.id) ?? null;
    logActivity({
      kind: "channel",
      source: "telegram",
      tone: stat ? "good" : "warn",
      title: `Kanal yangilandi: ${updated?.name ?? channel.username}`,
      body: stat ? "TGStat'dan ma'lumot tortildi" : "TGStat javob bermadi (token/limit)",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "telegram-sync" });
    res.json({ channel: updated, synced: !!stat });
  } catch (err) {
    console.error("[telegram] sync xato:", err);
    res.status(500).json({ error: "Kanalni yangilashda xato" });
  }
});

// GET /api/telegram/posts — kanal postlari
telegramRouter.get("/posts", (req, res) => {
  try {
    const channelId = req.query.channelId ? String(req.query.channelId) : null;
    const store = getStore();
    const channels = channelId ? store.channels.filter(c => c.id === channelId) : store.channels;
    const posts = channels.flatMap(c =>
      [...c.posts]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30)
        .map(p => ({ ...p, channel: { username: c.username, name: c.name } }))
    );
    res.json({ posts });
  } catch (err) {
    console.error("[telegram] posts xato:", err);
    res.status(500).json({ error: "Postlarni o'qishda xato" });
  }
});

// POST /api/telegram/posts/:id/cost — post narxini kiritish
telegramRouter.post("/posts/:id/cost", (req, res) => {
  const { cost } = req.body as { cost?: number };
  if (cost == null || cost < 0) {
    res.status(400).json({ error: "cost maydoni kerak (0 yoki undan katta son)" });
    return;
  }
  try {
    const post = mutate(store => {
      for (const ch of store.channels) {
        const p = ch.posts.find(x => x.id === req.params.id);
        if (p) {
          p.cost = cost;
          return p;
        }
      }
      return null;
    });
    if (!post) {
      res.status(404).json({ error: "Post topilmadi" });
      return;
    }
    logActivity({
      kind: "channel",
      source: "telegram",
      tone: "info",
      title: "Post narxi kiritildi",
      body: `Reklama narxi: ${cost}`,
    });
    broadcast("sync", { at: new Date().toISOString(), source: "telegram-cost" });
    res.json({ post });
  } catch (err) {
    console.error("[telegram] cost update xato:", err);
    res.status(500).json({ error: "Narx yangilashda xato" });
  }
});

/* ------------------------------------------------------------------ */
/* TGStat pull (sync dvigateli uchun ham ishlatiladi)                  */
/* ------------------------------------------------------------------ */

/** TGStat dan kanal postlarini tortib, store'ga yozish */
async function syncChannelPosts(dbChannelId: string, username: string) {
  const posts = await tgstatGet<{ items: TGStatPost[] }>("/channels/posts", {
    channelId: username,
    limit: "30",
  });

  if (!posts?.items) return;

  mutate(store => {
    const ch = store.channels.find(c => c.id === dbChannelId);
    if (!ch) return;
    for (const p of posts.items!) {
      if (p.is_deleted) continue;
      const postId = String(p.id);
      const fields = {
        text: (p.text ?? "").slice(0, 500),
        date: new Date(p.date * 1000).toISOString(),
        views: p.views ?? 0,
        shares: p.shares ?? 0,
        forwards: p.forwards ?? 0,
        reactions: p.reactions ?? 0,
        commentsCount: p.comments_count ?? 0,
        link: p.link ?? "",
        syncedAt: new Date().toISOString(),
      };
      const existing = ch.posts.find(x => x.id === postId);
      if (existing) {
        Object.assign(existing, fields);
      } else {
        ch.posts.push({
          id: postId,
          tgstatPostId: postId,
          channelId: dbChannelId,
          cost: 0,
          ...fields,
        });
      }
    }
    // Eng yangi 60 post saqlanadi
    ch.posts.sort((a, b) => b.date.localeCompare(a.date));
    if (ch.posts.length > 60) ch.posts.length = 60;
  });
}

/** Barcha kanallarni TGStat'dan yangilash — sync.ts uchun ro'yxatdan o'tkaziladi */
async function syncAllTelegram(): Promise<{ channels: number; posts: number }> {
  const channels = getStore().channels;
  let posts = 0;
  for (const ch of channels) {
    const stat = await tgstatGet<TGStatChannelStat>("/channels/stat", { channelId: ch.username });
    if (stat) {
      mutate(store => {
        const c = store.channels.find(x => x.id === ch.id);
        if (!c) return;
        c.name = stat.title;
        c.subscribers = stat.participants_count;
        c.avgPostReach = stat.avg_post_reach;
        c.advReach12h = stat.adv_post_reach_12h ?? 0;
        c.advReach24h = stat.adv_post_reach_24h ?? 0;
        c.advReach48h = stat.adv_post_reach_48h ?? 0;
        c.errPercent = stat.err_percent;
        c.dailyReach = stat.daily_reach;
        c.forwardsCount = stat.forwards_count;
        c.mentionsCount = stat.mentions_count;
        c.postsCount = stat.posts_count;
        c.tgstatId = stat.id;
        c.syncedAt = new Date().toISOString();
      });
      const before = getStore().channels.find(x => x.id === ch.id)?.posts.length ?? 0;
      await syncChannelPosts(ch.id, ch.username);
      const after = getStore().channels.find(x => x.id === ch.id)?.posts.length ?? 0;
      posts += after;
      void before;
    }
  }
  return { channels: channels.length, posts };
}

registerTelegramSyncer(syncAllTelegram);

/** Unified snapshot uchun Telegram ma'lumotlari */
export function getTelegramStats() {
  return getStore().channels;
}
