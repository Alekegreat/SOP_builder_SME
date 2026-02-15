import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/sops', label: 'SOPs', icon: '📋' },
  { path: '/approvals', label: 'Approvals', icon: '✅' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/billing', label: 'Billing', icon: '💳' },
  { path: '/settings', label: 'More', icon: '⚙️' },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text flex flex-col">
      <main className="flex-1 pb-16">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-tg-secondary border-t border-tg-hint/20">
        <div className="flex justify-around items-center h-14">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));


            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 text-xs ${
                  isActive ? 'text-tg-button' : 'text-tg-hint'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
