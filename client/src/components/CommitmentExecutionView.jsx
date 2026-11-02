import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  Github,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  ShieldAlert,
  Clock,
  ExternalLink,
  RefreshCw,
  Filter,
  Search,
  CheckCircle2,
  X,
  Layers,
  User,
  HelpCircle,
  ArrowRight,
  Info,
  Calendar,
  Zap,
  ChevronRight,
  Inbox
} from 'lucide-react';
import { api } from '../api/client';
import { formatTimeAgo, formatDateTime } from '../utils/formatters';
import { SkeletonList } from './SkeletonLoader';
import { EmptyState } from './EmptyState';

const ASSESSMENT_BADGES = {
  verified_completed: {
    label: 'Task verified complete',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  pr_merged_unverified: {
    label: 'PR merged – awaiting task verification',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: ShieldAlert,
    urgent: true,
  },
  issue_closed_unverified: {
    label: 'Issue closed – awaiting task verification',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: ShieldAlert,
    urgent: true,
  },
  pr_awaiting_review: {
    label: 'PR awaiting review',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: GitPullRequest,
  },
  activity_detected: {
    label: 'Activity detected',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    icon: GitCommit,
  },
  overdue_no_evidence: {
    label: 'Overdue – no execution evidence',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: AlertCircle,
    urgent: true,
  },
  no_evidence: {
    label: 'No GitHub evidence found',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    icon: Clock,
  },
};

const STATUS_PILLS = {
  Completed: {
    label: 'Completed',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  'In Progress': {
    label: 'In Progress',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  Pending: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

export function CommitmentExecutionView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [selectedMeetingId, setSelectedMeetingId] = useState('ALL');
  const [selectedOwner, setSelectedOwner] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedAssessment, setSelectedAssessment] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Task for Detailed Inspection Modal
  const [inspectedTask, setInspectedTask] = useState(null);

  // Load Commitment vs Execution Insights
  const fetchInsights = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.getCommitmentInsights({ refresh: isRefresh });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load commitment insights:', err);
      setError(err.message || 'Failed to retrieve commitment vs execution insights from backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const allTasks = useMemo(() => data?.tasks || [], [data]);

  // Extract distinct meetings and owners for filter dropdowns
  const distinctMeetings = useMemo(() => {
    const map = new Map();
    allTasks.forEach(item => {
      const id = item.commitment.meetingId;
      const title = item.commitment.meetingTitle || 'Meeting';
      if (id && !map.has(id)) {
        map.set(id, title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [allTasks]);

  const distinctOwners = useMemo(() => {
    const set = new Set();
    allTasks.forEach(item => {
      if (item.commitment.owner) set.add(item.commitment.owner);
    });
    return Array.from(set).sort();
  }, [allTasks]);

  // Filtered Task List
  const filteredTasks = useMemo(() => {
    return allTasks.filter(item => {
      const { commitment, assessment } = item;

      // Meeting Filter
      if (selectedMeetingId !== 'ALL' && commitment.meetingId !== selectedMeetingId) {
        return false;
      }

      // Owner Filter
      if (selectedOwner !== 'ALL' && commitment.owner !== selectedOwner) {
        return false;
      }

      // Status Filter
      if (selectedStatus !== 'ALL' && commitment.status !== selectedStatus) {
        return false;
      }

      // Assessment Filter
      if (selectedAssessment !== 'ALL' && assessment.code !== selectedAssessment) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTask = commitment.task.toLowerCase().includes(q);
        const matchMeeting = (commitment.meetingTitle || '').toLowerCase().includes(q);
        const matchOwner = (commitment.owner || '').toLowerCase();
        if (!matchTask && !matchMeeting && !matchOwner.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [allTasks, selectedMeetingId, selectedOwner, selectedStatus, selectedAssessment, searchQuery]);

  // Derived Summary Metric Counts
  const summary = useMemo(() => {
    if (!data?.summary) {
      return {
        totalTasks: 0,
        linkedTasks: 0,
        evidenceDetected: 0,
        overdueWithoutEvidence: 0,
        verificationPending: 0,
      };
    }

    const s = data.summary;
    const a = s.assessments || {};
    const evidenceCount =
      (a.activity_detected || 0) +
      (a.pr_awaiting_review || 0) +
      (a.pr_merged_unverified || 0) +
      (a.issue_closed_unverified || 0) +
      (a.verified_completed || 0);

    return {
      totalTasks: s.totalTasks || 0,
      linkedTasks: s.linkedTasks || 0,
      evidenceDetected: evidenceCount,
      overdueWithoutEvidence: s.overdueWithoutEvidenceCount || 0,
      verificationPending: s.verificationPendingCount || 0,
    };
  }, [data]);

  const hasActiveFilters =
    selectedMeetingId !== 'ALL' ||
    selectedOwner !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedAssessment !== 'ALL' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setSelectedMeetingId('ALL');
    setSelectedOwner('ALL');
    setSelectedStatus('ALL');
    setSelectedAssessment('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Notice Banner: Grounded Human Verification Rule */}
      <div className="p-3.5 rounded-sm bg-[#FFFFFF] border border-[#DCE2EB] flex items-start gap-3 shadow-xs">
        <ShieldAlert className="w-4 h-4 text-[#5145CD] shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <p className="font-semibold text-[#172033]">
            Commitment vs. Execution Intelligence Grounding
          </p>
          <p className="text-[#526078] leading-relaxed">
            This engine matches meeting action items to actual GitHub code execution through explicit repository links and verified developer mappings. <strong>Meeting Ghost never automatically marks a task Completed</strong> based on commit counts, PR merges, or issue closures. Task completion remains strictly subject to human team sign-off.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-sm bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchInsights()}
            className="btn-secondary text-xs py-1 px-2.5 text-red-800 border-red-300 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-sm border border-[#DCE2EB]" />
            ))}
          </div>
          <SkeletonList rows={5} />
        </div>
      )}

      {/* Loaded Content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Top Bar: Action Controls & Live Sync */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#172033] flex items-center gap-2">
                <span>Meeting Deliverables vs GitHub Evidence</span>
                <span className="text-[11px] font-mono font-normal text-[#526078] bg-[#F1F5F9] px-2 py-0.5 rounded">
                  {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-[#526078] mt-0.5">
                Track whether meeting commitments are progressing on GitHub without fabricating metrics or guessing developer identities.
              </p>
            </div>

            <button
              onClick={() => fetchInsights(true)}
              disabled={refreshing}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-[#172033] hover:text-[#5145CD] self-start sm:self-auto"
              title="Refresh live issue and PR statuses from GitHub"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#5145CD]' : ''}`} />
              <span>{refreshing ? 'Re-syncing...' : 'Refresh Evidence'}</span>
            </button>
          </div>

          {/* 1. Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Total Commitments */}
            <div className="ghost-panel p-3.5 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-[#526078]">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Commitments</span>
                <CheckSquare className="w-3.5 h-3.5 text-[#5145CD]" />
              </div>
              <div className="text-xl font-bold text-[#172033] font-mono">
                {summary.totalTasks}
              </div>
              <p className="text-[10px] text-[#526078]">Meeting action items</p>
            </div>

            {/* GitHub-Linked Tasks */}
            <div className="ghost-panel p-3.5 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-[#526078]">
                <span className="text-[10px] font-bold uppercase tracking-wider">Linked to GitHub</span>
                <Github className="w-3.5 h-3.5 text-slate-700" />
              </div>
              <div className="text-xl font-bold text-[#172033] font-mono">
                {summary.linkedTasks}
              </div>
              <p className="text-[10px] text-[#526078]">
                {summary.totalTasks > 0
                  ? `${Math.round((summary.linkedTasks / summary.totalTasks) * 100)}% repository bound`
                  : 'No tasks'}
              </p>
            </div>

            {/* Evidence Detected */}
            <div className="ghost-panel p-3.5 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
              <div className="flex items-center justify-between text-[#526078]">
                <span className="text-[10px] font-bold uppercase tracking-wider">Evidence Detected</span>
                <Zap className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-blue-700 font-mono">
                {summary.evidenceDetected}
              </div>
              <p className="text-[10px] text-[#526078]">Commits, PRs or checklists</p>
            </div>

            {/* Overdue Without Evidence */}
            <div className={`ghost-panel p-3.5 bg-[#FFFFFF] border space-y-1 shadow-xs ${
              summary.overdueWithoutEvidence > 0 ? 'border-red-300 bg-red-50/20' : 'border-[#DCE2EB]'
            }`}>
              <div className="flex items-center justify-between text-[#526078]">
                <span className="text-[10px] font-bold uppercase tracking-wider">Overdue (No Evidence)</span>
                <AlertCircle className={`w-3.5 h-3.5 ${summary.overdueWithoutEvidence > 0 ? 'text-red-600' : 'text-slate-400'}`} />
              </div>
              <div className={`text-xl font-bold font-mono ${
                summary.overdueWithoutEvidence > 0 ? 'text-red-700' : 'text-[#172033]'
              }`}>
                {summary.overdueWithoutEvidence}
              </div>
              <p className="text-[10px] text-[#526078]">Deadline past, zero activity</p>
            </div>

            {/* Awaiting Human Verification */}
            <div className={`ghost-panel p-3.5 bg-[#FFFFFF] border space-y-1 shadow-xs ${
              summary.verificationPending > 0 ? 'border-purple-300 bg-purple-50/20' : 'border-[#DCE2EB]'
            }`}>
              <div className="flex items-center justify-between text-[#526078]">
                <span className="text-[10px] font-bold uppercase tracking-wider">Awaiting Verification</span>
                <ShieldAlert className={`w-3.5 h-3.5 ${summary.verificationPending > 0 ? 'text-purple-600' : 'text-slate-400'}`} />
              </div>
              <div className={`text-xl font-bold font-mono ${
                summary.verificationPending > 0 ? 'text-purple-700' : 'text-[#172033]'
              }`}>
                {summary.verificationPending}
              </div>
              <p className="text-[10px] text-[#526078]">PR merged / Issue closed</p>
            </div>
          </div>

          {/* 2. Filters Bar */}
          <div className="ghost-panel p-3.5 bg-[#FFFFFF] border border-[#DCE2EB] space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-[#5145CD]" />
                <span className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                  Filters & Scope
                </span>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-[11px] text-[#5145CD] hover:underline font-medium ml-2"
                  >
                    Reset all
                  </button>
                )}
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3 h-3 text-[#526078] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter task, meeting, owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-base text-xs py-1.5 pl-8 pr-2.5 w-60"
                />
              </div>
            </div>

            {/* Select Dropdown Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 border-t border-[#F1F5F9]">
              {/* Meeting Filter */}
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Source
                </label>
                <select
                  value={selectedMeetingId}
                  onChange={(e) => setSelectedMeetingId(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#DCE2EB] rounded-xs text-xs font-medium text-[#172033] px-2 py-1.5 cursor-pointer focus:outline-none focus:border-[#5145CD]"
                >
                  <option value="ALL">All Meetings ({distinctMeetings.length})</option>
                  {distinctMeetings.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Owner Filter */}
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Owner
                </label>
                <select
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#DCE2EB] rounded-xs text-xs font-medium text-[#172033] px-2 py-1.5 cursor-pointer focus:outline-none focus:border-[#5145CD]"
                >
                  <option value="ALL">All Owners ({distinctOwners.length})</option>
                  {distinctOwners.map(owner => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Ghost Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#DCE2EB] rounded-xs text-xs font-medium text-[#172033] px-2 py-1.5 cursor-pointer focus:outline-none focus:border-[#5145CD]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Assessment Filter */}
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Execution Assessment
                </label>
                <select
                  value={selectedAssessment}
                  onChange={(e) => setSelectedAssessment(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#DCE2EB] rounded-xs text-xs font-medium text-[#172033] px-2 py-1.5 cursor-pointer focus:outline-none focus:border-[#5145CD]"
                >
                  <option value="ALL">All Assessments</option>
                  <option value="pr_merged_unverified">PR merged – awaiting task verification</option>
                  <option value="issue_closed_unverified">Issue closed – awaiting task verification</option>
                  <option value="pr_awaiting_review">PR awaiting review</option>
                  <option value="activity_detected">Activity detected</option>
                  <option value="overdue_no_evidence">Overdue – no execution evidence</option>
                  <option value="no_evidence">No GitHub evidence found</option>
                  <option value="verified_completed">Task verified complete</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Task Table */}
          <div className="ghost-panel bg-[#FFFFFF] border border-[#DCE2EB] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                    <th className="py-2.5 px-3.5">Action Item & Meeting</th>
                    <th className="py-2.5 px-3">Owner / GitHub</th>
                    <th className="py-2.5 px-3">Deadline</th>
                    <th className="py-2.5 px-3 text-center">Local Status</th>
                    <th className="py-2.5 px-3.5">GitHub Evidence</th>
                    <th className="py-2.5 px-3.5">Execution Assessment</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2EB]">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-xs text-[#526078]">
                        <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-[#172033]">No commitments match the selected criteria.</p>
                        <p className="text-[11px] text-[#526078] mt-1">
                          Try resetting your filters or linking action items to GitHub repositories in the Action Tracker.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map(item => {
                      const { commitment, identityMapping, githubEvidence, assessment } = item;
                      const badgeCfg = ASSESSMENT_BADGES[assessment.code] || ASSESSMENT_BADGES.no_evidence;
                      const BadgeIcon = badgeCfg.icon;
                      const statusCfg = STATUS_PILLS[commitment.status] || STATUS_PILLS.Pending;

                      return (
                        <tr
                          key={commitment.taskId}
                          className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                          onClick={() => setInspectedTask(item)}
                        >
                          {/* 1. Action Item & Meeting */}
                          <td className="py-3 px-3.5 max-w-xs">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-[#172033] line-clamp-2" title={commitment.task}>
                                {commitment.task}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#526078]">
                                <span className="truncate" title={commitment.meetingTitle}>
                                  {commitment.meetingTitle || 'Meeting'}
                                </span>
                                <span>•</span>
                                <span className={`text-[9px] px-1 py-0.2 rounded font-medium ${
                                  commitment.priority === 'High'
                                    ? 'bg-red-50 text-red-700'
                                    : commitment.priority === 'Low'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {commitment.priority}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Owner & Mapped Identity */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-medium text-[#172033]">
                                <User className="w-3 h-3 text-[#526078]" />
                                <span>{commitment.owner}</span>
                              </div>
                              {identityMapping.isMapped ? (
                                <div className="flex items-center gap-1 text-[11px] text-[#5145CD] font-mono" title={`Mapped via ${identityMapping.mappingSource}`}>
                                  <Github className="w-2.5 h-2.5" />
                                  <span>@{identityMapping.mappedGitHubUsername}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono italic">
                                  Not mapped
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. Deadline */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="space-y-0.5 text-xs">
                              <span className="text-[#172033] font-medium block">
                                {commitment.deadline}
                              </span>
                              {commitment.isOverdue && commitment.status !== 'Completed' && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-1 py-0.2 rounded">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  <span>Overdue</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Meeting Ghost Local Status */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusCfg.className}`}>
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* 5. GitHub Evidence */}
                          <td className="py-3 px-3.5 max-w-xs">
                            {githubEvidence.isLinked ? (
                              <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {githubEvidence.pullRequest ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                      <GitPullRequest className="w-2.5 h-2.5" />
                                      <span>PR #{githubEvidence.pullRequest.number}</span>
                                      {githubEvidence.pullRequest.isMerged && (
                                        <span className="text-purple-700 font-bold">• Merged</span>
                                      )}
                                    </span>
                                  ) : githubEvidence.issue ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                      <span>#{githubEvidence.issue.number}</span>
                                      <span className="capitalize text-slate-500">({githubEvidence.issue.state})</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {githubEvidence.repoFullName}
                                    </span>
                                  )}

                                  {githubEvidence.commits.length > 0 && (
                                    <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded">
                                      {githubEvidence.commits.length} commit{githubEvidence.commits.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>

                                {githubEvidence.lastActivity && (
                                  <p className="text-[10px] text-[#526078] truncate" title={githubEvidence.lastActivity.description}>
                                    Latest: {githubEvidence.lastActivity.description}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">
                                Unlinked
                              </span>
                            )}
                          </td>

                          {/* 6. Execution Assessment */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border ${badgeCfg.bg} ${badgeCfg.text} ${badgeCfg.border}`}>
                              <BadgeIcon className="w-3 h-3 shrink-0" />
                              <span>{assessment.label}</span>
                            </span>
                            {assessment.statusDivergence && (
                              <span className="text-[9px] text-purple-700 block mt-0.5 font-medium">
                                Sign-off required
                              </span>
                            )}
                          </td>

                          {/* 7. Action Button */}
                          <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setInspectedTask(item)}
                              className="btn-secondary text-[11px] py-1 px-2 text-[#5145CD] hover:bg-indigo-50 inline-flex items-center gap-1"
                            >
                              <span>Inspect</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Detailed Task Inspection Modal */}
      {inspectedTask && (
        <div
          className="fixed inset-0 z-50 bg-[#0B101B]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setInspectedTask(null)}
        >
          <div
            className="bg-[#FFFFFF] border border-[#DCE2EB] rounded-sm max-w-2xl w-full shadow-xl overflow-hidden my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-[#DCE2EB] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#5145CD]" />
                <h3 className="text-sm font-bold text-[#172033]">
                  Commitment vs. Execution Evidence
                </h3>
              </div>
              <button
                onClick={() => setInspectedTask(null)}
                className="p-1 text-[#526078] hover:text-[#172033] rounded hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
              {/* Task Commitment Card */}
              <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider">
                    Meeting Commitment
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_PILLS[inspectedTask.commitment.status]?.className || ''}`}>
                    Local Status: {inspectedTask.commitment.status}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#172033]">
                  {inspectedTask.commitment.task}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 text-[#526078]">
                  <div>
                    <span className="block text-[10px] text-slate-400">Meeting</span>
                    <span className="font-medium text-[#172033]">{inspectedTask.commitment.meetingTitle || 'General'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Owner</span>
                    <span className="font-medium text-[#172033]">{inspectedTask.commitment.owner}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Deadline</span>
                    <span className="font-medium text-[#172033]">{inspectedTask.commitment.deadline}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Priority</span>
                    <span className="font-medium text-[#172033]">{inspectedTask.commitment.priority}</span>
                  </div>
                </div>
              </div>

              {/* Assessment Classification Banner */}
              {(() => {
                const b = ASSESSMENT_BADGES[inspectedTask.assessment.code] || ASSESSMENT_BADGES.no_evidence;
                const BIcon = b.icon;
                return (
                  <div className={`p-3.5 rounded border ${b.bg} ${b.border} flex items-start gap-3`}>
                    <BIcon className={`w-5 h-5 ${b.text} shrink-0 mt-0.5`} />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${b.text}`}>
                          {inspectedTask.assessment.label}
                        </span>
                        {inspectedTask.assessment.verificationRequired && (
                          <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded uppercase">
                            Verification Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[#526078] leading-relaxed">
                        {inspectedTask.assessment.description}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Identity Mapping Box */}
              <div className="p-3.5 rounded bg-[#FFFFFF] border border-[#DCE2EB] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#5145CD]" />
                    <span>Developer Identity Resolution</span>
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                    inspectedTask.identityMapping.isMapped
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {inspectedTask.identityMapping.isMapped ? 'Explicitly Mapped' : 'Not Mapped'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Meeting Owner:</span>
                    <span className="font-semibold text-[#172033]">{inspectedTask.identityMapping.meetingOwner}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Mapped GitHub Account:</span>
                    {inspectedTask.identityMapping.isMapped ? (
                      <a
                        href={`https://github.com/${inspectedTask.identityMapping.mappedGitHubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#5145CD] font-mono font-medium hover:underline inline-flex items-center gap-1"
                      >
                        <span>@{inspectedTask.identityMapping.mappedGitHubUsername}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-slate-400 font-mono italic">Not mapped</span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-[#526078] border-t border-slate-100 pt-2 leading-relaxed">
                  Source: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[#172033]">{inspectedTask.identityMapping.mappingSource}</code>.
                  Meeting Ghost never guesses accounts from human names; only explicitly mapped accounts are matched.
                </p>
              </div>

              {/* GitHub Evidence Breakdown */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#172033] uppercase tracking-wider block">
                  GitHub Execution Evidence
                </span>

                {/* Linked Issue / PR */}
                {inspectedTask.githubEvidence.isLinked ? (
                  <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#172033] flex items-center gap-1.5">
                        <Github className="w-3.5 h-3.5" />
                        <span>{inspectedTask.githubEvidence.repoFullName}</span>
                      </span>
                      {inspectedTask.githubEvidence.issue?.htmlUrl && (
                        <a
                          href={inspectedTask.githubEvidence.issue.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#5145CD] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open on GitHub</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    {inspectedTask.githubEvidence.pullRequest && (
                      <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitPullRequest className="w-4 h-4 text-blue-600" />
                          <span className="font-mono text-xs">
                            PR #{inspectedTask.githubEvidence.pullRequest.number}: {inspectedTask.githubEvidence.pullRequest.title}
                          </span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          inspectedTask.githubEvidence.pullRequest.isMerged
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {inspectedTask.githubEvidence.pullRequest.isMerged ? 'Merged' : inspectedTask.githubEvidence.pullRequest.state}
                        </span>
                      </div>
                    )}

                    {inspectedTask.githubEvidence.issue && (
                      <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                          <span className="font-mono text-xs">
                            Issue #{inspectedTask.githubEvidence.issue.number}: {inspectedTask.githubEvidence.issue.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#526078] font-mono">
                          Checklist: {inspectedTask.githubEvidence.issue.checklistCompleted}/{inspectedTask.githubEvidence.issue.checklistTotal}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded bg-slate-50 border border-slate-200 text-center text-xs text-[#526078]">
                    No GitHub resource is linked to this action item.
                  </div>
                )}

                {/* Commits List */}
                {inspectedTask.githubEvidence.commits.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">
                      Matched Commits ({inspectedTask.githubEvidence.commits.length})
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {inspectedTask.githubEvidence.commits.map((c, idx) => (
                        <div key={`${c.sha}-${idx}`} className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <div className="truncate pr-2">
                            <span className="font-mono text-[10px] bg-slate-200 px-1 py-0.2 rounded mr-1.5 text-[#172033]">
                              {c.shortSha}
                            </span>
                            <span className="text-xs text-[#172033]">{c.headline}</span>
                            <span className="text-[10px] text-[#526078] ml-1.5">by @{c.author?.login || 'unknown'}</span>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono shrink-0 ${
                            c.authorMatchesOwner
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {c.authorMatchesOwner ? 'Matches Owner' : 'Issue Match'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Verification Notice */}
              <div className="p-3 rounded bg-amber-50/60 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  To change this task's status to <strong>Completed</strong>, perform explicit sign-off in the <strong>Action Tracker</strong>. Meeting Ghost enforces human accountability and preserves historical meeting commitments.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-[#DCE2EB] bg-[#F8FAFC] flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedTask(null)}
                className="btn-secondary text-xs py-1.5 px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommitmentExecutionView;
