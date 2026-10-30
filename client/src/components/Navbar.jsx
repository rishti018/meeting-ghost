import React from 'react';
import { Menu, PlusCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const VIEW_METADATA = {
  '/': { title: 'Workspace Overview', subtitle: 'Recent meeting briefs and pending commitments' },
  '/meetings': { title: 'Meetings Library', subtitle: 'All documented sessions, transcripts, and intelligence reports' },
  '/new': { title: 'Ingest Meeting', subtitle: 'Analyze transcripts, dialogue notes, or text files' },
  '/tasks': { title: 'Action Tracker', subtitle: 'Cross-meeting deliverables, assigned owners, and deadlines' },
  '/decisions': { title: 'Decision Register', subtitle: 'Documented architectural, product, and organizational decisions' },
  '/ask': { title: 'Ask Meetings', subtitle: 'Grounded intelligence query engine with transcript citations' },
  '/settings': { title: 'Workspace & Diagnostics', subtitle: 'System infrastructure, datastore, and demo dataset controls' },
};

export function Navbar({ onOpenMobileSidebar }) {
  const location = useLocation();
  const currentPath = location.pathname.startsWith('/meetings/') && location.pathname !== '/meetings'
    ? '/meetings'
    : location.pathname;

  const meta = VIEW_METADATA[currentPath] || {
    title: 'Meeting Intelligence',
    subtitle: 'Meeting Ghost Platform'
  };

  const showIngestAction = location.pathname === '/' || location.pathname === '/meetings';

  return (
    <header className="h-14 border-b border-[#23304B] bg-[#172033] sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-1.5 text-[#C2CBDA] hover:text-[#F8FAFC] rounded hover:bg-[#26334B]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div>
          <h1 className="text-sm font-semibold text-[#F8FAFC] tracking-tight leading-tight">
            {meta.title}
          </h1>
          <p className="hidden md:block text-[11px] text-[#C2CBDA] leading-tight">
            {meta.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2.5">
        {showIngestAction && (
          <Link
            to="/new"
            className="btn-primary shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ingest Meeting</span>
          </Link>
        )}
      </div>
    </header>
  );
}
