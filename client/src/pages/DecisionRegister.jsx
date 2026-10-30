import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Scale,
  Search,
  ExternalLink,
  Calendar,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api/client';
import { SkeletonList } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/formatters';

export function DecisionRegister() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const fetchDecisions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listDecisions();
      setDecisions(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load decisions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  const filteredDecisions = decisions.filter(d => {
    const q = search.toLowerCase();
    return (
      (d.decision || '').toLowerCase().includes(q) ||
      (d.rationale || '').toLowerCase().includes(q) ||
      (d.meetingTitle || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ghost-text tracking-tight">
            Organizational Decision Register
          </h1>
          <p className="text-xs text-ghost-secondary mt-0.5">
            Confirmed architectural, product, and strategy choices documented with explicit rationale
          </p>
        </div>

        <span className="counter-badge">
          {decisions.length} Confirmed Decision{decisions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-ghost-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search decisions by keyword, technology, or rationale..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-base pl-9 py-1 text-xs"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="ghost-panel p-3 border-ghost-brickBorder bg-ghost-brickBg text-ghost-brick text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && <SkeletonList rows={5} />}

      {/* Empty State */}
      {!loading && filteredDecisions.length === 0 && (
        <EmptyState
          title={search ? 'No matching decisions found' : 'No decisions recorded'}
          description={
            search
              ? `No decisions match "${search}". Try searching another keyword.`
              : 'Confirmed agreements and choices will appear here once meeting transcripts are analyzed.'
          }
          actionText={search ? 'Clear Search' : 'Ingest a Meeting'}
          actionLink={search ? undefined : '/new'}
          onAction={search ? () => setSearch('') : undefined}
          icon={Scale}
        />
      )}

      {/* Decisions Log */}
      {!loading && filteredDecisions.length > 0 && (
        <div className="space-y-3">
          {filteredDecisions.map((item, idx) => (
            <div
              key={item.id || idx}
              className="ghost-panel p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-sm text-[10px] font-medium bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Confirmed Decision
                    </span>
                    <h3 className="text-xs font-semibold text-ghost-text">
                      {item.decision}
                    </h3>
                  </div>
                </div>

                <span className="text-[11px] text-[#172033] font-mono font-medium shrink-0">
                  {formatDate(item.meetingDate)}
                </span>
              </div>

              {/* Rationale callout */}
              <div className="p-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs text-ghost-text leading-relaxed">
                <strong className="text-ghost-secondary block text-[10px] uppercase tracking-wider mb-0.5">
                  Explicit Stated Rationale:
                </strong>
                {item.rationale}
              </div>

              {/* Source meeting footer */}
              <div className="pt-2 border-t border-ghost-border flex items-center justify-between text-[11px] text-ghost-secondary">
                <span>Source Brief: {item.meetingTitle || 'Meeting'}</span>
                {item.meetingId && (
                  <Link
                    to={`/meetings/${item.meetingId}`}
                    className="text-ghost-accent hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <span>View Dossier</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
