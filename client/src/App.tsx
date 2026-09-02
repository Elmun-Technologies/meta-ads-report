import { useState } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { DashboardProvider, useDashboardContext } from "./contexts/DashboardContext";
import { CommandPalette, Sidebar, Topbar } from "./components/shell";
import { DetailDrawer } from "./components/DetailDrawer";
import Overview from "./pages/Overview";
import Campaigns from "./pages/Campaigns";
import Creatives from "./pages/Creatives";
import Audience from "./pages/Audience";
import LeadsExplorer from "./pages/LeadsExplorer";
import Pipeline from "./pages/Pipeline";
import Compare from "./pages/Compare";
import Report from "./pages/Report";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";

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
    <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>
      <AlertTriangle size={30} style={{ color: "var(--warn)", marginBottom: 12 }} />
      <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Ma'lumot olinmadi</h3>
      <p style={{ color: "var(--text-2)", fontSize: 12.5, maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>{error}</p>
      <button className="primary-btn" style={{ margin: "0 auto" }} onClick={() => void refresh()}>
        Qayta urinish
      </button>
    </div>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const { loading, error } = useDashboardContext();

  return (
    <div className="shell">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && <div className="nav-scrim show" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="content" key={loading ? "loading" : error ? "error" : "ready"}>
          {loading ? <LoadingState /> : error ? <ErrorState error={error} /> : (
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
