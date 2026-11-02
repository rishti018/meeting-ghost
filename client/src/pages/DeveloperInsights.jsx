import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  CheckSquare,
  Users,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Clock,
  ShieldAlert,
  Search,
  CheckCircle2,
  Filter,
  ArrowLeft,
  Github,
  Inbox
} from 'lucide-react';
import { api } from '../api/client';
import { formatTimeAgo, formatDateTime } from '../utils/formatters';
import { SkeletonList } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { CommitmentExecutionView } from '../components/CommitmentExecutionView';

export function DeveloperInsights() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSection = searchParams.get('tab') === 'commitments' ? 'commitments' : 'telemetry';
  const [activeSection, setActiveSection] = useState(initialSection);

  const [repos, setRepos] = useState([]);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setSearchParams(section === 'commitments' ? { tab: 'commitments' } : {});
  };

  // Filters & Selected Views
  const [selectedDeveloperUsername, setSelectedDeveloperUsername] = useState('ALL');
  const [hideBots, setHideBots] = useState(true);
  const [activityFilter, setActivityFilter] = useState('all'); // 'all' | 'commit' | 'pull_request' | 'issue'
  const [developerSearch, setDeveloperSearch] = useState('');

  // 1. Initial Load: Fetch accessible repositories
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    api.listGitHubRepos()
      .then(res => {
        if (!mounted) return;
        const repoList = res.data || [];
        setRepos(repoList);
        if (repoList.length > 0) {
          setSelectedRepoFullName(repoList[0].fullName);
        } else {
          setLoading(false);
        }
      })
      .catch(err => {
        if (!mounted) return;
        console.warn('Failed to list repos:', err.message);
        setError('GitHub integration is not connected or no authorized repositories were found.');
        setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  // 2. Fetch Developer Insights when selected repository changes
  const fetchInsights = async (targetRepoFullName, isManualSync = false) => {
    if (!targetRepoFullName || !targetRepoFullName.includes('/')) {
      setLoading(false);
      return;
    }

    const [owner, repo] = targetRepoFullName.split('/');
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.getDeveloperInsights(owner, repo);
      setInsights(res.data);
      // Reset selected developer if they don't exist in new repo
      setSelectedDeveloperUsername('ALL');
    } catch (err) {
      console.error('Failed to fetch developer insights:', err.message);
      setError(`Failed to retrieve insights for ${targetRepoFullName}: ${err.message}`);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (selectedRepoFullName) {
      fetchInsights(selectedRepoFullName);
    }
  }, [selectedRepoFullName]);

  // Derived Developer List with Bot Filtering & Search
  const allDevelopers = insights?.developers || [];
  const filteredDevelopers = allDevelopers.filter(dev => {
    if (hideBots && dev.isBot) return false;
    if (developerSearch.trim()) {
      const q = developerSearch.toLowerCase();
      const matchLogin = dev.username.toLowerCase().includes(q);
      const matchName = dev.displayName.toLowerCase().includes(q);
      if (!matchLogin && !matchName) return false;
    }
    return true;
  });

  // Active Developer for Individual View
  const activeDeveloper = selectedDeveloperUsername !== 'ALL'
    ? allDevelopers.find(d => d.username.toLowerCase() === selectedDeveloperUsername.toLowerCase())
    : null;

  // Filtered Activity Feed
  const filteredActivity = (insights?.recentActivity || []).filter(item => {
    if (activityFilter !== 'all' && item.type !== activityFilter) return false;
    if (selectedDeveloperUsername !== 'ALL') {
      const author = (item.author || '').toLowerCase();
      if (author !== selectedDeveloperUsername.toLowerCase()) return false;
    }
    return true;
  });

  // Check if repository has zero activity (Empty Repository State)
  const isRepoEmpty = insights &&
    insights.teamOverview?.totalCommits === 0 &&
    insights.teamOverview?.pullRequests?.total === 0 &&
    insights.teamOverview?.issues?.total === 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header & Repository Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-[#DCE2EB]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#172033] tracking-tight flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[#5145CD]" />
              <span>Developer Insights</span>
            </h1>
            <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              Live GitHub Telemetry
            </span>
          </div>
          <p className="text-xs text-[#526078] mt-0.5">
            Real code development activity, throughput metrics, and contributor insights from authorized GitHub repositories.
          </p>
        </div>

        {/* Repository Switcher (only if multiple repos available) & Sync Button */}
        <div className="flex items-center gap-2.5">
          {repos.length > 1 ? (
            /* Multi-repository selector */
            <div className="flex items-center gap-1.5 bg-[#FFFFFF] border border-[#DCE2EB] rounded-sm px-2.5 py-1 shadow-xs">
              <Github className="w-3.5 h-3.5 text-[#172033]" />
              <select
                value={selectedRepoFullName}
                onChange={(e) => setSelectedRepoFullName(e.target.value)}
                disabled={loading || syncing}
                className="bg-transparent text-xs font-mono font-medium text-[#172033] cursor-pointer focus:outline-none"
                title="Switch repository"
              >
                {repos.map(r => (
                  <option key={r.id || r.fullName} value={r.fullName}>
                    {r.fullName} {r.private ? '(Private)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : repos.length === 1 ? (
            /* Single repository badge (no dropdown needed) */
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#DCE2EB] rounded-sm px-2.5 py-1 text-xs font-mono text-[#172033]" title="Connected repository">
              <Github className="w-3.5 h-3.5 text-[#172033]" />
              <span className="font-semibold">{repos[0].fullName}</span>
            </div>
          ) : null}

          <button
            onClick={() => fetchInsights(selectedRepoFullName, true)}
            disabled={loading || syncing || !selectedRepoFullName}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-[#172033] hover:text-[#5145CD]"
            title="Refresh latest repository data from GitHub"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-[#5145CD]' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync GitHub'}</span>
          </button>
        </div>
      </div>

      {/* Primary Section Switcher */}
      <div className="flex items-center gap-2 border-b border-[#DCE2EB] pb-2">
        <button
          type="button"
          onClick={() => handleSectionChange('telemetry')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-2 ${
            activeSection === 'telemetry'
              ? 'bg-[#172033] text-white font-semibold shadow-xs'
              : 'bg-[#F4F6FA] text-[#526078] hover:text-[#172033] hover:bg-[#E9EDF5]'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Team & Contributor Telemetry</span>
        </button>

        <button
          type="button"
          onClick={() => handleSectionChange('commitments')}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-2 ${
            activeSection === 'commitments'
              ? 'bg-[#5145CD] text-white font-semibold shadow-xs'
              : 'bg-[#F4F6FA] text-[#526078] hover:text-[#172033] hover:bg-[#E9EDF5]'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Commitment vs Execution</span>
          <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold tracking-wider ${
            activeSection === 'commitments' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
          }`}>
            Phase 3
          </span>
        </button>
      </div>

      {activeSection === 'commitments' ? (
        <CommitmentExecutionView />
      ) : (
        <>
          {/* Grounded Truth & Activity Distinction Notice */}
          <div className="p-3.5 rounded-sm bg-[#FFFFFF] border border-[#DCE2EB] flex items-start gap-3 shadow-xs">
            <ShieldAlert className="w-4 h-4 text-[#5145CD] shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-[#172033]">
                Activity Metrics vs. Verified Task Completion
              </p>
              <p className="text-[#526078] leading-relaxed">
                Developer Insights reflects actual development activity (commits, pull requests, and issues) queried directly from GitHub's REST API. In Meeting Ghost, Action Tracker task completion is grounded in verified meeting deliverables and issue checklist completion, rather than raw commit counts.
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
            onClick={() => fetchInsights(selectedRepoFullName)}
            className="btn-secondary text-xs py-1 px-2.5 text-red-800 border-red-300 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="space-y-4">
          <div className="ghost-panel p-6 bg-[#FFFFFF] border border-[#DCE2EB] animate-pulse space-y-4">
            <div className="h-5 bg-slate-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="h-24 bg-slate-100 rounded"></div>
              <div className="h-24 bg-slate-100 rounded"></div>
              <div className="h-24 bg-slate-100 rounded"></div>
              <div className="h-24 bg-slate-100 rounded"></div>
            </div>
          </div>
          <SkeletonList rows={4} />
        </div>
      )}

      {/* Empty State: No Repositories Configured */}
      {!loading && !error && repos.length === 0 && (
        <EmptyState
          title="No GitHub Repositories Connected"
          description="Connect your GitHub App or Personal Access Token in Workspace Diagnostics to access developer metrics, commits, and pull requests."
          actionText="Go to Workspace Diagnostics"
          onAction={() => window.location.href = '/settings'}
          icon={Github}
        />
      )}

      {/* Empty State: Repository is Empty (0 Commits, 0 PRs, 0 Issues) */}
      {!loading && !error && isRepoEmpty && (
        <div className="ghost-panel p-8 bg-[#FFFFFF] border border-[#DCE2EB] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-[#526078] mx-auto flex items-center justify-center">
            <Inbox className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-[#172033]">
            Repository is Empty
          </h2>
          <p className="text-xs text-[#526078] max-w-md mx-auto">
            The repository <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[#172033]">{selectedRepoFullName}</code> has no commits, pull requests, or issues recorded on GitHub yet. Push commits or open pull requests on GitHub, then sync again.
          </p>
          <div className="pt-2">
            <button
              onClick={() => fetchInsights(selectedRepoFullName, true)}
              className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Repository</span>
            </button>
          </div>
        </div>
      )}

      {/* Loaded Insights Content */}
      {!loading && !error && insights && !isRepoEmpty && (
        <div className="space-y-6">
          {/* Repository Meta Header */}
          <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-sm bg-[#172033] text-white">
                <Github className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <a
                    href={insights.repository.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-[#172033] hover:text-[#5145CD] hover:underline font-mono flex items-center gap-1"
                  >
                    <span>{insights.repository.fullName}</span>
                    <ExternalLink className="w-3 h-3 text-[#526078]" />
                  </a>
                  <span className={`px-1.5 py-0.2 rounded-xs text-[9px] font-bold uppercase tracking-wider ${
                    insights.repository.private
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}>
                    {insights.repository.private ? 'Private' : 'Public'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                    branch: {insights.repository.defaultBranch}
                  </span>
                </div>
                {insights.repository.description && (
                  <p className="text-xs text-[#526078] mt-0.5 line-clamp-1">
                    {insights.repository.description}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right text-[11px] text-[#526078]">
              <div className="flex items-center gap-1 text-[#526078] justify-end">
                <Clock className="w-3 h-3" />
                <span>Last Synced: {insights.lastSyncedAt ? formatTimeAgo(insights.lastSyncedAt) : 'Recent'}</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">
                {insights.lastSyncedAt ? formatDateTime(insights.lastSyncedAt) : ''}
              </span>
            </div>
          </div>

          {/* Developer Filter Bar & Scope Selector */}
          <div className="ghost-panel p-3.5 bg-[#FFFFFF] border border-[#DCE2EB] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-[#5145CD]" />
                <span className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                  View Scope:
                </span>
                {/* Developer Dropdown Selector for direct switching */}
                <select
                  value={selectedDeveloperUsername}
                  onChange={(e) => setSelectedDeveloperUsername(e.target.value)}
                  className="bg-[#F8FAFC] border border-[#DCE2EB] rounded-xs text-xs font-medium text-[#172033] px-2 py-1 cursor-pointer focus:outline-none focus:border-[#5145CD]"
                  title="Select individual developer or team overview"
                >
                  <option value="ALL">Team Overview (All Developers)</option>
                  {allDevelopers.map(dev => (
                    <option key={dev.username} value={dev.username}>
                      @{dev.username} ({dev.displayName}){dev.isBot ? ' [BOT]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search & Bot Filter Controls */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3 h-3 text-[#526078] absolute left-2 top-2" />
                  <input
                    type="text"
                    placeholder="Search developer..."
                    value={developerSearch}
                    onChange={(e) => setDeveloperSearch(e.target.value)}
                    className="input-base text-xs py-1 pl-7 pr-2.5 w-44"
                  />
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-[#526078] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideBots}
                    onChange={(e) => setHideBots(e.target.checked)}
                    className="rounded text-[#5145CD] focus:ring-[#5145CD]"
                  />
                  <span>Hide bots</span>
                </label>
              </div>
            </div>

            {/* Developer Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => setSelectedDeveloperUsername('ALL')}
                className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  selectedDeveloperUsername === 'ALL'
                    ? 'bg-[#172033] text-white font-semibold'
                    : 'bg-[#F4F6FA] text-[#526078] hover:text-[#172033] hover:bg-[#E9EDF5]'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Team Overview</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-600/30 font-mono">
                  {insights.teamOverview.activeDevelopersCount}
                </span>
              </button>

              {filteredDevelopers.map(dev => {
                const isSelected = selectedDeveloperUsername.toLowerCase() === dev.username.toLowerCase();
                return (
                  <button
                    key={dev.username}
                    type="button"
                    onClick={() => setSelectedDeveloperUsername(dev.username)}
                    className={`px-2 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#5145CD] text-white font-semibold'
                        : 'bg-[#F4F6FA] text-[#526078] hover:text-[#172033] hover:bg-[#E9EDF5]'
                    }`}
                  >
                    {dev.avatarUrl ? (
                      <img
                        src={dev.avatarUrl}
                        alt={dev.username}
                        className="w-3.5 h-3.5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-[#CBD5E1] text-[8px] flex items-center justify-center font-bold text-[#172033]">
                        {dev.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span>@{dev.username}</span>
                    {dev.isBot && (
                      <span className="text-[8px] px-1 py-0.2 rounded-xs bg-slate-300/40 font-mono">
                        BOT
                      </span>
                    )}
                    <span className={`text-[9px] px-1 py-0.2 rounded-xs font-mono ${
                      isSelected ? 'bg-white/20' : 'bg-[#E2E8F0] text-[#172033]'
                    }`}>
                      {dev.commitCount}c
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional View: Team Overview vs Individual Developer View */}
          {selectedDeveloperUsername === 'ALL' ? (
            /* ========================================================== */
            /* 1. TEAM OVERVIEW                                            */
            /* ========================================================== */
            <div className="space-y-6">
              {/* Metric Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Commits */}
                <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between text-[#526078]">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Commits</span>
                    <GitCommit className="w-4 h-4 text-[#5145CD]" />
                  </div>
                  <div className="text-2xl font-bold text-[#172033] font-mono">
                    {insights.teamOverview.totalCommits}
                  </div>
                  <p className="text-[11px] text-[#526078]">
                    Tracked on branch <code className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded text-[#172033]">{insights.repository.defaultBranch}</code>
                  </p>
                </div>

                {/* Pull Requests Opened & Merged */}
                <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between text-[#526078]">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Pull Requests</span>
                    <GitPullRequest className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-[#172033] font-mono">
                    {insights.teamOverview.pullRequests.total}
                  </div>
                  <div className="text-[11px] text-[#526078] flex items-center gap-2">
                    <span className="text-purple-700 font-semibold">{insights.teamOverview.pullRequests.merged} merged</span>
                    <span>•</span>
                    <span className="text-blue-700 font-medium">{insights.teamOverview.pullRequests.open} open</span>
                  </div>
                </div>

                {/* Open & Closed Issues */}
                <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between text-[#526078]">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Issues</span>
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-[#172033] font-mono">
                    {insights.teamOverview.issues.total}
                  </div>
                  <div className="text-[11px] text-[#526078] flex items-center gap-2">
                    <span className="text-amber-700 font-medium">{insights.teamOverview.issues.open} open</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold">{insights.teamOverview.issues.closed} closed</span>
                  </div>
                </div>

                {/* Active Developers */}
                <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between text-[#526078]">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Active Developers</span>
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold text-[#172033] font-mono">
                    {insights.teamOverview.activeDevelopersCount}
                  </div>
                  <p className="text-[11px] text-[#526078]">
                    {allDevelopers.length} total contributor{allDevelopers.length !== 1 ? 's' : ''} detected
                  </p>
                </div>
              </div>

              {/* Contributor Throughput Table */}
              <div className="ghost-panel bg-[#FFFFFF] border border-[#DCE2EB] overflow-hidden shadow-xs">
                <div className="p-3.5 border-b border-[#DCE2EB] bg-[#F8FAFC] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#5145CD]" />
                    <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                      Contributor Throughput
                    </h2>
                  </div>
                  <span className="text-[11px] text-[#526078]">
                    {filteredDevelopers.length} contributor{filteredDevelopers.length !== 1 ? 's' : ''} listed
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                        <th className="py-2.5 px-3.5">Developer</th>
                        <th className="py-2.5 px-3.5 text-center">Commits</th>
                        <th className="py-2.5 px-3.5 text-center">PRs Opened</th>
                        <th className="py-2.5 px-3.5 text-center">PRs Merged</th>
                        <th className="py-2.5 px-3.5 text-center">Issues</th>
                        <th className="py-2.5 px-3.5">Last Active</th>
                        <th className="py-2.5 px-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2EB]">
                      {filteredDevelopers.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-8 text-center text-xs text-[#526078]">
                            No contributors matched the search criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredDevelopers.map(dev => (
                          <tr key={dev.username} className="hover:bg-[#F4F6FA] transition-colors">
                            {/* Developer Identity */}
                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-2.5">
                                {dev.avatarUrl ? (
                                  <img
                                    src={dev.avatarUrl}
                                    alt={dev.username}
                                    className="w-7 h-7 rounded-full object-cover border border-[#DCE2EB]"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-[#172033] text-white flex items-center justify-center font-bold text-xs">
                                    {dev.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-[#172033]">
                                      {dev.displayName}
                                    </span>
                                    {dev.isBot && (
                                      <span className="text-[9px] px-1 rounded-xs bg-slate-200 text-slate-700 font-mono">
                                        BOT
                                      </span>
                                    )}
                                  </div>
                                  <a
                                    href={dev.profileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-[#526078] hover:text-[#5145CD] font-mono flex items-center gap-0.5"
                                  >
                                    <span>@{dev.username}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              </div>
                            </td>

                            {/* Commits */}
                            <td className="py-3 px-3.5 text-center font-mono font-semibold text-[#172033]">
                              {dev.commitCount}
                            </td>

                            {/* PRs Opened */}
                            <td className="py-3 px-3.5 text-center font-mono text-blue-700 font-medium">
                              {dev.prsOpenedCount}
                            </td>

                            {/* PRs Merged */}
                            <td className="py-3 px-3.5 text-center font-mono text-purple-700 font-semibold">
                              {dev.prsMergedCount}
                            </td>

                            {/* Issues */}
                            <td className="py-3 px-3.5 text-center font-mono text-emerald-700 font-medium">
                              {dev.issuesCreatedCount}
                            </td>

                            {/* Last Active */}
                            <td className="py-3 px-3.5 text-[#526078] text-[11px]">
                              {dev.lastActiveDate ? formatTimeAgo(dev.lastActiveDate) : 'Inactive'}
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedDeveloperUsername(dev.username)}
                                className="btn-secondary text-[11px] py-1 px-2.5 text-[#5145CD] hover:bg-indigo-50"
                              >
                                View Profile
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Unified Development Activity Feed */}
              <div className="ghost-panel bg-[#FFFFFF] border border-[#DCE2EB] overflow-hidden shadow-xs">
                <div className="p-3.5 border-b border-[#DCE2EB] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#5145CD]" />
                    <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                      Recent Development Activity
                    </h2>
                  </div>

                  {/* Activity Filter Tabs */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {['all', 'commit', 'pull_request', 'issue'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActivityFilter(type)}
                        className={`px-2 py-0.5 rounded-xs capitalize font-medium ${
                          activityFilter === type
                            ? 'bg-[#172033] text-white font-semibold'
                            : 'bg-slate-100 text-[#526078] hover:bg-slate-200'
                        }`}
                      >
                        {type.replace('_', ' ')}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-[#DCE2EB] max-h-96 overflow-y-auto">
                  {filteredActivity.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#526078]">
                      No activity found matching the selected filter.
                    </div>
                  ) : (
                    filteredActivity.map((act, i) => (
                      <div key={`${act.id}-${i}`} className="p-3 flex items-start gap-3 hover:bg-[#F8FAFC] transition-colors">
                        {/* Event Icon */}
                        <div className="p-1.5 rounded-sm mt-0.5 shrink-0 bg-slate-100 text-[#172033]">
                          {act.type === 'commit' && <GitCommit className="w-3.5 h-3.5 text-[#5145CD]" />}
                          {act.type === 'pull_request' && <GitPullRequest className="w-3.5 h-3.5 text-blue-600" />}
                          {act.type === 'issue' && <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />}
                        </div>

                        {/* Event Details */}
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={act.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-[#172033] hover:text-[#5145CD] hover:underline truncate"
                              title={act.title}
                            >
                              {act.title}
                            </a>
                            <span className="text-[11px] text-[#526078] shrink-0 font-mono" title={formatDateTime(act.date)}>
                              {formatTimeAgo(act.date)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-[#526078]">
                            <span className="font-medium text-[#172033]">@{act.author}</span>
                            <span>•</span>
                            <span className="capitalize font-mono text-[10px] bg-slate-100 px-1 py-0.2 rounded text-slate-700">
                              {act.extra}
                            </span>
                            <span>•</span>
                            <a
                              href={act.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#5145CD] hover:underline flex items-center gap-0.5 text-[10px]"
                            >
                              <span>View on GitHub</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================== */
            /* 2. INDIVIDUAL DEVELOPER VIEW                               */
            /* ========================================================== */
            activeDeveloper && (
              <div className="space-y-6">
                {/* Developer Profile Header Card */}
                <div className="ghost-panel p-5 bg-[#FFFFFF] border border-[#DCE2EB] flex flex-wrap items-center justify-between gap-4 shadow-xs">
                  <div className="flex items-center gap-4">
                    {activeDeveloper.avatarUrl ? (
                      <img
                        src={activeDeveloper.avatarUrl}
                        alt={activeDeveloper.username}
                        className="w-14 h-14 rounded-full object-cover border-2 border-[#DCE2EB]"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#172033] text-white flex items-center justify-center font-bold text-lg">
                        {activeDeveloper.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-[#172033]">
                          {activeDeveloper.displayName}
                        </h2>
                        {activeDeveloper.isBot && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                            BOT
                          </span>
                        )}
                      </div>
                      <a
                        href={activeDeveloper.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#5145CD] font-mono hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <span>@{activeDeveloper.username}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <p className="text-[11px] text-[#526078] mt-1">
                        Last Active: {activeDeveloper.lastActiveDate ? formatTimeAgo(activeDeveloper.lastActiveDate) : 'Inactive'} ({activeDeveloper.lastActiveDate ? formatDateTime(activeDeveloper.lastActiveDate) : ''})
                      </p>
                    </div>
                  </div>

                  {/* Switch Back Button */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedDeveloperUsername('ALL')}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Team Overview</span>
                    </button>
                  </div>
                </div>

                {/* Individual Developer Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 text-center sm:text-left shadow-xs">
                    <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">Commits</span>
                    <span className="text-2xl font-bold font-mono text-[#172033] block">
                      {activeDeveloper.commitCount}
                    </span>
                    <span className="text-[10px] text-[#526078]">Repository contributions</span>
                  </div>

                  <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 text-center sm:text-left shadow-xs">
                    <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">PRs Opened</span>
                    <span className="text-2xl font-bold font-mono text-blue-700 block">
                      {activeDeveloper.prsOpenedCount}
                    </span>
                    <span className="text-[10px] text-[#526078]">Pull requests submitted</span>
                  </div>

                  <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 text-center sm:text-left shadow-xs">
                    <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">PRs Merged</span>
                    <span className="text-2xl font-bold font-mono text-purple-700 block">
                      {activeDeveloper.prsMergedCount}
                    </span>
                    <span className="text-[10px] text-[#526078]">Accepted code contributions</span>
                  </div>

                  <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#DCE2EB] space-y-1 text-center sm:text-left shadow-xs">
                    <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">Issues Created</span>
                    <span className="text-2xl font-bold font-mono text-emerald-700 block">
                      {activeDeveloper.issuesCreatedCount}
                    </span>
                    <span className="text-[10px] text-[#526078]">Discussions & bug reports</span>
                  </div>
                </div>

                {/* Two-Column Breakdown: Commits vs Pull Requests / Issues */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Developer Commits */}
                  <div className="ghost-panel bg-[#FFFFFF] border border-[#DCE2EB] overflow-hidden shadow-xs">
                    <div className="p-3.5 border-b border-[#DCE2EB] bg-[#F8FAFC] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitCommit className="w-4 h-4 text-[#5145CD]" />
                        <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                          Recent Commits ({activeDeveloper.recentCommits.length})
                        </h3>
                      </div>
                    </div>

                    <div className="divide-y divide-[#DCE2EB] max-h-96 overflow-y-auto">
                      {activeDeveloper.recentCommits.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[#526078]">
                          No recent commits found for @{activeDeveloper.username}.
                        </div>
                      ) : (
                        activeDeveloper.recentCommits.map(c => (
                          <div key={c.sha} className="p-3 hover:bg-[#F8FAFC] transition-colors space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <a
                                href={c.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-[#172033] hover:text-[#5145CD] hover:underline truncate"
                                title={c.message}
                              >
                                {c.message}
                              </a>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded shrink-0">
                                {c.shortSha}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#526078] flex items-center justify-between font-mono">
                              <span>{formatTimeAgo(c.date)}</span>
                              <span>{formatDateTime(c.date)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Developer Pull Requests & Issues */}
                  <div className="ghost-panel bg-[#FFFFFF] border border-[#DCE2EB] overflow-hidden shadow-xs">
                    <div className="p-3.5 border-b border-[#DCE2EB] bg-[#F8FAFC] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                          Pull Requests & Issues ({activeDeveloper.recentPrs.length + activeDeveloper.recentIssues.length})
                        </h3>
                      </div>
                    </div>

                    <div className="divide-y divide-[#DCE2EB] max-h-96 overflow-y-auto">
                      {activeDeveloper.recentPrs.length === 0 && activeDeveloper.recentIssues.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[#526078]">
                          No pull requests or issues authored by @{activeDeveloper.username}.
                        </div>
                      ) : (
                        <>
                          {activeDeveloper.recentPrs.map(pr => (
                            <div key={`pr-${pr.number}`} className="p-3 hover:bg-[#F8FAFC] transition-colors space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <a
                                  href={pr.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-[#172033] hover:text-[#5145CD] hover:underline truncate"
                                  title={pr.title}
                                >
                                  #{pr.number}: {pr.title}
                                </a>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-xs shrink-0 ${
                                  pr.isMerged
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : pr.state === 'closed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}>
                                  {pr.isMerged ? 'Merged' : pr.state}
                                </span>
                              </div>
                              <span className="text-[11px] text-[#526078] block">
                                PR opened {formatTimeAgo(pr.createdAt)}
                              </span>
                            </div>
                          ))}

                          {activeDeveloper.recentIssues.map(iss => (
                            <div key={`iss-${iss.number}`} className="p-3 hover:bg-[#F8FAFC] transition-colors space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <a
                                  href={iss.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-[#172033] hover:text-[#5145CD] hover:underline truncate"
                                  title={iss.title}
                                >
                                  #{iss.number}: {iss.title}
                                </a>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-xs shrink-0 ${
                                  iss.state === 'closed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {iss.state}
                                </span>
                              </div>
                              <span className="text-[11px] text-[#526078] block">
                                Issue created {formatTimeAgo(iss.createdAt)}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default DeveloperInsights;
