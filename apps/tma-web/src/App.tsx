import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { Layout } from './components/Layout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { SopListPage } from './pages/SopListPage.js';
import { SopDetailPage } from './pages/SopDetailPage.js';
import { InterviewPage } from './pages/InterviewPage.js';
import { ApprovalsPage } from './pages/ApprovalsPage.js';
import { BillingPage } from './pages/BillingPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { VersionHistoryPage } from './pages/VersionHistoryPage';
import { RolesPage } from './pages/RolesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { LoadingSpinner } from './components/LoadingSpinner.js';

export function App() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">SOP Builder</h1>
          <p className="text-tg-hint">Please open this app from Telegram.</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sops" element={<SopListPage />} />
        <Route path="/sops/:id" element={<SopDetailPage />} />
        <Route path="/sops/:id/interview" element={<InterviewPage />} />
        <Route path="/sops/:id/versions" element={<VersionHistoryPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
