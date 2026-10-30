import mongoose from 'mongoose';
import { Integration } from '../models/Integration.js';
import { Task } from '../models/Task.js';
import { isDbConnected } from '../config/db.js';

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'MeetingGhost-Platform/1.0';

// In-memory fallback if MongoDB is temporarily connecting or IP-restricted
let inMemoryIntegration = null;

/**
 * Retrieve GitHub access token and connection information from MongoDB or environment variables.
 * Token is NEVER exposed to client.
 */
export async function getActiveGitHubToken() {
  // 1. Check MongoDB Integration collection if DB is connected
  if (isDbConnected()) {
    try {
      const integration = await Integration.findOne({ provider: 'github' }).select('+accessToken');
      if (integration?.accessToken && integration.accessToken.trim()) {
        return {
          token: integration.accessToken.trim(),
          authMode: 'database',
          username: integration.username || '',
          profile: integration.toObject(),
        };
      }
    } catch (err) {
      console.warn('[GitHubService] Error reading database integration:', err.message);
    }
  }

  // 2. Check in-memory integration (active session / fallback)
  if (inMemoryIntegration?.token) {
    return {
      token: inMemoryIntegration.token,
      authMode: 'memory',
      username: inMemoryIntegration.username || '',
      profile: inMemoryIntegration,
    };
  }

  // 3. Check environment variables (GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN)
  const envToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (envToken && envToken.trim()) {
    return {
      token: envToken.trim(),
      authMode: 'environment',
      username: '',
      profile: null,
    };
  }

  return null;
}

/**
 * Helper to call GitHub API with proper headers and authentication
 */
