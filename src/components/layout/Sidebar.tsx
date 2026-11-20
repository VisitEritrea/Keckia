import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Users2,
  CalendarDays,
  Compass,
  FileCheck2,
  Ticket as TicketIcon,
  Truck,
  Layers,
  Building,
  MessageSquare,
  DollarSign,
  ShieldCheck,
  UserCog,
  SlidersHorizontal,
} from 'lucide-react';
import { ActiveTab } from '../../types';
import { BRAND } from '../../../shared/brand';
import { BrandLockup } from '../brand/BrandLogo';
import { ROLES, canView, getRoleDefinition, type ModuleKey, type RoleKey } from '../../../shared/roles';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  urgentAlertCount: number;
  role: RoleKey;
  redFlagCount?: number;
}

interface NavItem {
  id: ActiveTab;
  module: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string | null;
  group: 'Operations' | 'Commercial' | 'Control';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  urgentAlertCount,
  role,
  redFlagCount = 0,
}) => {
  const [roleVersion, setRoleVersion] = useState(0);

  useEffect(() => {
    const handleRoleUpdate = () => {
      setRoleVersion((v) => v + 1);
    };
    window.addEventListener('roles_updated', handleRoleUpdate);
    window.addEventListener('storage', handleRoleUpdate);
    return () => {
      window.removeEventListener('roles_updated', handleRoleUpdate);
      window.removeEventListener('storage', handleRoleUpdate);
    };
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', module: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null, group: 'Operations' },
    { id: 'packages', module: 'packages', label: 'Tour Operations', icon: Layers, badge: null, group: 'Operations' },
    { id: 'tours', module: 'tours', label: 'Tour Schedules', icon: CalendarDays, badge: null, group: 'Operations' },
    { id: 'hotels', module: 'hotels', label: 'Hotels & Lodging', icon: Building, badge: null, group: 'Operations' },
    { id: 'transport', module: 'transport', label: 'Transport & Fleet', icon: Truck, badge: null, group: 'Operations' },
    { id: 'tourists', module: 'tourists', label: 'Tourists & Leads', icon: Compass, badge: null, group: 'Operations' },
    { id: 'tickets', module: 'tickets', label: 'Ticketing', icon: TicketIcon, badge: null, group: 'Commercial' },
    {
      id: 'documents',
      module: 'documents',
      label: 'Visas & Permits',
      icon: FileCheck2,
      badge: urgentAlertCount > 0 ? `${urgentAlertCount} Alert` : null,
      group: 'Commercial',
    },
    { id: 'messages', module: 'messages', label: 'Messages', icon: MessageSquare, badge: null, group: 'Commercial' },
    { id: 'hr', module: 'hr', label: 'Staff & HR', icon: Users2, badge: null, group: 'Control' },
    { id: 'finance', module: 'finance', label: 'Finance & Ledger', icon: DollarSign, badge: null, group: 'Control' },
    {
      id: 'audit',
      module: 'audit',
      label: 'Audit & Controls',
      icon: ShieldCheck,
      badge: redFlagCount > 0 ? `${redFlagCount} Flag` : null,
      group: 'Control',
    },
    { id: 'accounts', module: 'accounts', label: 'Staff Accounts', icon: UserCog, badge: null, group: 'Control' },
    { id: 'admin', module: 'admin', label: 'Admin & Setup', icon: SlidersHorizontal, badge: null, group: 'Control' },
  ];

  const visible = useMemo(() => {
    return navItems.filter((item) => canView(role, item.module));
  }, [role, roleVersion]);

  const groups: Array<NavItem['group']> = ['Operations', 'Commercial', 'Control'];
  const activeRoleDef = getRoleDefinition(role);

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 text-slate-900 select-none z-30 shadow-xs">
      {/* Brand Lockup */}
      <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
        <BrandLockup subtitle="Operations Hub" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {groups.map((group) => {
          const items = visible.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="pb-3">
              <div className="px-3 pb-1.5 pt-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                {group}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-tab-${item.id}`}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-150 group cursor-pointer ${
                      isActive
                        ? 'bg-brand-50 text-brand-900 font-bold border-l-2 border-brand-500 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-brand-500'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                          item.id === 'documents' || item.id === 'audit'
                            ? 'bg-rose-500 text-white'
                            : 'bg-brand-100 text-brand-800'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* Companion Workspace Navigation Link */}
        <a
          href="https://eritreavisit-companion-oct31.sniffweb.chatgpt.site/"
          target="_blank"
          rel="noopener noreferrer"
          className="block mx-1 mt-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="truncate text-xs font-bold text-slate-900 group-hover:text-brand-600">
              Companion workspace ↗
            </span>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-bold">
              Demo
            </span>
          </div>
          <span className="block mt-0.5 text-[11px] font-normal text-slate-500 leading-tight">
            Design demo · separate from live records
          </span>
        </a>
      </nav>

      {/* Role Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          Signed In
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 truncate">
            {activeRoleDef.label}
          </span>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-brand-500 text-white font-bold">
            {role}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 truncate">
          {activeRoleDef.description}
        </p>
      </div>
    </aside>
  );
};
