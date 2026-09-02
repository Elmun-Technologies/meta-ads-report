import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useDashboard, type DashboardState } from "@/lib/useDashboard";

export type Theme = "dark" | "light";

export type DrawerTarget = { type: "campaign" | "creative"; id: string } | null;

interface DashboardContextValue extends DashboardState {
  theme: Theme;
  toggleTheme: () => void;
  drawer: DrawerTarget;
  openCampaign: (id: string) => void;
  openCreative: (id: string) => void;
  closeDrawer: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const data = useDashboard();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  const openCampaign = useCallback((id: string) => setDrawer({ type: "campaign", id }), []);
  const openCreative = useCallback((id: string) => setDrawer({ type: "creative", id }), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  // ⌘K / Ctrl+K — command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<DashboardContextValue>(
    () => ({ ...data, theme, toggleTheme, drawer, openCampaign, openCreative, closeDrawer, paletteOpen, setPaletteOpen }),
    [data, theme, toggleTheme, drawer, openCampaign, openCreative, closeDrawer, paletteOpen],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardContext() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardContext DashboardProvider ichida ishlatilishi kerak");
  return ctx;
}
