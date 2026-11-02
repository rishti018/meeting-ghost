import React, { useState, useEffect } from 'react';
import {
  Github,
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Search,
  CheckSquare,
  RefreshCw,
  GitCommit
} from 'lucide-react';
import { api } from '../api/client';

export function GitHubLinkModal({ task, isOpen, onClose, onLinked }) {
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [customRepoInput, setCustomRepoInput] = useState('');
  const [useCustomRepo, setUseCustomRepo] = useState(false);

  // Link mode: 'issue' or 'repository'
  const [linkMode, setLinkMode] = useState('issue');

  const [issues, setIssues] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState('');
  const [customIssueNumber, setCustomIssueNumber] = useState('');

  const [issueDetails, setIssueDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load repositories on open
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setDetailsError(null);
    setLoadingRepos(true);
    api.listGitHubRepos()
      .then(res => {
        const repoList = res.data || [];
        setRepos(repoList);
        if (task?.github?.repoFullName) {
          setSelectedRepoFullName(task.github.repoFullName);
          if (task.github.issueNumber) {
            setLinkMode('issue');
            setSelectedIssueNumber(String(task.github.issueNumber));
          } else {
            setLinkMode('repository');
          }
        } else if (repoList.length > 0) {
          setSelectedRepoFullName(repoList[0].fullName);
        }
      })
      .catch(err => {
        setError('Failed to fetch repositories: ' + err.message);
      })
      .finally(() => {
        setLoadingRepos(false);
      });
  }, [isOpen, task]);

  // Load issues when repository changes
  useEffect(() => {
    const activeRepo = useCustomRepo ? customRepoInput.trim() : selectedRepoFullName;
    if (!activeRepo || !activeRepo.includes('/')) {
      setIssues([]);
      return;
    }

    const [owner, repo] = activeRepo.split('/');
    if (!owner || !repo) return;

    setLoadingIssues(true);
    setIssueDetails(null);
    setDetailsError(null);

    api.listGitHubIssues(owner, repo, 'all')
      .then(res => {
        const issueList = res.data || [];
        setIssues(issueList);
        if (issueList.length === 0) {
          // If no issues exist on GitHub, recommend linking the repository directly
          if (!task?.github?.issueNumber) {
            setLinkMode('repository');
          }
        } else {
          setLinkMode('issue');
          if (task?.github?.issueNumber) {
            setSelectedIssueNumber(String(task.github.issueNumber));
          } else {
            setSelectedIssueNumber(String(issueList[0].number));
          }
        }
      })
      .catch(err => {
        console.warn('Failed to fetch issues:', err.message);
        setIssues([]);
      })
      .finally(() => {
        setLoadingIssues(false);
      });
  }, [selectedRepoFullName, customRepoInput, useCustomRepo, task]);

  // Load details when issue changes
  useEffect(() => {
    if (linkMode === 'repository') {
      setIssueDetails(null);
      setDetailsError(null);
      return;
    }

    const activeRepo = useCustomRepo ? customRepoInput.trim() : selectedRepoFullName;
    const num = selectedIssueNumber || customIssueNumber;

    if (!activeRepo || !activeRepo.includes('/') || !num) {
      setIssueDetails(null);
      setDetailsError(null);
      return;
    }

    const [owner, repo] = activeRepo.split('/');
    if (!owner || !repo) return;

    setLoadingDetails(true);
    setDetailsError(null);
    api.getGitHubIssueDetails(owner, repo, num)
      .then(res => {
        setIssueDetails(res.data);
        setDetailsError(null);
      })
      .catch(err => {
        setIssueDetails(null);
        setDetailsError(`Issue or Pull Request #${num} was not found on GitHub in ${owner}/${repo} (404 Not Found).`);
      })
      .finally(() => {
        setLoadingDetails(false);
      });
  }, [selectedRepoFullName, customRepoInput, useCustomRepo, selectedIssueNumber, customIssueNumber, linkMode]);

  if (!isOpen || !task) return null;

  const handleLink = async () => {
    const activeRepo = useCustomRepo ? customRepoInput.trim() : selectedRepoFullName;
    if (!activeRepo || !activeRepo.includes('/')) {
      setError('Please select or specify a valid repository in owner/repo format.');
      return;
    }

    const [repoOwner, repoName] = activeRepo.split('/');
    const isRepoOnly = linkMode === 'repository';
    const issueNum = isRepoOnly ? null : (selectedIssueNumber || customIssueNumber);

    if (!isRepoOnly && !issueNum) {
      setError('Please select or enter an issue/PR number, or switch to "Link full repository".');
      return;
    }

    if (!isRepoOnly && detailsError) {
      setError(detailsError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await api.linkTaskToGitHub(task.id, {
        repoOwner,
        repoName,
        issueNumber: issueNum ? parseInt(issueNum, 10) : null,
        resourceType: isRepoOnly ? 'repository' : (issueDetails?.isPullRequest ? 'pull_request' : 'issue'),
      });

      if (onLinked) onLinked(res.data);
      onClose();
    } catch (err) {
      setError('Failed to link task: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B101B]/60 backdrop-blur-xs">
      <div className="ghost-panel max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-dropdown border-[#DCE2EB] bg-[#FFFFFF]">
        {/* Header */}
        <div className="p-4 border-b border-[#DCE2EB] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-sm bg-[#172033] text-white">
              <Github className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                Link GitHub Resource
              </h3>
              <p className="text-[11px] text-[#526078] truncate max-w-md">
                Connect Action Deliverable: <strong className="text-[#172033] font-medium">"{task.task}"</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#172033] hover:text-[#5145CD] hover:bg-[#F4F6FA]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-sm bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Repository Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">
                1. Select Repository
              </label>
              <button
                type="button"
                onClick={() => setUseCustomRepo(!useCustomRepo)}
                className="text-[10px] text-[#5145CD] hover:underline"
              >
                {useCustomRepo ? 'Choose from authorized repos' : 'Specify external / collaborator repo'}
              </button>
            </div>

            {useCustomRepo ? (
              <input
                type="text"
                placeholder="owner/repo (e.g. rishti018/meeting-ghost or facebook/react)"
                value={customRepoInput}
                onChange={(e) => setCustomRepoInput(e.target.value)}
                className="input-base text-xs py-1.5 px-2.5 font-mono"
              />
            ) : (
              <select
                value={selectedRepoFullName}
                onChange={(e) => setSelectedRepoFullName(e.target.value)}
                disabled={loadingRepos}
                className="input-base text-xs py-1.5 px-2.5 cursor-pointer font-mono"
              >
                {repos.length === 0 && <option value="">No authorized repositories found</option>}
                {repos.map(r => (
                  <option key={r.id || r.fullName} value={r.fullName}>
                    {r.fullName} {r.private ? '(Private)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 2. Link Mode Switcher */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">
              2. Target Resource Type
            </label>
            <div className="flex items-center gap-4 text-xs pt-0.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="linkMode"
                  value="issue"
                  checked={linkMode === 'issue'}
                  onChange={() => setLinkMode('issue')}
                  className="text-[#5145CD] focus:ring-[#5145CD]"
                />
                <span className="font-medium text-[#172033]">Specific Issue / Pull Request</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="linkMode"
                  value="repository"
                  checked={linkMode === 'repository'}
                  onChange={() => {
                    setLinkMode('repository');
                    setSelectedIssueNumber('');
                    setCustomIssueNumber('');
                    setError(null);
                    setDetailsError(null);
                  }}
                  className="text-[#5145CD] focus:ring-[#5145CD]"
                />
                <span className="font-medium text-[#172033]">Link Full Repository (no issue)</span>
              </label>
            </div>
          </div>

          {/* 3. Issue or Pull Request Selection (if issue mode) */}
          {linkMode === 'issue' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block">
                  3. Select Issue or Pull Request
                </label>
                {loadingIssues && (
                  <span className="text-[10px] text-[#526078] flex items-center gap-1">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Loading issues...</span>
                  </span>
                )}
              </div>

              {issues.length > 0 ? (
                <select
                  value={selectedIssueNumber}
                  onChange={(e) => {
                    setSelectedIssueNumber(e.target.value);
                    setCustomIssueNumber('');
                  }}
                  className="input-base text-xs py-1.5 px-2.5 cursor-pointer"
                >
                  <option value="">-- Select an issue or PR --</option>
                  {issues.map(item => (
                    <option key={item.number} value={item.number}>
                      #{item.number} [{item.isPullRequest ? 'PR' : 'Issue'} - {item.state}] {item.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-1">
                  <input
                    type="number"
                    placeholder="Enter Issue or PR # (e.g. 1)"
                    value={customIssueNumber}
                    onChange={(e) => {
                      setCustomIssueNumber(e.target.value);
                      setSelectedIssueNumber('');
                    }}
                    className="input-base text-xs py-1.5 px-2.5 font-mono"
                  />
                  <div className="p-2 rounded-xs bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
                    <p className="font-semibold text-slate-700">Notice:</p>
                    This repository currently has <strong>0 open/closed issues</strong> on GitHub. If you haven't created an issue on GitHub yet, you can switch to <em>"Link Full Repository"</em> above.
                  </div>
                </div>
              )}

              {/* Real-time Issue Validation Error Alert */}
              {detailsError && (
                <div className="p-2 rounded-xs bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{detailsError}</span>
                </div>
              )}
            </div>
          )}

          {/* Live Preview Card */}
          {issueDetails && linkMode === 'issue' && (
            <div className="p-3.5 rounded-sm bg-[#F8FAFC] border border-[#DCE2EB] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                  {issueDetails.isPullRequest ? (
                    <GitPullRequest className="w-3.5 h-3.5 text-[#5145CD]" />
                  ) : (
                    <CheckSquare className="w-3.5 h-3.5 text-[#5145CD]" />
                  )}
                  <span>Live GitHub Preview</span>
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded-xs text-[9px] font-bold uppercase ${
                    issueDetails.state === 'closed' || issueDetails.prMerged
                      ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0]'
                      : 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]'
                  }`}
                >
                  {issueDetails.prMerged ? 'Merged' : issueDetails.state}
                </span>
              </div>

              <div className="text-xs font-semibold text-[#172033] flex items-center gap-1.5">
                <span>#{issueDetails.number}: {issueDetails.title}</span>
                <a
                  href={issueDetails.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5145CD] hover:underline"
                >
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#526078] pt-1 border-t border-[#E2E8F0]">
                <div>
                  <span className="block font-medium text-[#172033]">
                    Assignee: {issueDetails.assignee ? `@${issueDetails.assignee}` : 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="block font-medium text-[#172033]">
                    {issueDetails.checklistTotal > 0 ? (
                      `Checklist: ${issueDetails.checklistCompleted}/${issueDetails.checklistTotal} items completed`
                    ) : (
                      'Checklist: None in issue description'
                    )}
                  </span>
                </div>
              </div>

              {issueDetails.lastCommitMessage && (
                <div className="text-[10px] text-[#526078] flex items-center gap-1 pt-0.5 font-mono">
                  <GitCommit className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">Latest Commit: {issueDetails.lastCommitMessage}</span>
                </div>
              )}
            </div>
          )}

          {linkMode === 'repository' && (
            <div className="p-3 rounded-sm bg-blue-50/60 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-2">
              <Github className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-950">Linking Repository Scope</p>
                <p className="text-blue-800">
                  This deliverable will be linked to the repository{' '}
                  <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded text-[10px]">
                    {useCustomRepo ? customRepoInput : selectedRepoFullName}
                  </code>
                  . Progress tracking will be ready for when issues or pull requests are added.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-[#DCE2EB] bg-[#F8FAFC] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-secondary text-xs py-1 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={saving || (linkMode === 'issue' && Boolean(detailsError))}
            className="btn-primary text-xs py-1 px-4 flex items-center gap-1.5"
          >
            {saving ? 'Linking...' : 'Link to GitHub Resource'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GitHubLinkModal;
