import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Clock,
  ArrowRight,
  Scale,
  PlusCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { api } from '../api/client';
import { StatCard } from '../components/StatCard';
import { SkeletonCard, SkeletonList } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { PriorityBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/formatters';

export function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [analyticsRes, tasksRes] = await Promise.all([
        api.getAnalytics(),
        api.listTasks({ status: 'Pending' }).catch(() => ({ data: [] }))
      ]);
      setAnalytics(analyticsRes.data);
      setTasks(tasksRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSeedDemo = async () => {
    try {
      setSeeding(true);
      await api.seedDemoData();
      await fetchData();
    } catch (err) {
      alert('Failed to load sample dataset: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SkeletonCard count={4} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <SkeletonList rows={4} />
          </div>
          <div>
            <SkeletonList rows={4} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ghost-panel p-4 border-ghost-brickBorder bg-ghost-brickBg text-ghost-brick flex items-start space-x-2.5 text-xs">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="space-y-1 flex-1">
          <p className="font-medium">Failed to load workspace overview</p>
          <p className="text-ghost-secondary">{error}</p>
          <button onClick={fetchData} className="btn-secondary mt-2">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const hasData = analytics && analytics.totalMeetings > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="ghost-panel p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <h2 className="text-xl font-semibold text-ghost-text">
              Meeting Intelligence Workspace
            </h2>
            <p className="text-xs sm:text-sm text-ghost-secondary leading-relaxed">
              Transform transcripts, meeting notes, and team recordings into structured briefings, actionable deliverables with deadlines, and confirmed decisions.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="btn-secondary"
            >
              {seeding ? 'Loading Sample...' : 'Load Sample Hackathon Data'}
            </button>
            <Link to="/new" className="btn-primary">
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Ingest Meeting</span>
            </Link>
          </div>
        </div>

        <EmptyState
          title="No meetings documented yet"
          description="Submit a meeting transcript to extract intelligence, or load our preloaded sample dataset to evaluate the platform."
          actionText="Ingest Meeting"
          actionLink="/new"
        />
      </div>
    );
  }

  const activeTasksCount = (analytics.pendingTasks || 0) + (analytics.inProgressTasks || 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ghost-text tracking-tight">
            Workspace Briefing
          </h1>
          <p className="text-xs text-ghost-secondary mt-0.5">
            Active meeting proceedings, pending commitments, and organizational decisions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="counter-badge">
            {analytics.totalMeetings} sessions logged
          </span>
          <Link to="/new" className="btn-primary">
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ingest Meeting</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Meetings Analyzed"
          value={analytics.totalMeetings}
          subtitle="Processed transcripts"
          icon={FileText}
        />
        <StatCard
          title="Active Deliverables"
          value={activeTasksCount}
          subtitle={`${analytics.pendingTasks} pending, ${analytics.inProgressTasks} in progress`}
          icon={Clock}
        />
        <StatCard
          title="Task Completion"
          value={`${analytics.completionPercentage}%`}
          subtitle={`${analytics.completedTasks} of ${analytics.totalTasks} completed`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Decisions Documented"
          value={analytics.totalDecisions ?? analytics.decisionCount ?? (Array.isArray(analytics.recentMeetings) ? analytics.recentMeetings.reduce((acc, m) => acc + (m.decisionCount || 0), 0) : 0)}
          subtitle="Confirmed agreements"
          icon={Scale}
        />
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Meeting Briefs & Pending Work */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Meetings Briefs */}
          <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB]">
            <div className="p-3.5 border-b border-[#DCE2EB] flex items-center justify-between bg-[#FFFFFF]">
              <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                Recent Meeting Briefs
              </span>
              <Link
                to="/meetings"
                className="text-xs text-[#5145CD] hover:underline font-medium flex items-center gap-1"
              >
                <span>All Meetings ({analytics.totalMeetings})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="divide-y divide-ghost-border">
              {(analytics.recentMeetings || []).map((m) => (
                <Link
                  key={m.id}
                  to={`/meetings/${m.id}`}
                  className="p-3.5 block hover:bg-ghost-muted/40 transition-colors group"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ghost-text group-hover:text-ghost-accent transition-colors">
                          {m.title}
                        </span>
                        {m.isDemo && (
                          <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
                            Sample
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ghost-secondary line-clamp-2 leading-relaxed">
                        {m.summary}
                      </p>
                    </div>
                    <span className="text-[11px] text-[#172033] font-mono font-medium shrink-0">
                      {formatDate(m.date)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[#526078]">
                    <span className="font-semibold text-[#172033]">
                      {m.actionCount} deliverable{m.actionCount !== 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-[#172033]">
                      {m.decisionCount} decision{m.decisionCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Pending Commitments Work Queue */}
          <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB]">
            <div className="p-3.5 border-b border-[#DCE2EB] flex items-center justify-between bg-[#FFFFFF]">
              <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                Pending Commitments Requiring Action
              </span>
              <Link
                to="/tasks"
                className="text-xs text-[#5145CD] hover:underline font-medium flex items-center gap-1"
              >
                <span>Action Tracker</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {tasks.length > 0 ? (
              <div className="divide-y divide-ghost-border">
                {tasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ghost-text truncate">
                          {t.task}
                        </span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#526078]">
                        <span className="font-semibold text-[#5145CD]">{t.owner}</span>
                        <span>•</span>
                        <span className="text-[#172033] font-medium">Deadline: {t.deadline}</span>
                      </div>
                    </div>

                    {t.meetingId && (
                      <Link
                        to={`/meetings/${t.meetingId}`}
                        className="text-[#172033] hover:text-[#5145CD] p-1 rounded hover:bg-ghost-muted"
                        title="View meeting dossier"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-ghost-secondary">
                All assigned deliverables are completed.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Work Queue Assignees & Question Prompt */}
        <div className="space-y-6">
          {/* Assigned Deliverables by Owner */}
          <div className="ghost-panel p-4 space-y-3">
            <span className="text-[11px] font-semibold text-ghost-secondary uppercase tracking-wider block">
              Deliverables by Owner
            </span>
            {Array.isArray(analytics.topOwners) && analytics.topOwners.length > 0 ? (
              <div className="space-y-1.5">
                {analytics.topOwners.map((item) => (
                  <div
                    key={item.owner || 'unassigned'}
                    className="flex items-center justify-between py-2 px-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs"
                  >
                    <span className="font-medium text-[#172033]">{item.owner}</span>
                    <span className="text-[11px] font-mono text-[#526078] font-medium">
                      {item.count} task{item.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ghost-secondary py-3 text-center">No assigned owners yet.</p>
            )}
          </div>

          {/* Ask Meetings Callout */}
          <div className="ghost-panel p-4 space-y-2.5 bg-[#FFFFFF] border border-[#C7D2FE]">
            <h3 className="text-xs font-semibold text-[#5145CD] uppercase tracking-wider">
              Ask Your Meetings
            </h3>
            <p className="text-xs text-ghost-secondary leading-relaxed">
              Query your recorded meeting archives using natural language. Get answers backed by exact verbatim transcript citations.
            </p>
            <div className="pt-1.5">
              <Link to="/ask" className="btn-secondary w-full text-center justify-center font-medium">
                Query Meetings Engine
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