async function callGitHubApi(endpoint, { method = 'GET', body = null, token = null } = {}) {
  const activeAuth = token ? { token } : await getActiveGitHubToken();
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (activeAuth?.token) {
    headers['Authorization'] = `Bearer ${activeAuth.token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  const options = {
    method,
    headers,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  // Parse rate-limiting headers for observability
  const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
  const rateLimitReset = res.headers.get('x-ratelimit-reset');

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.message || JSON.stringify(errJson);
    } catch (_) {
      errorDetail = await res.text().catch(() => res.statusText);
    }

    const err = new Error(`GitHub API error (${res.status}): ${errorDetail}`);
    err.status = res.status;
    err.rateLimitRemaining = rateLimitRemaining;
    err.rateLimitReset = rateLimitReset;
    throw err;
  }

  return res.json();
}

/**
 * Get OAuth Authorization URL
 */
export function getGitHubOAuthUrl(state = '') {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || `${clientUrl}/settings?github_callback=true`;

  if (!clientId || clientId.trim() === '') {
    return {
      isConfigured: false,
      message: 'GITHUB_CLIENT_ID is not configured in server/.env',
      url: null,
    };
  }

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: callbackUrl,
    scope: 'repo read:user user:email',
    state: state || Math.random().toString(36).substring(7),
  });

  return {
    isConfigured: true,
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    callbackUrl,
  };
}

/**
 * Exchange OAuth temporary code for Access Token and save credentials securely on backend
 */
export async function exchangeOAuthCode(code) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth App credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) are not configured in server/.env');
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      code,
    }),
  });

  const data = await tokenRes.json();
  if (data.error || !data.access_token) {
    throw new Error(`GitHub OAuth exchange failed: ${data.error_description || data.error || 'No access token returned'}`);
  }

  const accessToken = data.access_token;
  return await connectWithToken(accessToken);
}

/**
 * Connect GitHub account using token (OAuth token or Personal Access Token)
 * Verifies with GitHub and persists in MongoDB without returning token.
 */
export async function connectWithToken(token) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Access token is required to connect GitHub account.');
  }

  // 1. Verify token by querying GitHub /user
  const user = await callGitHubApi('/user', { token: token.trim() });

  // 2. Persist in in-memory store and MongoDB
  inMemoryIntegration = {
    token: token.trim(),
    username: user.login || '',
    displayName: user.name || user.login || '',
    avatarUrl: user.avatar_url || '',
    profileUrl: user.html_url || '',
    connectedAt: new Date(),
  };

  let integration = null;
  if (isDbConnected()) {
    integration = await Integration.findOne({ provider: 'github' });
    if (!integration) {
      integration = new Integration({
        provider: 'github',
      });
    }

    integration.accessToken = token.trim();
    integration.username = user.login || '';
    integration.displayName = user.name || user.login || '';
    integration.avatarUrl = user.avatar_url || '';
    integration.profileUrl = user.html_url || '';
    integration.connectedAt = new Date();
    await integration.save();
  }

  return {
    connected: true,
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url,
    publicRepos: user.public_repos || 0,
    connectedAt: new Date(),
  };
}

/**
 * Disconnect GitHub account
 */
export async function disconnectGitHubAccount() {
  inMemoryIntegration = null;
  if (isDbConnected()) {
    await Integration.deleteOne({ provider: 'github' });
  }

  return {
    connected: false,
    message: 'GitHub account disconnected successfully.',
  };
}

/**
 * Get current GitHub connection status
 */
export async function getGitHubStatus() {
  const activeAuth = await getActiveGitHubToken();

  if (!activeAuth?.token) {
    // If not connected, check if an account or username is configured in git or environment
    return {
      connected: false,
      authMode: 'none',
      oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      message: 'No GitHub account connected.',
    };
  }

  try {
    const user = await callGitHubApi('/user', { token: activeAuth.token });
    return {
      connected: true,
      authMode: activeAuth.authMode,
      oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      username: user.login,
      displayName: user.name || user.login,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      publicRepos: user.public_repos || 0,
      connectedAt: activeAuth.profile?.connectedAt || new Date(),
    };
  } catch (err) {
    return {
      connected: false,
      authMode: activeAuth.authMode,
      error: `GitHub token verification failed: ${err.message}`,
      oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    };
  }
}

/**
 * List repositories accessible to the connected user
 */
export async function listUserRepositories({ perPage = 50 } = {}) {
  const activeAuth = await getActiveGitHubToken();

  if (activeAuth?.token) {
    // Authenticated user's repos (including private and collaborator repos)
    const repos = await callGitHubApi(`/user/repos?sort=updated&per_page=${perPage}`);
    return repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login || '',
      private: Boolean(r.private),
      description: r.description || '',
      htmlUrl: r.html_url,
      openIssuesCount: r.open_issues_count || 0,
      defaultBranch: r.default_branch || 'main',
    }));
  }

  // Fallback: If no token connected yet, check if rishti018 exists as default user
  try {
    const repos = await callGitHubApi(`/users/rishti018/repos?sort=updated&per_page=${perPage}`);
    return repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login || 'rishti018',
      private: Boolean(r.private),
      description: r.description || '',
      htmlUrl: r.html_url,
      openIssuesCount: r.open_issues_count || 0,
      defaultBranch: r.default_branch || 'main',
    }));
  } catch (err) {
    return [];
  }
}

/**
 * List issues and pull requests for a given repository
 */
export async function listRepositoryIssues(owner, repo, { state = 'all', perPage = 40 } = {}) {
  if (!owner || !repo) throw new Error('Repository owner and name are required.');

  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}&per_page=${perPage}`;
  const issues = await callGitHubApi(endpoint);

  return issues.map(i => {
    const isPr = Boolean(i.pull_request);
    const body = i.body || '';

    // Calculate real checklist metrics
    const completedMatches = body.match(/- \[[xX]\]/g) || [];
    const incompleteMatches = body.match(/- \[ \]/g) || [];
    const checklistCompleted = completedMatches.length;
    const checklistTotal = checklistCompleted + incompleteMatches.length;

    return {
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state, // "open" | "closed"
      isPullRequest: isPr,
      htmlUrl: i.html_url,
      assignee: i.assignee?.login || (i.assignees?.[0]?.login) || '',
      checklistCompleted,
      checklistTotal,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at,
    };
  });
}

/**
 * Retrieve detailed issue, pull request, checklist, and commit activity
 */
export async function getIssueOrPrDetails(owner, repo, number) {
  if (!owner || !repo || !number) throw new Error('Owner, repo, and issue number are required.');

  const num = parseInt(number, 10);
  const issue = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${num}`);

  const isPr = Boolean(issue.pull_request);
  let prMerged = false;
  let prMergeableState = '';

  if (isPr) {
    try {
      const pr = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${num}`);
      prMerged = Boolean(pr.merged);
      prMergeableState = pr.mergeable_state || '';
    } catch (_) {}
  }

  // Parse checklist from Markdown
  const body = issue.body || '';
  const completedMatches = body.match(/- \[[xX]\]/g) || [];
  const incompleteMatches = body.match(/- \[ \]/g) || [];
  const checklistCompleted = completedMatches.length;
  const checklistTotal = checklistCompleted + incompleteMatches.length;

  // Retrieve relevant commit activity
  let commitCount = 0;
  let lastCommitMessage = '';
  let lastCommitDate = null;

  try {
    const commits = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=5`);
    if (Array.isArray(commits) && commits.length > 0) {
      commitCount = commits.length;
      lastCommitMessage = commits[0].commit?.message?.split('\n')[0] || '';
      lastCommitDate = commits[0].commit?.author?.date ? new Date(commits[0].commit.author.date) : null;
    }
  } catch (_) {}

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    number: issue.number,
    title: issue.title,
    state: issue.state, // "open" | "closed"
    htmlUrl: issue.html_url,
    assignee: issue.assignee?.login || (issue.assignees?.[0]?.login) || '',
    isPullRequest: isPr,
    prMerged,
    prMergeableState,
    checklistCompleted,
    checklistTotal,
    commitCount,
    lastCommitMessage,
    lastCommitDate,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
  };
}

/**
 * Link an Action Tracker task to a GitHub resource and retrieve live data
 */
export async function linkTaskToGitHub(taskId, {
  repoOwner,
  repoName,
  issueNumber,
  resourceType = 'issue',
}) {
  if (!isDbConnected()) {
    throw new Error('Database is not connected. Please verify your MongoDB connection to link tasks.');
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error('Invalid task ID format.');
  }

  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found.');
  }

  if (!repoOwner || !repoName) {
    throw new Error('Repository owner and name are required.');
  }

  let liveDetails = null;
  let syncStatus = 'synced';
  let syncError = '';

  if (issueNumber) {
    try {
      liveDetails = await getIssueOrPrDetails(repoOwner, repoName, issueNumber);
    } catch (err) {
      syncStatus = 'error';
      syncError = err.message;
    }
  }

  task.github = {
    repoOwner: repoOwner.trim(),
    repoName: repoName.trim(),
    repoFullName: `${repoOwner.trim()}/${repoName.trim()}`,
    resourceType: liveDetails?.isPullRequest ? 'pull_request' : resourceType,
    issueNumber: issueNumber ? parseInt(issueNumber, 10) : null,
    issueTitle: liveDetails?.title || '',
    issueState: liveDetails?.state || 'open',
    htmlUrl: liveDetails?.htmlUrl || `https://github.com/${repoOwner.trim()}/${repoName.trim()}`,
    assignee: liveDetails?.assignee || '',
    checklistTotal: liveDetails?.checklistTotal || 0,
    checklistCompleted: liveDetails?.checklistCompleted || 0,
    isPullRequest: Boolean(liveDetails?.isPullRequest),
    prMerged: Boolean(liveDetails?.prMerged),
    commitCount: liveDetails?.commitCount || 0,
    lastCommitMessage: liveDetails?.lastCommitMessage || '',
    lastCommitDate: liveDetails?.lastCommitDate || null,
    lastSyncedAt: new Date(),
    syncStatus,
    syncError,
  };

  // If issue is closed or PR merged, optionally reflect on status if user wants, but don't force
  await task.save();
  return task.toObject();
}

