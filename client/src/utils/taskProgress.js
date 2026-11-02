/**
 * Task Progress Calculation Utility
 *
 * Implements strict, evidence-based progress calculation:
 *
 * 1. For GitHub-Linked Tasks:
 *    - PR is Merged -> 100% (Completed Green)
 *    - Issue Markdown Checklist items -> (checklistCompleted / checklistTotal) * 100
 *    - Issue is Closed on GitHub -> 100% (Completed Green)
 *    - Pull Request is Open -> 50% (Amber, under code review)
 *    - Issue is Open with 0 checklist items -> Progress unavailable ('—') unless local deliverable is completed
 *    - Never fabricates percentages from raw commit counts
 *
 * 2. For Unlinked Tasks:
 *    - Local Status 'Completed' -> 100% (Completed Green)
 *    - Local Status 'Pending' -> 0% (Muted Blue, not started)
 *    - Local Status 'In Progress' -> '—' (Muted Neutral, awaiting live deliverable source)
 */

export function calculateTaskProgress(task) {
  if (!task) {
    return {
      percentage: null,
      label: '—',
      source: 'unavailable',
      detail: 'No task deliverable data',
      statusDivergence: null,
    };
  }

  const gh = task.github;
  const localStatus = task.status || 'Pending';

  // 1. Linked GitHub Resource
  if (gh && gh.repoFullName && gh.syncStatus !== 'error') {
    const isClosed = gh.issueState === 'closed';
    const isMerged = Boolean(gh.isPullRequest && gh.prMerged);
    const isOpen = gh.issueState === 'open' && !isMerged;

    // Check for status divergence between Local Meeting Ghost status and Remote GitHub status
    let statusDivergence = null;
    if (localStatus === 'Completed' && isOpen) {
      statusDivergence = {
        type: 'local_completed_github_open',
        badge: 'Local Done • GitHub Open',
        description: `Local deliverable is marked Completed in workspace, but GitHub issue #${gh.issueNumber || ''} remains Open on GitHub.`,
      };
    } else if ((localStatus === 'Pending' || localStatus === 'In Progress') && (isClosed || isMerged)) {
      statusDivergence = {
        type: 'local_open_github_closed',
        badge: isMerged ? 'PR Merged • Local Open' : 'GitHub Closed • Local Open',
        description: `Linked GitHub ${gh.isPullRequest ? 'PR is Merged' : 'issue is Closed'}, but local deliverable is still ${localStatus}.`,
      };
    }

    // A. PR is Merged -> 100%
    if (isMerged) {
      return {
        percentage: 100,
        label: '100%',
        source: 'github_pr_merged',
        detail: `Pull Request #${gh.issueNumber} merged in ${gh.repoFullName}`,
        statusDivergence,
      };
    }

    // B. Real Markdown Checklist items in issue/PR body:
    if (gh.checklistTotal > 0) {
      const pct = Math.round((gh.checklistCompleted / gh.checklistTotal) * 100);
      return {
        percentage: pct,
        label: `${pct}%`,
        source: 'github_checklist',
        detail: `${gh.checklistCompleted} of ${gh.checklistTotal} checklist tasks completed on GitHub`,
        statusDivergence,
      };
    }

    // C. Issue is Closed on GitHub:
    if (isClosed) {
      return {
        percentage: 100,
        label: '100%',
        source: 'github_issue_closed',
        detail: `GitHub Issue #${gh.issueNumber} is closed`,
        statusDivergence,
      };
    }

    // D. Open Pull Request (active development / review):
    if (gh.isPullRequest && isOpen) {
      return {
        percentage: 50,
        label: '50%',
        source: 'github_pr_open',
        detail: `Pull Request #${gh.issueNumber} is open and in code review`,
        statusDivergence,
      };
    }

    // E. Open Issue with 0 checklist items:
    // Do not invent progress from commit counts!
    if (localStatus === 'Completed') {
      return {
        percentage: 100,
        label: '100%',
        source: 'local_status',
        detail: 'Local deliverable completed in meeting (GitHub issue remains open)',
        statusDivergence,
      };
    }

    // Progress data is unavailable on GitHub
    return {
      percentage: null,
      label: '—',
      source: 'unavailable',
      detail: gh.issueNumber
        ? `Issue #${gh.issueNumber} is open with no checklist tasks`
        : `Repository linked (${gh.repoFullName})`,
      statusDivergence,
    };
  }

  // 2. Unlinked Tasks or Sync Error
  if (gh && gh.syncStatus === 'error') {
    return {
      percentage: null,
      label: '—',
      source: 'error',
      detail: `Sync error: ${gh.syncError || 'Resource not found on GitHub'}`,
      statusDivergence: null,
    };
  }

  // Unlinked tasks: use existing local task status or show progress as unavailable
  if (localStatus === 'Completed') {
    return {
      percentage: 100,
      label: '100%',
      source: 'local_status',
      detail: 'Local deliverable completed',
      statusDivergence: null,
    };
  }

  if (localStatus === 'Pending') {
    return {
      percentage: 0,
      label: '0%',
      source: 'local_status',
      detail: 'Local deliverable pending (not started)',
      statusDivergence: null,
    };
  }

  // Local 'In Progress' with no linked deliverable evidence
  return {
    percentage: null,
    label: '—',
    source: 'unavailable',
    detail: 'In progress (link a GitHub issue with checklist items to track progress)',
    statusDivergence: null,
  };
}

