import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  PlusCircle,
  Calendar,
  Layers,
  ArrowRight,
  Trash2,
  AlertCircle,
  List,
  LayoutGrid
} from 'lucide-react';
import { api } from '../api/client';
import { SkeletonList } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/formatters';

export function MeetingsList() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'actions'
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [deletingId, setDeletingId] = useState(null);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listMeetings();
      setMeetings(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleDelete = async (id, title, e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm(`Delete "${title}" and all its deliverables?`)) {
      return;
    }

    try {
      setDeletingId(id);
      await api.deleteMeeting(id);
      setMeetings(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert('Failed to delete meeting: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  let filtered = meetings.filter(m => {
    const q = searchTerm.toLowerCase();
    return (
      (m.title || '').toLowerCase().includes(q) ||
      (m.summary || '').toLowerCase().includes(q) ||
      (m.department || '').toLowerCase().includes(q)
    );
  });

  filtered.sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt);
    }
    if (sortBy === 'actions') {
      return (b.actionItems || []).length - (a.actionItems || []).length;
    }
    return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ghost-text tracking-tight">
            Meetings Library
          </h1>
          <p className="text-xs text-ghost-secondary mt-0.5">
            Documented briefings, transcripts, and intelligence reports
          </p>
        </div>
        <span className="counter-badge">
          {filtered.length} of {meetings.length} records shown
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-ghost-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search meetings by title, topic, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-base pl-9 text-xs"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input-base text-xs w-auto py-1 cursor-pointer"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="actions">Sort: Most Deliverables</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-sm bg-ghost-muted border border-ghost-border p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-sm text-xs transition-colors ${
                viewMode === 'list' ? 'bg-white text-[#172033] border border-ghost-border font-semibold shadow-xs' : 'text-[#172033] hover:text-[#5145CD]'
              }`}
              title="Table / List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-sm text-xs transition-colors ${
                viewMode === 'grid' ? 'bg-white text-[#172033] border border-ghost-border font-semibold shadow-xs' : 'text-[#172033] hover:text-[#5145CD]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <Link to="/new" className="btn-primary shrink-0">
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ingest Meeting</span>
          </Link>
        </div>
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
      {!loading && filtered.length === 0 && (
        <EmptyState
          title={searchTerm ? 'No matching meetings found' : 'Your meetings library is empty'}
          description={
            searchTerm
              ? `No meetings match "${searchTerm}". Clear search or adjust your filter.`
              : 'Add your first meeting transcript or import the official demo sample to begin.'
          }
          actionText={searchTerm ? 'Clear Search' : 'Ingest New Meeting'}
          actionLink={searchTerm ? undefined : '/new'}
          onAction={searchTerm ? () => setSearchTerm('') : undefined}
        />
      )}

      {/* View Mode 1: Compact Table View */}
      {!loading && filtered.length > 0 && viewMode === 'list' && (
        <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                  <th className="py-2.5 px-3.5">Meeting Brief Title</th>
                  <th className="py-2.5 px-3.5">Date</th>
                  <th className="py-2.5 px-3.5">Scope</th>
                  <th className="py-2.5 px-3.5">Deliverables</th>
                  <th className="py-2.5 px-3.5">Decisions</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EB]">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F4F6FA] transition-colors group">
                    <td className="py-3 px-3.5 max-w-md">
                      <div className="space-y-0.5">
                        <Link
                          to={`/meetings/${m.id}`}
                          className="font-semibold text-[#172033] group-hover:text-[#5145CD] transition-colors block text-xs"
                        >
                          {m.title}
                        </Link>
                        <p className="text-[11px] text-ghost-secondary line-clamp-1 leading-normal">
                          {m.summary}
                        </p>
                      </div>
                    </td>

                    <td className="py-3 px-3.5 text-[#172033] font-mono text-[11px] font-medium whitespace-nowrap">
                      {formatDate(m.date)}
                    </td>

                    <td className="py-3 px-3.5">
                      <span className="px-2 py-0.5 rounded-sm text-[10px] bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE] font-medium">
                        {m.department || 'General'}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-[#172033] font-mono text-[11px] font-semibold">
                      {(m.actionItems || []).length}
                    </td>

                    <td className="py-3 px-3.5 text-[#172033] font-mono text-[11px] font-semibold">
                      {(m.decisions || []).length}
                    </td>

                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        <Link
                          to={`/meetings/${m.id}`}
                          className="p-1.5 text-[#172033] hover:text-[#5145CD] rounded hover:bg-ghost-muted"
                          title="Open Brief"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={(e) => handleDelete(m.id, m.title, e)}
                          disabled={deletingId === m.id}
                          className="p-1.5 text-ghost-secondary hover:text-ghost-brick rounded hover:bg-ghost-brickBg"
                          title="Delete meeting"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Mode 2: Grid View */}
      {!loading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="ghost-panel-interactive p-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-ghost-secondary">
                  <span className="px-1.5 py-0.5 rounded-sm bg-ghost-muted text-ghost-secondary border border-ghost-border font-medium text-[10px]">
                    {m.department || 'General'}
                  </span>
                  <span className="font-mono">{formatDate(m.date)}</span>
                </div>

                <Link
                  to={`/meetings/${m.id}`}
                  className="font-medium text-ghost-text hover:text-ghost-accent text-xs block line-clamp-1 transition-colors"
                >
                  {m.title}
                </Link>

                <p className="text-[11px] text-ghost-secondary line-clamp-3 leading-relaxed">
                  {m.summary}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-ghost-border flex items-center justify-between text-[11px] text-ghost-secondary">
                <div className="flex items-center gap-2">
                  <span>{(m.actionItems || []).length} tasks</span>
                  <span>•</span>
                  <span>{(m.decisions || []).length} decisions</span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => handleDelete(m.id, m.title, e)}
                    disabled={deletingId === m.id}
                    className="p-1 text-ghost-secondary hover:text-ghost-brick rounded"
                    title="Delete meeting"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <Link
                    to={`/meetings/${m.id}`}
                    className="p-1 text-[#172033] hover:text-[#5145CD] rounded"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
