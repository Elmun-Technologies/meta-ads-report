import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import {
  DashboardProvider,
  useDashboardContext,
} from "./contexts/DashboardContext";
import { setCurrency } from "@/lib/format";
import { CommandPalette, Sidebar, Topbar } from "./components/shell";
import { DetailDrawer } from "./components/DetailDrawer";

// Sahifalar lazy yuklanadi — faqat ochilgan bo'limning kodi yuklanadi
// (dastlabki bundle hajmini kamaytiradi).
const Overview = lazy(() => import("./pages/Overview"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Creatives = lazy(() => import("./pages/Creatives"));
const Audience = lazy(() => import("./pages/Audience"));
const LeadsExplorer = lazy(() => import("./pages/LeadsExplorer"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Compare = lazy(() => import("./pages/Compare"));
const Report = lazy(() => import("./pages/Report"));
const Connections = lazy(() => import("./pages/Connections"));
const NotFound = lazy(() => import("./pages/NotFound"));

function LoadingState() {
  return (
    <div className="grid-12">
      <div className="col-4 skeleton" style={{ height: 130 }} />
      <div className="col-4 skeleton" style={{ height: 130 }} />
      <div className="col-4 skeleton" style={{ height: 130 }} />
      <div className="col-8 skeleton" style={{ height: 320 }} />
      <div className="col-4 skeleton" style={{ height: 320 }} />
      <div className="col-7 skeleton" style={{ height: 280 }} />
      <div className="col-5 skeleton" style={{ height: 280 }} />
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  const { refresh } = useDashboardContext();
  return (
    <div
      className="panel"
      style={{ textAlign: "center", padding: "48px 24px" }}
    >
      <AlertTriangle
        size={30}
        style={{ color: "var(--warn)", marginBottom: 12 }}
      />
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
        Ma'lumotni o'qib bo'lmadi
      </h3>
      <p
        style={{
          color: "var(--text-2)",
          fontSize: 12.5,
          maxWidth: 520,
          margin: "0 auto 10px",
          lineHeight: 1.6,
        }}
      >
        Serverdan ma'lumot olinmadi va build vaqtidagi zaxira fayl ham
        topilmadi. Sabab: {error}
      </p>
      <p
        style={{
          color: "var(--text-3)",
          fontSize: 11.5,
          maxWidth: 520,
          margin: "0 auto 16px",
          lineHeight: 1.6,
        }}
      >
        Lokal ishga tushirishda <b>API server</b> ham ishlab turganini
        tekshiring. Vercel kabi statik hostingda esa loyihani
        <b> pnpm build</b> bilan qayta yig'ish kerak — unda ma'lumot statik
        faylga yoziladi.
      </p>
      <button
        className="primary-btn"
        style={{ margin: "0 auto" }}
        onClick={() => void refresh()}
      >
        Qayta urinish
      </button>
    </div>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const { loading, error, snapshot } = useDashboardContext();

  // Account valyutasini formatlarga qo'llash (UZS/RUB bo'lsa $ o'rniga)
  useEffect(() => {
    setCurrency(snapshot?.meta.account.currency);
  }, [snapshot?.meta.account.currency]);

  return (
    <div className="shell">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <div className="nav-scrim show" onClick={() => setNavOpen(false)} />
      )}
      <div className="main">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main
          className="content"
          key={loading ? "loading" : error ? "error" : "ready"}
        >
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} />
          ) : (
            <Suspense fallback={<LoadingState />}>
              <Switch>
                <Route path="/" component={Overview} />
                <Route path="/campaigns" component={Campaigns} />
                <Route path="/creatives" component={Creatives} />
                <Route path="/audience" component={Audience} />
                <Route path="/leads" component={LeadsExplorer} />
                <Route path="/pipeline" component={Pipeline} />
                <Route path="/compare" component={Compare} />
                <Route path="/report" component={Report} />
                <Route path="/connections" component={Connections} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          )}
        </main>
      </div>
      <DetailDrawer />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <DashboardProvider>
          <Shell />
        </DashboardProvider>
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  );
}
