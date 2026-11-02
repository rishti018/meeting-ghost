import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { Meeting } from '../models/Meeting.js';
import { isDbConnected, ensureConnected } from '../config/db.js';
import {
  getRecentCommits,
  getRepositoryPullRequests,
  getIssueOrPrDetails,
  resolveTargetRepo,
} from './githubService.js';

export const ASSESSMENT_CODES = {
  VERIFIED_COMPLETED: 'verified_completed',
  PR_MERGED_UNVERIFIED: 'pr_merged_unverified',
  ISSUE_CLOSED_UNVERIFIED: 'issue_closed_unverified',
  PR_AWAITING_REVIEW: 'pr_awaiting_review',
  ACTIVITY_DETECTED: 'activity_detected',
  OVERDUE_NO_EVIDENCE: 'overdue_no_evidence',
  NO_EVIDENCE: 'no_evidence',
};

export const ASSESSMENT_LABELS = {
  [ASSESSMENT_CODES.VERIFIED_COMPLETED]: 'Task verified complete',
  [ASSESSMENT_CODES.PR_MERGED_UNVERIFIED]: 'PR merged – awaiting task verification',
  [ASSESSMENT_CODES.ISSUE_CLOSED_UNVERIFIED]: 'Issue closed – awaiting task verification',
  [ASSESSMENT_CODES.PR_AWAITING_REVIEW]: 'PR awaiting review',
  [ASSESSMENT_CODES.ACTIVITY_DETECTED]: 'Activity detected',
  [ASSESSMENT_CODES.OVERDUE_NO_EVIDENCE]: 'Overdue – no execution evidence',
  [ASSESSMENT_CODES.NO_EVIDENCE]: 'No GitHub evidence found',
};

export const ASSESSMENT_DESCRIPTIONS = {
  [ASSESSMENT_CODES.VERIFIED_COMPLETED]:
    'Action item has been verified and marked as Completed in Meeting Ghost.',
  [ASSESSMENT_CODES.PR_MERGED_UNVERIFIED]:
    'Pull request was merged on GitHub. Action item remains pending until explicitly verified by the team.',
  [ASSESSMENT_CODES.ISSUE_CLOSED_UNVERIFIED]:
    'Linked GitHub issue was closed. Action item remains pending until explicitly verified by the team.',
  [ASSESSMENT_CODES.PR_AWAITING_REVIEW]:
    'Pull request is open on GitHub and awaiting review or merge.',
  [ASSESSMENT_CODES.ACTIVITY_DETECTED]:
    'Development activity and commits have been detected on GitHub.',
  [ASSESSMENT_CODES.OVERDUE_NO_EVIDENCE]:
    'Task commitment deadline has elapsed with no recorded GitHub development activity.',
  [ASSESSMENT_CODES.NO_EVIDENCE]:
    'No linked GitHub resources or development activity found for this action item.',
};

/**
 * Check if a task is overdue based on dueDateTime, status, and deadline string.
 */
export function checkTaskIsOverdue(task, now = new Date()) {
  if (!task || task.status === 'Completed') return false;

  if (task.dueDateTime) {
    const due = new Date(task.dueDateTime);
    if (!isNaN(due.getTime())) {
      return due.getTime() < now.getTime();
    }
  }

  const deadline = task.deadline;
  if (!deadline || typeof deadline !== 'string' || deadline.trim().toLowerCase() === 'not specified') {
    return false;
  }

  const parsed = new Date(deadline);
  if (!isNaN(parsed.getTime())) {
    return parsed.getTime() < now.getTime();
  }

  if (/yesterday|past|overdue/i.test(deadline)) {
    return true;
  }

  return false;
}

/**
 * Resolve explicit developer identity mapping for a task.
 * NEVER guesses developer identity from names.
 */
