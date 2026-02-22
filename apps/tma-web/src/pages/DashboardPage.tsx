import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">Welcome, {user?.name ?? 'User'}</h1>
      <p className="text-tg-hint text-sm mb-6">SOP Builder Dashboard</p>

      <div className="grid grid-cols-2 gap-3">
        <DashboardCard
          icon="📝"
          label="New SOP"
          description="Start a new interview"
          to="/sops?action=new"
        />
        <DashboardCard icon="📋" label="My SOPs" description="View all SOPs" to="/sops" />
        <DashboardCard icon="✅" label="Approvals" description="Pending reviews" to="/approvals" />
        <DashboardCard icon="🧩" label="Templates" description="SOP templates" to="/templates" />
        <DashboardCard icon="👥" label="Roles" description="RBAC overview" to="/roles" />
        <DashboardCard icon="📈" label="Analytics" description="Usage insights" to="/analytics" />
        <DashboardCard
          icon="🧾"
          label="Audit Logs"
          description="Security events"
          to="/audit-logs"
        />
        <DashboardCard icon="💳" label="Billing" description="Plan & credits" to="/billing" />
      </div>

      <div className="mt-6 bg-tg-secondary rounded-xl p-4">
        <h2 className="font-semibold mb-2">Quick Tips</h2>
        <ul className="text-sm text-tg-hint space-y-1">
          <li>• Create SOPs through guided interviews</li>
          <li>• Set up review cycles to keep SOPs current</li>
          <li>• Use checklists for daily compliance tracking</li>
          <li>• Export to HTML, Markdown, or JSON</li>
        </ul>
      </div>
    </div>
  );
}

function DashboardCard({
  icon,
  label,
  description,
  to,
}: {
  icon: string;
  label: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="bg-tg-secondary rounded-xl p-4 flex flex-col items-center text-center hover:opacity-80 transition-opacity"
    >
      <span className="text-3xl mb-2">{icon}</span>
      <span className="font-semibold text-sm">{label}</span>
      <span className="text-xs text-tg-hint">{description}</span>
    </Link>
  );
}
