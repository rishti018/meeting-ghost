import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  PlusCircle,
  CheckSquare,
  Scale,
  MessageSquareQuote,
  Sliders,
  Ghost,
  Database,
  GitBranch,
  X
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/meetings', label: 'Meetings Library', icon: Layers },
  { to: '/new', label: 'Ingest Meeting', icon: PlusCircle },
  { to: '/tasks', label: 'Action Tracker', icon: CheckSquare },
  { to: '/decisions', label: 'Decision Register', icon: Scale },
  { to: '/developer-insights', label: 'Developer Insights', icon: GitBranch },
  { to: '/ask', label: 'Ask Meetings', icon: MessageSquareQuote },
  { to: '/settings', label: 'Workspace & Diagnostics', icon: Sliders },
];

export function Sidebar({ mobileOpen, onClose, systemHealth }) {
  const isMongoLive = systemHealth?.database?.isLiveMongo;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0B101B]/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-60 bg-[#172033] border-r border-[#23304B] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-14 px-4 border-b border-[#23304B] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-[#5145CD] text-white flex items-center justify-center shadow-sm">
              <Ghost className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#F8FAFC] block leading-tight">
                Meeting Ghost
              </span>
              <span className="text-[11px] text-[#C2CBDA] font-normal tracking-tight block">
                Meeting Intelligence
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-[#C2CBDA] hover:text-[#F8FAFC] rounded hover:bg-[#26334B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center space-x-2.5 px-2.5 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#303F5B] text-[#F8FAFC] font-semibold border-l-2 border-[#5145CD] pl-2'
                      : 'text-[#C2CBDA] hover:text-[#F8FAFC] hover:bg-[#26334B]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 text-inherit" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Truthful datastore diagnostics footer */}
        <div className="p-3 border-t border-[#23304B] bg-[#131B2B] text-[11px]">
          <div className="p-2 rounded-sm bg-[#1A2438] border border-[#26344F] flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-[#C2CBDA]">
              <Database className="w-3.5 h-3.5 text-[#C2CBDA]" />
              <span>Storage:</span>
            </div>
            <span className={`font-medium ${isMongoLive ? 'text-[#4ADE80]' : 'text-[#A5B4FC]'}`}>
              {isMongoLive ? 'MongoDB Atlas' : 'Local File Store'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