export function resolveTaskDeveloperIdentity(task, userMapping = {}, knownGitHubUsers = []) {
  const meetingOwner = (task?.owner || 'Unassigned').trim();

  if (!meetingOwner || meetingOwner.toLowerCase() === 'unassigned') {
    return {
      meetingOwner,
      mappedGitHubUsername: null,
      mappingSource: 'unassigned',
      isMapped: false,
    };
  }

  // 1. Explicit task-level assignee from linked GitHub resource
  if (task.github?.assignee && task.github.assignee.trim()) {
    return {
      meetingOwner,
      mappedGitHubUsername: task.github.assignee.trim(),
      mappingSource: 'task_assignee',
      isMapped: true,
    };
  }

  // 2. Explicit dictionary mapping provided in request or configuration
  if (userMapping && typeof userMapping === 'object') {
    const direct = userMapping[meetingOwner];
    const lower = userMapping[meetingOwner.toLowerCase()];
    const mapped = direct || lower;
    if (mapped && typeof mapped === 'string' && mapped.trim()) {
      return {
        meetingOwner,
        mappedGitHubUsername: mapped.trim(),
        mappingSource: 'explicit_mapping',
        isMapped: true,
      };
    }
  }

  // 3. Exact direct match to a known GitHub username in the repository
  if (Array.isArray(knownGitHubUsers) && knownGitHubUsers.length > 0) {
    const exact = knownGitHubUsers.find(
      u => u && u.toLowerCase() === meetingOwner.toLowerCase()
    );
    if (exact) {
      return {
        meetingOwner,
        mappedGitHubUsername: exact,
        mappingSource: 'exact_username_match',
        isMapped: true,
      };
    }
  }

  // 4. Unmapped - Do not guess!
  return {
    meetingOwner,
    mappedGitHubUsername: null,
    mappingSource: 'unmapped',
    isMapped: false,
  };
}

/**
 * Evaluate single task commitment vs GitHub execution evidence.
 * READ-ONLY: Never updates task.status.
 */