/**
 * Unlink GitHub resource from task
 */
export async function unlinkTaskFromGitHub(taskId) {
  if (!isDbConnected()) {
    throw new Error('Database is not connected. Please verify your MongoDB connection.');
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error('Invalid task ID format.');
  }

  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found.');
  }

  task.github = null;
  await task.save();
  return task.toObject();
}

/**
 * Synchronize all linked GitHub tasks or a single task
 */
export async function syncTaskWithGitHub(taskId) {
  if (!isDbConnected()) {
    throw new Error('Database is not connected. Please verify your MongoDB connection.');
  }

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error('Invalid task ID format.');
  }

  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found.');
  }

  if (!task.github?.repoOwner || !task.github?.repoName) {
    return task.toObject();
  }

  const { repoOwner, repoName, issueNumber } = task.github;
  if (!issueNumber) return task.toObject();

  try {
    const live = await getIssueOrPrDetails(repoOwner, repoName, issueNumber);
    task.github.issueTitle = live.title;
    task.github.issueState = live.state;
    task.github.assignee = live.assignee;
    task.github.checklistTotal = live.checklistTotal;
    task.github.checklistCompleted = live.checklistCompleted;
    task.github.isPullRequest = live.isPullRequest;
    task.github.prMerged = live.prMerged;
    task.github.commitCount = live.commitCount;
    task.github.lastCommitMessage = live.lastCommitMessage;
    task.github.lastCommitDate = live.lastCommitDate;
    task.github.lastSyncedAt = new Date();
    task.github.syncStatus = 'synced';
    task.github.syncError = '';
    await task.save();
  } catch (err) {
    task.github.syncStatus = 'error';
    task.github.syncError = err.message;
    await task.save();
  }

  return task.toObject();
}
