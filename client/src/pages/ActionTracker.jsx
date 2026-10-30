import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Calendar,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Github,
  GitPullRequest,
  RefreshCw,
  GitCommit
} from 'lucide-react';
import { api } from '../api/client';
import { PriorityBadge } from '../components/StatusBadge';
import { SkeletonList } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { SegmentedCountdown } from '../components/SegmentedCountdown';
import { GitHubLinkModal } from '../components/GitHubLinkModal';
import {
  formatDate,
  formatDateTime,
  toDateTimeLocalString,
  getCountdown,
  checkIsOverdue,
  formatTimeAgo
} from '../utils/formatters';

export function ActionTracker() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());

  // Deadline Inline Editing State
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState(null);
  const [editDeadlineValue, setEditDeadlineValue] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [ownerFilter, setOwnerFilter] = useState('All');
  const [updatingId, setUpdatingId] = useState(null);

  // GitHub Link & Sync State
  const [linkingTask, setLinkingTask] = useState(null);
  const [syncingTaskId, setSyncingTaskId] = useState(null);

  const handleTaskLinked = (updatedTask) => {
    if (!updatedTask) return;
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
  };

  const handleSyncGitHub = async (taskId) => {
    try {
      setSyncingTaskId(taskId);
      const res = await api.syncTaskWithGitHub(taskId);
      if (res?.data) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...res.data } : t));
      }
    } catch (err) {
      alert('GitHub sync failed: ' + err.message);
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleUnlinkGitHub = async (taskId) => {
    if (!window.confirm('Unlink GitHub resource from this task?')) return;
    try {
      setSyncingTaskId(taskId);
      const res = await api.unlinkTaskFromGitHub(taskId);
      if (res?.data) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...res.data, github: null } : t));
      }
    } catch (err) {
      alert('Failed to unlink: ' + err.message);
    } finally {
      setSyncingTaskId(null);
    }
  };

  // Live 1-second ticker to update all countdowns in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listTasks();
      setTasks(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      setUpdatingId(taskId);
      const res = await api.updateTask(taskId, { status: newStatus });
      if (res && res.data) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...res.data } : t));
      } else {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      }
    } catch (err) {
      alert('Failed to update task status: ' + err.message);
      await fetchTasks();
    } finally {
      setUpdatingId(null);
    }
  };

  const startEditDeadline = (task) => {
    setEditingDeadlineTaskId(task.id);
    if (task.dueDateTime) {
      setEditDeadlineValue(toDateTimeLocalString(task.dueDateTime));
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      d.setHours(17, 0, 0, 0);
      setEditDeadlineValue(toDateTimeLocalString(d));
    }
  };

  const handleSaveDeadline = async (taskId) => {
    try {
      setUpdatingId(taskId);
      const parsedDate = editDeadlineValue ? new Date(editDeadlineValue) : null;
      const res = await api.updateTask(taskId, {
        dueDateTime: parsedDate ? parsedDate.toISOString() : null,
        deadline: parsedDate ? formatDateTime(parsedDate) : 'Not specified',
      });
      if (res && res.data) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...res.data } : t));
      } else {
        setTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          dueDateTime: parsedDate ? parsedDate.toISOString() : null,
          deadline: parsedDate ? formatDateTime(parsedDate) : 'Not specified',
        } : t));
      }
      setEditingDeadlineTaskId(null);
    } catch (err) {
      alert('Failed to update deadline: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelEditDeadline = () => {
    setEditingDeadlineTaskId(null);
    setEditDeadlineValue('');
  };

  const uniqueOwners = Array.from(new Set(tasks.map(t => t.owner).filter(Boolean)));

  const filteredTasks = tasks.filter(t => {
    const matchesSearch =
      (t.task || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.owner || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.meetingTitle || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
    const matchesOwner = ownerFilter === 'All' || t.owner === ownerFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesOwner;
  });

  const completedCount = tasks.filter(t => t.status === 'Completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'In Progress').length;
  const pendingCount = tasks.filter(t => t.status === 'Pending').length;
  const completionPercentage = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ghost-text tracking-tight">
            Action Deliverables Queue
          </h1>
          <p className="text-xs text-ghost-secondary mt-0.5">
            Cross-meeting commitments, assigned owners, and live DD:HH:MM:SS deadline tracking
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-24 bg-ghost-border rounded-xs h-1.5 overflow-hidden">
            <div
              className="bg-ghost-accent h-1.5 rounded-xs transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="counter-badge">
            {completedCount}/{tasks.length} Completed ({completionPercentage}%)
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status Tabs */}
        <div className="flex items-center rounded-sm bg-ghost-muted border border-ghost-border p-0.5 text-xs">
          {['All', 'Pending', 'In Progress', 'Completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-2.5 py-1 rounded-sm text-xs transition-colors ${
                statusFilter === tab
                  ? 'bg-white text-[#172033] font-semibold border border-ghost-border shadow-xs'
                  : 'text-[#172033] font-medium hover:text-[#5145CD]'
              }`}
            >
              {tab} {tab === 'All' ? `(${tasks.length})` : tab === 'Pending' ? `(${pendingCount})` : tab === 'In Progress' ? `(${inProgressCount})` : `(${completedCount})`}
            </button>
          ))}
        </div>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="input-base text-xs w-auto py-1 cursor-pointer"
        >
          <option value="All">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        {/* Owner Filter */}
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="input-base text-xs w-auto py-1 cursor-pointer"
        >
          <option value="All">All Assignees</option>
          {uniqueOwners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-ghost-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks, assignees, meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-8 py-1 text-xs"
          />
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
      {loading && <SkeletonList rows={6} />}

      {/* Empty State */}
      {!loading && filteredTasks.length === 0 && (
        <EmptyState
          title="No action items match criteria"
          description="Clear filters or ingest new meeting transcripts to generate work queue deliverables."
          actionText="Reset Filters"
          onAction={() => {
            setSearch('');
            setStatusFilter('All');
            setPriorityFilter('All');
            setOwnerFilter('All');
          }}
          icon={CheckSquare}
        />
      )}

      {/* Work Queue Table with Live Countdown & Timestamps */}
      {!loading && filteredTasks.length > 0 && (
        <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                  <th className="py-2.5 px-3.5">Deliverable</th>
                  <th className="py-2.5 px-3.5">Assignee</th>
                  <th className="py-2.5 px-3.5 min-w-[210px]">GitHub Resource</th>
                  <th className="py-2.5 px-3.5 min-w-[180px]">Start & Timeline</th>
                  <th className="py-2.5 px-3.5 min-w-[240px]">Deadline & Countdown (DD:HH:MM:SS)</th>
                  <th className="py-2.5 px-3.5">Priority</th>
                  <th className="py-2.5 px-3.5">Meeting Brief</th>
                  <th className="py-2.5 px-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EB]">
                {filteredTasks.map((t) => {
                  return (
                    <tr key={t.id} className="hover:bg-[#F4F6FA] transition-colors">
                      {/* Deliverable */}
                      <td className="py-3 px-3.5 font-medium text-ghost-text max-w-sm">
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => handleStatusChange(t.id, t.status === 'Completed' ? 'Pending' : 'Completed')}
                            className="p-0.5 rounded text-[#172033] mt-0.5"
                            title={t.status === 'Completed' ? 'Mark Pending' : 'Mark Completed'}
                          >
                            {t.status === 'Completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-ghost-accent" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-xs border border-ghost-border hover:border-ghost-text" />
                            )}
                          </button>
                          <span className={t.status === 'Completed' ? 'line-through text-ghost-secondary' : ''}>
                            {t.task}
                          </span>
                        </div>
                      </td>

                      {/* Assignee */}
                      <td className="py-3 px-3.5">
                        <span className="px-2 py-0.5 rounded-sm bg-[#F4F6FA] text-ghost-text border border-[#DCE2EB] font-medium text-[11px]">
                          {t.owner || 'Unassigned'}
                        </span>
                      </td>

                      {/* GitHub Resource & Progress Tracking */}
                      <td className="py-3 px-3.5">
                        {t.github?.repoFullName ? (
                          <div className="space-y-1.5 min-w-[190px]">
                            <div className="flex items-center justify-between gap-1.5">
                              <a
                                href={t.github.htmlUrl || `https://github.com/${t.github.repoFullName}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#172033] hover:text-[#5145CD] truncate max-w-[140px]"
                                title="Open in GitHub"
                              >
                                <Github className="w-3 h-3 text-[#172033] shrink-0" />
                                <span className="truncate">{t.github.repoFullName}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-[#526078] shrink-0" />
                              </a>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleSyncGitHub(t.id)}
                                  disabled={syncingTaskId === t.id}
                                  className="p-1 rounded text-[#526078] hover:text-[#5145CD] hover:bg-[#F4F6FA]"
                                  title="Sync latest GitHub progress"
                                >
                                  <RefreshCw className={`w-3 h-3 ${syncingTaskId === t.id ? 'animate-spin text-[#5145CD]' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleUnlinkGitHub(t.id)}
                                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-[#F4F6FA]"
                                  title="Unlink GitHub resource"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              {t.github.issueNumber ? (
                                <a
                                  href={t.github.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-xs font-semibold hover:underline ${
                                    t.github.prMerged || t.github.issueState === 'closed'
                                      ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0]'
                                      : 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]'
                                  }`}
                                >
                                  {t.github.isPullRequest ? (
                                    <GitPullRequest className="w-2.5 h-2.5" />
                                  ) : (
                                    <CheckSquare className="w-2.5 h-2.5" />
                                  )}
                                  <span>#{t.github.issueNumber} {t.github.prMerged ? 'Merged' : (t.github.issueState || 'Open')}</span>
                                </a>
                              ) : null}

                              {t.github.assignee && (
                                <span className="text-[#526078] font-medium">
                                  @{t.github.assignee}
                                </span>
                              )}
                            </div>

                            {t.github.checklistTotal > 0 && (
                              <div className="text-[10px] text-[#526078] flex items-center gap-1">
                                <CheckSquare className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                <span className="font-medium text-[#172033]">{t.github.checklistCompleted}/{t.github.checklistTotal} checklist tasks</span>
                              </div>
                            )}

                            <div className="text-[9px] text-[#526078] flex items-center justify-between">
                              <span>Synced: {t.github.lastSyncedAt ? formatTimeAgo(t.github.lastSyncedAt) : 'Recent'}</span>
                              <span className={`font-semibold uppercase tracking-wider ${
                                t.github.syncStatus === 'synced' ? 'text-emerald-700' : 'text-amber-700'
                              }`}>
                                {t.github.syncStatus}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setLinkingTask(t)}
                            className="btn-secondary text-[10px] py-1 px-2 flex items-center gap-1 text-[#526078] hover:text-[#172033]"
                            title="Link this task to a GitHub repository, issue, or pull request"
                          >
                            <Github className="w-3 h-3 text-[#526078]" />
                            <span>Link GitHub</span>
                          </button>
                        )}
                      </td>

                      {/* 1. Start Date & Timeline */}
                      <td className="py-3 px-3.5">
                        {t.status === 'Pending' && (
                          <div className="space-y-1">
                            <div className="text-[11px] text-[#526078] leading-tight">
                              <span className="text-[#172033] font-medium block">
                                {formatDateTime(t.createdAt)}
                              </span>
                              <span className="text-[10px] text-slate-500">Created timestamp</span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-xs border border-amber-200 font-medium">
                              <Clock className="w-2.5 h-2.5 text-amber-600" />
                              <span>Not started</span>
                            </span>
                          </div>
                        )}

                        {t.status === 'In Progress' && (
                          <div className="space-y-1">
                            <div className="text-[11px] text-[#15803D] leading-tight">
                              <span className="font-semibold block flex items-center gap-1">
                                <Play className="w-2.5 h-2.5 text-[#15803D] fill-current" />
                                {formatDateTime(t.startedAt || t.updatedAt)}
                              </span>
                              <span className="text-[10px] text-[#15803D]">Started timestamp</span>
                            </div>
                            <span className="text-[10px] text-[#64748B] block font-mono">
                              Created: {formatDateTime(t.createdAt)}
                            </span>
                          </div>
                        )}

                        {t.status === 'Completed' && (
                          <div className="space-y-1">
                            <div className="text-[11px] text-emerald-800 leading-tight">
                              <span className="font-semibold block flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                {formatDateTime(t.completedAt || t.updatedAt)}
                              </span>
                              <span className="text-[10px] text-emerald-700">Completed timestamp</span>
                            </div>
                            {t.startedAt && (
                              <span className="text-[10px] text-[#64748B] block font-mono">
                                Started: {formatDateTime(t.startedAt)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 2 & 3. Deadline Date/Time & Live Countdown strictly in DD:HH:MM:SS */}
                      <td className="py-3 px-3.5">
                        {editingDeadlineTaskId === t.id ? (
                          <div className="space-y-1.5 bg-[#F8FAFC] p-2 rounded-sm border border-[#CBD5E1]">
                            <label className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">
                              Set Deadline Date & Time:
                            </label>
                            <input
                              type="datetime-local"
                              value={editDeadlineValue}
                              onChange={(e) => setEditDeadlineValue(e.target.value)}
                              className="input-base text-xs py-1 px-2 w-full font-mono"
                            />
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                onClick={() => handleSaveDeadline(t.id)}
                                disabled={updatingId === t.id}
                                className="btn-primary text-[10px] py-0.5 px-2.5 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                              <button
                                onClick={handleCancelEditDeadline}
                                disabled={updatingId === t.id}
                                className="btn-secondary text-[10px] py-0.5 px-2 flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {/* When Completed: Countdown is stopped, shows completion timestamp */}
                            {t.status === 'Completed' ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1 text-[11px] text-[#526078]">
                                  <span className="truncate">
                                    Target: {t.dueDateTime ? formatDateTime(t.dueDateTime) : (t.deadline && t.deadline !== 'Not specified' ? t.deadline : 'None')}
                                  </span>
                                  <button
                                    onClick={() => startEditDeadline(t)}
                                    className="text-[10px] text-[#5145CD] hover:underline p-0.5"
                                    title="Edit deadline"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <SegmentedCountdown
                                    days={0}
                                    hours={0}
                                    minutes={0}
                                    seconds={0}
                                    variant="completed"
                                  />
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] text-[10px] font-semibold">
                                    <CheckCircle2 className="w-3 h-3 text-[#166534]" />
                                    <span>Stopped</span>
                                  </span>
                                </div>
                              </div>
                            ) : t.dueDateTime ? (
                              /* When Active/Overdue with valid dueDateTime */
                              (() => {
                                const cd = getCountdown(t.dueDateTime, now);
                                if (!cd) {
                                  return <span className="text-xs text-slate-400">Invalid Date</span>;
                                }

                                const isApproaching = !cd.isOverdue && cd.totalMsRemaining < 24 * 60 * 60 * 1000;
                                const variant = cd.isOverdue ? 'overdue' : isApproaching ? 'approaching' : 'normal';

                                return (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#526078]">
                                      <span className="font-mono text-[#172033] font-medium truncate">
                                        {formatDateTime(t.dueDateTime)}
                                      </span>
                                      <button
                                        onClick={() => startEditDeadline(t)}
                                        className="text-[10px] text-[#5145CD] hover:underline flex items-center gap-0.5 shrink-0"
                                        title="Edit deadline date & time"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                    </div>

                                    {/* Segmented Timer Countdown in DD:HH:MM:SS format */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {cd.isOverdue && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] text-[9px] font-bold uppercase tracking-wider">
                                          <AlertTriangle className="w-3 h-3 text-[#DC2626]" />
                                          <span>OVERDUE</span>
                                        </span>
                                      )}
                                      <SegmentedCountdown
                                        days={cd.days}
                                        hours={cd.hours}
                                        minutes={cd.minutes}
                                        seconds={cd.seconds}
                                        variant={variant}
                                      />
                                      {isApproaching && (
                                        <span className="text-[10px] font-medium text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded-[4px] border border-[#FDE68A]">
                                          &lt; 24h
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              /* When No dueDateTime set */
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  {t.deadline && t.deadline !== 'Not specified' ? (
                                    <span className="font-medium text-[#172033]">{t.deadline}</span>
                                  ) : (
                                    <span className="text-slate-400 italic">No deadline set</span>
                                  )}
                                  <button
                                    onClick={() => startEditDeadline(t)}
                                    className="btn-secondary text-[10px] py-0.5 px-2 flex items-center gap-1 ml-2"
                                    title="Set complete deadline date and time"
                                  >
                                    <Calendar className="w-3 h-3 text-[#5145CD]" />
                                    <span>Set Date/Time</span>
                                  </button>
                                </div>
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-xs border border-amber-200 inline-block font-mono">
                                  Countdown inactive (requires date & time)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-3.5">
                        <PriorityBadge priority={t.priority} />
                      </td>

                      {/* Meeting Brief */}
                      <td className="py-3 px-3.5 max-w-xs">
                        {t.meetingId ? (
                          <Link
                            to={`/meetings/${t.meetingId}`}
                            className="text-[#172033] hover:text-[#5145CD] font-medium truncate inline-flex items-center gap-1 group text-[11px]"
                          >
                            <span className="truncate">{t.meetingTitle || 'View Brief'}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-75 group-hover:opacity-100 text-[#5145CD] transition-opacity" />
                          </Link>
                        ) : (
                          <span className="text-ghost-secondary text-[11px]">Unlinked</span>
                        )}
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-3 px-3.5 text-right">
                        <select
                          value={t.status}
                          onChange={(e) => handleStatusChange(t.id, e.target.value)}
                          disabled={updatingId === t.id}
                          className="input-base text-xs w-auto py-1 cursor-pointer"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GitHub Link Modal */}
      <GitHubLinkModal
        task={linkingTask}
        isOpen={Boolean(linkingTask)}
        onClose={() => setLinkingTask(null)}
        onLinked={handleTaskLinked}
      />
    </div>
  );
}