export function assessTaskCommitmentVsExecution(task, {
  userMapping = {},
  knownGitHubUsers = [],
  repositoryCommits = [],
  repositoryPulls = [],
  now = new Date(),
} = {}) {
  const identityMapping = resolveTaskDeveloperIdentity(task, userMapping, knownGitHubUsers);
  const isOverdue = checkTaskIsOverdue(task, now);

  const isLinked = Boolean(task.github && task.github.repoOwner && task.github.repoName);
  const issueNumber = task.github?.issueNumber || null;
  const isPrResource = Boolean(task.github?.isPullRequest || task.github?.resourceType === 'pull_request');

  // Find linked Pull Request
  let pullRequest = null;
  if (isPrResource && issueNumber) {
    const matchingPr = repositoryPulls.find(p => p.number === issueNumber);
    pullRequest = {
      number: issueNumber,
      title: matchingPr?.title || task.github.issueTitle || '',
      state: matchingPr?.state || task.github.issueState || 'open',
      isMerged: Boolean(matchingPr ? matchingPr.isMerged : task.github.prMerged),
      mergedAt: matchingPr?.mergedAt || null,
      headBranch: matchingPr?.headBranch || '',
      baseBranch: matchingPr?.baseBranch || '',
      htmlUrl: matchingPr?.htmlUrl || task.github.htmlUrl || '',
    };
  } else if (issueNumber) {
    // Check if any PR in repo references this issue
    const refPr = repositoryPulls.find(p =>
      p.title?.includes(`#${issueNumber}`) ||
      p.headBranch?.toLowerCase().includes(`issue-${issueNumber}`) ||
      p.headBranch?.toLowerCase().includes(`fix-${issueNumber}`)
    );
    if (refPr) {
      pullRequest = {
        number: refPr.number,
        title: refPr.title,
        state: refPr.state,
        isMerged: Boolean(refPr.isMerged),
        mergedAt: refPr.mergedAt || null,
        headBranch: refPr.headBranch || '',
        baseBranch: refPr.baseBranch || '',
        htmlUrl: refPr.htmlUrl || '',
      };
    }
  }

  // Find linked Issue
  let issue = null;
  if (issueNumber && !isPrResource) {
    issue = {
      number: issueNumber,
      title: task.github.issueTitle || '',
      state: task.github.issueState || 'open',
      assignee: task.github.assignee || null,
      checklistTotal: task.github.checklistTotal || 0,
      checklistCompleted: task.github.checklistCompleted || 0,
      htmlUrl: task.github.htmlUrl || '',
    };
  }

  // Match Commits
  const matchingCommits = [];
  for (const c of repositoryCommits) {
    const commitMsg = c.message || '';
    const commitAuthorLogin = c.author?.login || null;

    let isMatch = false;

    // A: References issue number directly in commit message
    if (issueNumber && commitMsg.includes(`#${issueNumber}`)) {
      isMatch = true;
    }
    // B: Authored by explicitly mapped developer on this task
    else if (identityMapping.mappedGitHubUsername && commitAuthorLogin &&
      commitAuthorLogin.toLowerCase() === identityMapping.mappedGitHubUsername.toLowerCase()) {
      isMatch = true;
    }

    if (isMatch) {
      const authorMatchesOwner = Boolean(
        identityMapping.mappedGitHubUsername &&
        commitAuthorLogin &&
        commitAuthorLogin.toLowerCase() === identityMapping.mappedGitHubUsername.toLowerCase()
      );

      matchingCommits.push({
        sha: c.sha,
        shortSha: c.shortSha || (c.sha ? c.sha.substring(0, 7) : ''),
        message: commitMsg,
        headline: c.headline || commitMsg.split('\n')[0],
        author: c.author || { login: 'Unknown', name: 'Unknown' },
        date: c.date,
        htmlUrl: c.htmlUrl || '',
        authorMatchesOwner,
      });
    }
  }

  // Determine Most Recent Activity
  let lastActivity = null;
  if (matchingCommits.length > 0) {
    const latest = matchingCommits[0];
    lastActivity = {
      type: 'commit',
      description: latest.headline,
      author: latest.author?.login || latest.author?.name || 'Unknown',
      date: latest.date,
      htmlUrl: latest.htmlUrl,
    };
  } else if (pullRequest) {
    lastActivity = {
      type: 'pull_request',
      description: `PR #${pullRequest.number}: ${pullRequest.title}`,
      author: task.github?.assignee || 'Contributor',
      date: pullRequest.mergedAt || task.github?.lastSyncedAt || null,
      htmlUrl: pullRequest.htmlUrl,
    };
  } else if (issue) {
    lastActivity = {
      type: 'issue',
      description: `Issue #${issue.number}: ${issue.title}`,
      author: issue.assignee || 'Author',
      date: task.github?.lastSyncedAt || null,
      htmlUrl: issue.htmlUrl,
    };
  }

  // Determine if there is actual evidence
  const hasEvidence = Boolean(
    matchingCommits.length > 0 ||
    pullRequest ||
    (issue && (issue.checklistCompleted > 0 || issue.state === 'closed')) ||
    (task.github?.commitCount > 0)
  );

  // Determine Assessment Category
  let assessmentCode = ASSESSMENT_CODES.NO_EVIDENCE;
  let verificationRequired = false;
  let statusDivergence = false;

  if (task.status === 'Completed') {
    assessmentCode = ASSESSMENT_CODES.VERIFIED_COMPLETED;
    verificationRequired = false;
  } else if (pullRequest && (pullRequest.isMerged || task.github?.prMerged)) {
    // PR merged on GitHub, but meeting task is still Pending/In Progress
    assessmentCode = ASSESSMENT_CODES.PR_MERGED_UNVERIFIED;
    verificationRequired = true;
    statusDivergence = true;
  } else if (issue && (issue.state === 'closed' || task.github?.issueState === 'closed')) {
    // Issue closed on GitHub, but meeting task is still Pending/In Progress
    assessmentCode = ASSESSMENT_CODES.ISSUE_CLOSED_UNVERIFIED;
    verificationRequired = true;
    statusDivergence = true;
  } else if (pullRequest && (pullRequest.state === 'open' || task.github?.issueState === 'open')) {
    assessmentCode = ASSESSMENT_CODES.PR_AWAITING_REVIEW;
  } else if (hasEvidence) {
    assessmentCode = ASSESSMENT_CODES.ACTIVITY_DETECTED;
  } else if (isOverdue) {
    assessmentCode = ASSESSMENT_CODES.OVERDUE_NO_EVIDENCE;
  } else {
    assessmentCode = ASSESSMENT_CODES.NO_EVIDENCE;
  }

  // Evidence Status Tag
  let evidenceStatus = 'unavailable';
  if (isLinked) {
    if (pullRequest?.isMerged) evidenceStatus = 'verified_pr_merged';
    else if (issue?.state === 'closed') evidenceStatus = 'verified_issue_closed';
    else if (pullRequest?.state === 'open') evidenceStatus = 'pr_open';
    else if (hasEvidence) evidenceStatus = 'activity_detected';
    else evidenceStatus = 'zero_activity';
  }

  return {
    commitment: {
      taskId: task._id ? task._id.toString() : (task.id || null),
      task: task.task || task.description || '',
      owner: task.owner || 'Unassigned',
      deadline: task.deadline || 'Not specified',
      dueDateTime: task.dueDateTime || null,
      isOverdue,
      status: task.status || 'Pending',
      priority: task.priority || 'Medium',
      meetingId: task.meetingId ? task.meetingId.toString() : null,
      meetingTitle: task.meetingTitle || '',
    },
    identityMapping: {
      meetingOwner: identityMapping.meetingOwner,
      mappedGitHubUsername: identityMapping.mappedGitHubUsername,
      mappingSource: identityMapping.mappingSource,
      isMapped: identityMapping.isMapped,
    },
    githubEvidence: {
      isLinked,
      repoFullName: task.github?.repoFullName || null,
      resourceType: task.github?.resourceType || null,
      issue,
      pullRequest,
      commits: matchingCommits,
      lastActivity,
      evidenceStatus,
      hasEvidence,
    },
    assessment: {
      code: assessmentCode,
      label: ASSESSMENT_LABELS[assessmentCode],
      description: ASSESSMENT_DESCRIPTIONS[assessmentCode],
      verificationRequired,
      statusDivergence,
      isOverdue,
    },
  };
}

/**
 * Retrieve comprehensive commitment vs execution insights across tasks.
 */
export async function getCommitmentExecutionInsights({
  meetingId = null,
  owner = null,
  status = null,
  userMapping = {},
  refresh = false,
} = {}) {
  await ensureConnected();

  // Build MongoDB query
  const query = {};
  if (meetingId && mongoose.Types.ObjectId.isValid(meetingId)) {
    query.meetingId = meetingId;
  }
  if (owner && owner.trim()) {
    const safeOwner = owner.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.owner = new RegExp(`^${safeOwner}$`, 'i');
  }
  if (status && ['Pending', 'In Progress', 'Completed'].includes(status)) {
    query.status = status;
  }

  const tasks = await Task.find(query).sort({ dueDateTime: 1, createdAt: -1 });

  // Load accessible repository telemetry to cross-reference
  let repositoryCommits = [];
  let repositoryPulls = [];
  let knownGitHubUsers = [];

  try {
    const { owner: defaultOwner, repo: defaultRepo } = await resolveTargetRepo();
    if (defaultOwner && defaultRepo) {
      const [commitsRes, pullsRes] = await Promise.all([
        getRecentCommits({ owner: defaultOwner, repo: defaultRepo, limit: 100 }).catch(() => ({ commits: [] })),
        getRepositoryPullRequests({ owner: defaultOwner, repo: defaultRepo, limit: 50 }).catch(() => ({ pullRequests: [] })),
      ]);

      repositoryCommits = commitsRes.commits || [];
      repositoryPulls = pullsRes.pullRequests || [];

      // Extract unique known GitHub users from repo
      const userSet = new Set();
      repositoryCommits.forEach(c => {
        if (c.author?.login) userSet.add(c.author.login);
      });
      repositoryPulls.forEach(p => {
        if (p.author?.login) userSet.add(p.author.login);
      });
      knownGitHubUsers = Array.from(userSet);
    }
  } catch (err) {
    console.warn('[CommitmentIntelligence] Repository telemetry notice:', err.message);
  }

  // Optionally re-sync linked tasks if refresh is requested
  if (refresh) {
    for (const t of tasks) {
      if (t.github?.repoOwner && t.github?.repoName && t.github?.issueNumber) {
        try {
          const live = await getIssueOrPrDetails(t.github.repoOwner, t.github.repoName, t.github.issueNumber);
          t.github.issueTitle = live.title;
          t.github.issueState = live.state;
          t.github.assignee = live.assignee;
          t.github.checklistTotal = live.checklistTotal;
          t.github.checklistCompleted = live.checklistCompleted;
          t.github.isPullRequest = live.isPullRequest;
          t.github.prMerged = live.prMerged;
          t.github.lastSyncedAt = new Date();
          await t.save();
        } catch (_) {}
      }
    }
  }

  // Assess each task
  const assessedTasks = tasks.map(t =>
    assessTaskCommitmentVsExecution(t, {
      userMapping,
      knownGitHubUsers,
      repositoryCommits,
      repositoryPulls,
    })
  );

  // Compute summary metrics
  const assessmentCounts = {};
  Object.values(ASSESSMENT_CODES).forEach(code => {
    assessmentCounts[code] = 0;
  });

  let linkedCount = 0;
  let verificationPendingCount = 0;
  let overdueWithoutEvidenceCount = 0;

  for (const item of assessedTasks) {
    const code = item.assessment.code;
    assessmentCounts[code] = (assessmentCounts[code] || 0) + 1;

    if (item.githubEvidence.isLinked) linkedCount++;
    if (item.assessment.verificationRequired) verificationPendingCount++;
    if (code === ASSESSMENT_CODES.OVERDUE_NO_EVIDENCE) overdueWithoutEvidenceCount++;
  }

  return {
    summary: {
      totalTasks: assessedTasks.length,
      linkedTasks: linkedCount,
      unlinkedTasks: assessedTasks.length - linkedCount,
      assessments: assessmentCounts,
      verificationPendingCount,
      overdueWithoutEvidenceCount,
    },
    tasks: assessedTasks,
    isEmpty: assessedTasks.length === 0,
    notice: 'Commitment vs Execution Intelligence correlates meeting action items with GitHub evidence. Task completion is never marked automatically and requires human verification.',
  };
}

/**
 * Retrieve commitment vs execution insight for a single task.
 */
export async function getSingleTaskCommitmentInsight(taskId, {
  userMapping = {},
  mappedUser = null,
  refresh = false,
} = {}) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    const err = new Error('Invalid task ID format.');
    err.status = 400;
    throw err;
  }

  const task = await Task.findById(taskId);
  if (!task) {
    const err = new Error('Task not found.');
    err.status = 404;
    throw err;
  }

  // Optional manual mapped user override for this single task
  const effectiveMapping = { ...userMapping };
  if (mappedUser && typeof mappedUser === 'string') {
    effectiveMapping[task.owner] = mappedUser.trim();
  }

  // Re-sync if requested
  if (refresh && task.github?.repoOwner && task.github?.repoName && task.github?.issueNumber) {
    try {
      const live = await getIssueOrPrDetails(task.github.repoOwner, task.github.repoName, task.github.issueNumber);
      task.github.issueTitle = live.title;
      task.github.issueState = live.state;
      task.github.assignee = live.assignee;
      task.github.checklistTotal = live.checklistTotal;
      task.github.checklistCompleted = live.checklistCompleted;
      task.github.isPullRequest = live.isPullRequest;
      task.github.prMerged = live.prMerged;
      task.github.lastSyncedAt = new Date();
      await task.save();
    } catch (_) {}
  }

  let repositoryCommits = [];
  let repositoryPulls = [];
  let knownGitHubUsers = [];

  const repoOwner = task.github?.repoOwner;
  const repoName = task.github?.repoName;

  try {
    const target = await resolveTargetRepo(repoOwner, repoName);
    if (target.owner && target.repo) {
      const [commitsRes, pullsRes] = await Promise.all([
        getRecentCommits({ owner: target.owner, repo: target.repo, limit: 100 }).catch(() => ({ commits: [] })),
        getRepositoryPullRequests({ owner: target.owner, repo: target.repo, limit: 50 }).catch(() => ({ pullRequests: [] })),
      ]);

      repositoryCommits = commitsRes.commits || [];
      repositoryPulls = pullsRes.pullRequests || [];

      const userSet = new Set();
      repositoryCommits.forEach(c => {
        if (c.author?.login) userSet.add(c.author.login);
      });
      repositoryPulls.forEach(p => {
        if (p.author?.login) userSet.add(p.author.login);
      });
      knownGitHubUsers = Array.from(userSet);
    }
  } catch (_) {}

  return assessTaskCommitmentVsExecution(task, {
    userMapping: effectiveMapping,
    knownGitHubUsers,
    repositoryCommits,
    repositoryPulls,
  });
}

