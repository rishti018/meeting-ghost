import mongoose from 'mongoose';
import { Integration } from '../models/Integration.js';
import { Task } from '../models/Task.js';
import { isDbConnected, ensureConnected } from '../config/db.js';
import { config } from '../config/env.js';
import {
  getInstallationAccessToken,
  getInstallationRepositories,
  getInstallationDetails,
  verifyGitHubAppConnectivity,
} from './githubAppAuth.js';

export { verifyGitHubAppConnectivity };

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'MeetingGhost-Platform/1.0';

// In-memory fallback if MongoDB is temporarily connecting or IP-restricted
let inMemoryIntegration = null;

/**
 * Retrieve GitHub access token and connection information from GitHub App, MongoDB or environment variables.
 * Token is NEVER exposed to client.
 */
export async function getActiveGitHubToken() {
  // 1. Check configured GitHub App first (recommended secure app-based integration)
  if (config.githubApp?.isConfigured) {
    try {
      const appToken = await getInstallationAccessToken();
      return {
        token: appToken,
        authMode: 'github_app',
        username: '',
        profile: null,
      };
    } catch (err) {
      console.warn('[GitHubService] GitHub App token retrieval notice:', err.message);
    }
  }

  // 2. Check MongoDB Integration collection if DB is connected
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
  // If GitHub App is configured, retrieve installation details and authorized repository metrics
  if (config.githubApp?.isConfigured) {
    try {
      const installDetails = await getInstallationDetails();
      const repoData = await getInstallationRepositories({ perPage: 10 });
      return {
        connected: true,
        authMode: 'github_app',
        appId: config.githubApp.appId,
        installationId: config.githubApp.installationId,
        username: installDetails.account?.login || 'GitHub App',
        displayName: installDetails.account?.login || 'GitHub App',
        avatarUrl: installDetails.account?.avatarUrl || '',
        profileUrl: installDetails.account?.htmlUrl || '',
        repositorySelection: installDetails.repositorySelection,
        publicRepos: repoData.totalCount,
        authorizedReposCount: repoData.totalCount,
        connectedAt: installDetails.createdAt || new Date(),
      };
    } catch (err) {
      return {
        connected: false,
        authMode: 'github_app',
        error: `GitHub App verification notice: ${err.message}`,
        appId: config.githubApp.appId,
        installationId: config.githubApp.installationId,
      };
    }
  }

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
  // If GitHub App is configured, return strictly authorized repositories
  if (config.githubApp?.isConfigured) {
    try {
      const repoData = await getInstallationRepositories({ perPage });
      return repoData.repositories;
    } catch (err) {
      console.warn('[GitHubService] GitHub App repo listing fallback:', err.message);
    }
  }

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
      const status = err.status || (err.message.includes('404') ? 404 : 400);
      const customErr = new Error(`Issue or Pull Request #${issueNumber} not found in repository ${repoOwner}/${repoName}. Please verify the issue exists on GitHub or link the repository directly.`);
      customErr.status = status;
      throw customErr;
    }
  }

  task.github = {
    repoOwner: repoOwner.trim(),
    repoName: repoName.trim(),
    repoFullName: `${repoOwner.trim()}/${repoName.trim()}`,
    resourceType: liveDetails ? (liveDetails.isPullRequest ? 'pull_request' : 'issue') : 'repository',
    issueNumber: issueNumber ? parseInt(issueNumber, 10) : null,
    issueTitle: liveDetails?.title || '',
    issueState: liveDetails?.state || (issueNumber ? 'open' : ''),
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

  task.github = null;
  await task.save();
  return task.toObject();
}

/**
 * Synchronize all linked GitHub tasks or a single task
 */
export async function syncTaskWithGitHub(taskId) {
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
  if (!task) {
    throw new Error('Task not found.');
  }

  if (!task.github?.repoOwner || !task.github?.repoName) {
    return task.toObject();
  }

  const { repoOwner, repoName, issueNumber } = task.github;
  if (!issueNumber) {
    task.github.syncStatus = 'synced';
    task.github.syncError = '';
    task.github.lastSyncedAt = new Date();
    await task.save();
    return task.toObject();
  }

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
    task.github.syncError = err.message.includes('404')
      ? `Issue #${issueNumber} not found on GitHub in ${repoOwner}/${repoName}`
      : `Sync error: ${err.message}`;
    task.github.lastSyncedAt = new Date();
    await task.save();
  }

  return task.toObject();
}

/**
 * Resolves target repository owner and repo name from parameters or defaults to first accessible repo.
 */
export async function resolveTargetRepo(targetOwner, targetRepo) {
  let owner = targetOwner?.trim();
  let repo = targetRepo?.trim();

  if (!owner || !repo) {
    const repos = await listUserRepositories({ perPage: 1 });
    if (repos && repos.length > 0) {
      owner = repos[0].owner;
      repo = repos[0].name;
    } else {
      const err = new Error('No accessible GitHub repositories found. Please verify your GitHub App configuration.');
      err.status = 404;
      throw err;
    }
  }

  return { owner, repo };
}

/**
 * Retrieve recent commits with author, message, branch, and date from GitHub.
 */
export async function getRecentCommits({
  owner: targetOwner,
  repo: targetRepo,
  branch,
  limit = 30,
  page = 1,
  author,
} = {}) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);
  const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);

  let query = `per_page=${parsedLimit}&page=${parsedPage}`;
  if (branch && branch.trim()) query += `&sha=${encodeURIComponent(branch.trim())}`;
  if (author && author.trim()) query += `&author=${encodeURIComponent(author.trim())}`;

  let rawCommits = [];
  try {
    rawCommits = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query}`);
    if (!Array.isArray(rawCommits)) rawCommits = [];
  } catch (err) {
    if (err.status === 409 || err.message?.includes('Git Repository is empty')) {
      return {
        repository: { owner, name: repo, fullName: `${owner}/${repo}` },
        branch: branch || null,
        commits: [],
        isEmpty: true,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          totalFetched: 0,
          hasMore: false,
        },
      };
    }
    const error = new Error(`Failed to load commits for ${owner}/${repo}: ${err.message}`);
    error.status = err.status || 500;
    throw error;
  }

  const commits = rawCommits.map(c => {
    const login = c.author?.login || null;
    const authorName = c.commit?.author?.name || c.author?.login || 'Unknown Author';
    const isBot = c.author?.type === 'Bot' || Boolean(login && (login.includes('[bot]') || login.endsWith('-bot')));

    return {
      sha: c.sha,
      shortSha: c.sha ? c.sha.substring(0, 7) : '',
      message: c.commit?.message || '',
      headline: c.commit?.message ? c.commit.message.split('\n')[0] : '',
      branch: branch || null,
      date: c.commit?.author?.date || c.commit?.committer?.date || null,
      author: {
        login,
        name: authorName,
        email: c.commit?.author?.email || null,
        avatarUrl: c.author?.avatar_url || '',
        profileUrl: c.author?.html_url || (login ? `https://github.com/${login}` : ''),
        isBot,
      },
      committer: {
        name: c.commit?.committer?.name || null,
        date: c.commit?.committer?.date || null,
      },
      htmlUrl: c.html_url || '',
    };
  });

  return {
    repository: { owner, name: repo, fullName: `${owner}/${repo}` },
    branch: branch || null,
    commits,
    isEmpty: commits.length === 0 && parsedPage === 1,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalFetched: commits.length,
      hasMore: commits.length === parsedLimit,
    },
  };
}

/**
 * Retrieve repository pull requests with author, title, state, and merged status.
 */
export async function getRepositoryPullRequests({
  owner: targetOwner,
  repo: targetRepo,
  state = 'all',
  limit = 30,
  page = 1,
  author,
} = {}) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);
  const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const validState = ['all', 'open', 'closed'].includes(state?.toLowerCase()) ? state.toLowerCase() : 'all';

  let rawPulls = [];
  try {
    rawPulls = await callGitHubApi(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${validState}&per_page=${parsedLimit}&page=${parsedPage}`
    );
    if (!Array.isArray(rawPulls)) rawPulls = [];
  } catch (err) {
    if (err.status === 409 || err.message?.includes('Git Repository is empty')) {
      return {
        repository: { owner, name: repo, fullName: `${owner}/${repo}` },
        pullRequests: [],
        pagination: { page: parsedPage, limit: parsedLimit, totalFetched: 0, hasMore: false },
      };
    }
    const error = new Error(`Failed to load pull requests for ${owner}/${repo}: ${err.message}`);
    error.status = err.status || 500;
    throw error;
  }

  let filtered = rawPulls;
  if (author && author.trim()) {
    const authorFilter = author.trim().toLowerCase();
    filtered = filtered.filter(p => p.user?.login?.toLowerCase() === authorFilter);
  }

  const pullRequests = filtered.map(p => {
    const login = p.user?.login || null;
    const authorName = p.user?.name || login || 'Unknown Contributor';
    const isBot = p.user?.type === 'Bot' || Boolean(login && (login.includes('[bot]') || login.endsWith('-bot')));

    return {
      id: p.id,
      number: p.number,
      title: p.title || '',
      state: p.state, // 'open' | 'closed'
      isMerged: Boolean(p.merged_at),
      mergedAt: p.merged_at || null,
      headBranch: p.head?.ref || '',
      baseBranch: p.base?.ref || '',
      author: {
        login,
        name: authorName,
        avatarUrl: p.user?.avatar_url || '',
        profileUrl: p.user?.html_url || (login ? `https://github.com/${login}` : ''),
        isBot,
      },
      assignees: (p.assignees || []).map(a => ({
        login: a.login,
        avatarUrl: a.avatar_url || '',
      })),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      closedAt: p.closed_at || null,
      htmlUrl: p.html_url || '',
    };
  });

  return {
    repository: { owner, name: repo, fullName: `${owner}/${repo}` },
    pullRequests,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalFetched: pullRequests.length,
      hasMore: rawPulls.length === parsedLimit,
    },
  };
}

/**
 * Retrieve repository issues with assignee, state, creation/update dates, excluding pull requests.
 */
export async function getRepositoryIssues({
  owner: targetOwner,
  repo: targetRepo,
  state = 'all',
  limit = 30,
  page = 1,
  assignee,
  author,
} = {}) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);
  const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 30), 100);
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const validState = ['all', 'open', 'closed'].includes(state?.toLowerCase()) ? state.toLowerCase() : 'all';

  let query = `state=${validState}&per_page=${parsedLimit}&page=${parsedPage}`;
  if (assignee && assignee.trim()) query += `&assignee=${encodeURIComponent(assignee.trim())}`;
  if (author && author.trim()) query += `&creator=${encodeURIComponent(author.trim())}`;

  let rawIssuesAndPrs = [];
  try {
    rawIssuesAndPrs = await callGitHubApi(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query}`
    );
    if (!Array.isArray(rawIssuesAndPrs)) rawIssuesAndPrs = [];
  } catch (err) {
    if (err.status === 409 || err.message?.includes('Git Repository is empty')) {
      return {
        repository: { owner, name: repo, fullName: `${owner}/${repo}` },
        issues: [],
        pagination: { page: parsedPage, limit: parsedLimit, totalFetched: 0, hasMore: false },
      };
    }
    const error = new Error(`Failed to load issues for ${owner}/${repo}: ${err.message}`);
    error.status = err.status || 500;
    throw error;
  }

  // GitHub returns PRs in the issues endpoint; filter them out
  const rawIssues = rawIssuesAndPrs.filter(item => !item.pull_request);

  const issues = rawIssues.map(i => {
    const login = i.user?.login || null;
    const authorName = i.user?.name || login || 'Unknown Creator';
    const isBot = i.user?.type === 'Bot' || Boolean(login && (login.includes('[bot]') || login.endsWith('-bot')));

    return {
      id: i.id,
      number: i.number,
      title: i.title || '',
      state: i.state, // 'open' | 'closed'
      author: {
        login,
        name: authorName,
        avatarUrl: i.user?.avatar_url || '',
        profileUrl: i.user?.html_url || (login ? `https://github.com/${login}` : ''),
        isBot,
      },
      assignee: i.assignee ? {
        login: i.assignee.login,
        avatarUrl: i.assignee.avatar_url || '',
      } : null,
      assignees: (i.assignees || []).map(a => ({
        login: a.login,
        avatarUrl: a.avatar_url || '',
      })),
      labels: (i.labels || []).map(l => ({
        name: typeof l === 'string' ? l : l.name,
        color: typeof l === 'string' ? 'gray' : l.color,
      })),
      commentsCount: i.comments || 0,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: i.closed_at || null,
      htmlUrl: i.html_url || '',
    };
  });

  return {
    repository: { owner, name: repo, fullName: `${owner}/${repo}` },
    issues,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalFetched: issues.length,
      hasMore: rawIssuesAndPrs.length === parsedLimit,
    },
  };
}

/**
 * Retrieve comprehensive Developer Insights from GitHub for a connected repository.
 * Aggregates Team Overview metrics, developer grouping, and recent activity.
 * Does NOT convert commit metrics into task completion percentages.
 */
export async function getDeveloperInsights(targetOwner, targetRepo) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);

  // 1. Fetch Repository Metadata
  let repoMeta = null;
  try {
    repoMeta = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  } catch (err) {
    const error = new Error(`Failed to load repository ${owner}/${repo}: ${err.message}`);
    error.status = err.status || 500;
    throw error;
  }

  // 2. Fetch Commits (up to 100 recent)
  let rawCommits = [];
  try {
    rawCommits = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=100`);
    if (!Array.isArray(rawCommits)) rawCommits = [];
  } catch (err) {
    console.warn(`[DeveloperInsights] Commit fetch notice for ${owner}/${repo}:`, err.message);
    rawCommits = [];
  }

  // 3. Fetch Pull Requests (up to 100, all states)
  let rawPulls = [];
  try {
    rawPulls = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&per_page=100`);
    if (!Array.isArray(rawPulls)) rawPulls = [];
  } catch (err) {
    console.warn(`[DeveloperInsights] Pull requests fetch notice for ${owner}/${repo}:`, err.message);
    rawPulls = [];
  }

  // 4. Fetch Issues (up to 100, all states)
  let rawIssuesAndPrs = [];
  try {
    rawIssuesAndPrs = await callGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=all&per_page=100`);
    if (!Array.isArray(rawIssuesAndPrs)) rawIssuesAndPrs = [];
  } catch (err) {
    console.warn(`[DeveloperInsights] Issues fetch notice for ${owner}/${repo}:`, err.message);
    rawIssuesAndPrs = [];
  }

  // Separate true issues from pull requests (GitHub issues API includes PRs)
  const rawIssues = rawIssuesAndPrs.filter(item => !item.pull_request);

  // --- Aggregate Pull Request Metrics ---
  const prsOpened = rawPulls.length;
  const prsMerged = rawPulls.filter(p => Boolean(p.merged_at)).length;
  const prsOpen = rawPulls.filter(p => p.state === 'open').length;
  const prsClosed = rawPulls.filter(p => p.state === 'closed' && !p.merged_at).length;

  // --- Aggregate Issue Metrics ---
  const issuesTotal = rawIssues.length;
  const issuesOpen = rawIssues.filter(i => i.state === 'open').length;
  const issuesClosed = rawIssues.filter(i => i.state === 'closed').length;

  // --- Group Developer Activity by Username ---
  const developerMap = new Map();

  function getOrCreateDev(login, fallbackName, avatarUrl, profileUrl, isBot = false) {
    const key = (login || fallbackName || 'Unknown Developer').toLowerCase();
    if (!developerMap.has(key)) {
      developerMap.set(key, {
        username: login || fallbackName || 'Unknown',
        displayName: fallbackName || login || 'Unknown Developer',
        avatarUrl: avatarUrl || '',
        profileUrl: profileUrl || (login ? `https://github.com/${login}` : ''),
        isBot: Boolean(isBot || (login && (login.includes('[bot]') || login.endsWith('-bot') || login === 'github-actions'))),
        commitCount: 0,
        prsOpenedCount: 0,
        prsMergedCount: 0,
        issuesCreatedCount: 0,
        lastActiveDate: null,
        recentCommits: [],
        recentPrs: [],
        recentIssues: [],
      });
    }
    return developerMap.get(key);
  }

  // Process Commits
  for (const c of rawCommits) {
    const login = c.author?.login || null;
    const authorName = c.commit?.author?.name || c.author?.name || 'Unknown Author';
    const avatarUrl = c.author?.avatar_url || '';
    const profileUrl = c.author?.html_url || '';
    const isBot = c.author?.type === 'Bot' || authorName.includes('[bot]') || authorName === 'GitHub';
    const commitDate = c.commit?.author?.date ? new Date(c.commit.author.date) : new Date();

    const dev = getOrCreateDev(login, authorName, avatarUrl, profileUrl, isBot);
    dev.commitCount += 1;
    if (!dev.lastActiveDate || commitDate > new Date(dev.lastActiveDate)) {
      dev.lastActiveDate = commitDate.toISOString();
    }

    if (dev.recentCommits.length < 10) {
      dev.recentCommits.push({
        sha: c.sha,
        shortSha: c.sha.substring(0, 7),
        message: c.commit?.message?.split('\n')[0] || 'No commit message',
        date: commitDate.toISOString(),
        htmlUrl: c.html_url,
      });
    }
  }

  // Process Pull Requests
  for (const p of rawPulls) {
    const login = p.user?.login || null;
    const authorName = p.user?.login || 'Unknown Contributor';
    const avatarUrl = p.user?.avatar_url || '';
    const profileUrl = p.user?.html_url || '';
    const isBot = p.user?.type === 'Bot' || (login && login.includes('[bot]'));
    const prDate = new Date(p.updated_at || p.created_at || Date.now());

    const dev = getOrCreateDev(login, authorName, avatarUrl, profileUrl, isBot);
    dev.prsOpenedCount += 1;
    if (p.merged_at) dev.prsMergedCount += 1;

    if (!dev.lastActiveDate || prDate > new Date(dev.lastActiveDate)) {
      dev.lastActiveDate = prDate.toISOString();
    }

    if (dev.recentPrs.length < 10) {
      dev.recentPrs.push({
        number: p.number,
        title: p.title,
        state: p.state,
        isMerged: Boolean(p.merged_at),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        htmlUrl: p.html_url,
      });
    }
  }

  // Process Issues
  for (const i of rawIssues) {
    const login = i.user?.login || null;
    const authorName = i.user?.login || 'Unknown Creator';
    const avatarUrl = i.user?.avatar_url || '';
    const profileUrl = i.user?.html_url || '';
    const isBot = i.user?.type === 'Bot' || (login && login.includes('[bot]'));
    const issueDate = new Date(i.updated_at || i.created_at || Date.now());

    const dev = getOrCreateDev(login, authorName, avatarUrl, profileUrl, isBot);
    dev.issuesCreatedCount += 1;

    if (!dev.lastActiveDate || issueDate > new Date(dev.lastActiveDate)) {
      dev.lastActiveDate = issueDate.toISOString();
    }

    if (dev.recentIssues.length < 10) {
      dev.recentIssues.push({
        number: i.number,
        title: i.title,
        state: i.state,
        createdAt: i.created_at,
        htmlUrl: i.html_url,
      });
    }
  }

  // Convert developers map to array, sorted by total activity (commits + PRs) descending
  const developers = Array.from(developerMap.values()).sort((a, b) => {
    const totalA = a.commitCount + a.prsOpenedCount;
    const totalB = b.commitCount + b.prsOpenedCount;
    return totalB - totalA;
  });

  // --- Compile Recent Unified Development Activity ---
  const activityFeed = [];

  for (const c of rawCommits.slice(0, 30)) {
    activityFeed.push({
      type: 'commit',
      id: c.sha,
      title: c.commit?.message?.split('\n')[0] || 'Commit',
      author: c.author?.login || c.commit?.author?.name || 'Unknown',
      authorAvatar: c.author?.avatar_url || '',
      date: c.commit?.author?.date || new Date().toISOString(),
      htmlUrl: c.html_url,
      extra: c.sha.substring(0, 7),
    });
  }

  for (const p of rawPulls.slice(0, 20)) {
    activityFeed.push({
      type: 'pull_request',
      id: `pr-${p.number}`,
      title: p.title,
      author: p.user?.login || 'Unknown',
      authorAvatar: p.user?.avatar_url || '',
      date: p.created_at,
      htmlUrl: p.html_url,
      extra: p.merged_at ? 'Merged' : p.state,
      isMerged: Boolean(p.merged_at),
      number: p.number,
    });
  }

  for (const i of rawIssues.slice(0, 20)) {
    activityFeed.push({
      type: 'issue',
      id: `issue-${i.number}`,
      title: i.title,
      author: i.user?.login || 'Unknown',
      authorAvatar: i.user?.avatar_url || '',
      date: i.created_at,
      htmlUrl: i.html_url,
      extra: i.state,
      number: i.number,
    });
  }

  // Sort activity feed by date descending
  activityFeed.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    repository: {
      owner: repoMeta.owner?.login || owner,
      name: repoMeta.name || repo,
      fullName: repoMeta.full_name || `${owner}/${repo}`,
      private: Boolean(repoMeta.private),
      defaultBranch: repoMeta.default_branch || 'main',
      description: repoMeta.description || '',
      htmlUrl: repoMeta.html_url || `https://github.com/${owner}/${repo}`,
      openIssuesCount: repoMeta.open_issues_count || 0,
      starsCount: repoMeta.stargazers_count || 0,
    },
    teamOverview: {
      totalCommits: rawCommits.length,
      pullRequests: {
        total: prsOpened,
        open: prsOpen,
        merged: prsMerged,
        closed: prsClosed,
      },
      issues: {
        total: issuesTotal,
        open: issuesOpen,
        closed: issuesClosed,
      },
      activeDevelopersCount: developers.filter(d => !d.isBot).length,
    },
    developers,
    recentActivity: activityFeed.slice(0, 30),
    lastSyncedAt: new Date().toISOString(),
    activityNotice: 'Developer Insights displays raw repository development activity. Action Tracker task completion is grounded in verified deliverables rather than commit counts.',
  };
}

/**
 * Retrieve developer-wise activity grouped by GitHub username, or for a specific developer.
 */
export async function getDeveloperWiseActivity({
  owner: targetOwner,
  repo: targetRepo,
  hideBots = false,
  developer = null,
} = {}) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);
  const insights = await getDeveloperInsights(owner, repo);

  if (developer && developer.trim()) {
    const username = developer.trim().toLowerCase();
    const found = insights.developers.find(d => d.username.toLowerCase() === username);
    return {
      repository: insights.repository,
      developer: found || {
        username: developer.trim(),
        displayName: developer.trim(),
        avatarUrl: '',
        profileUrl: `https://github.com/${encodeURIComponent(developer.trim())}`,
        isBot: false,
        commitCount: 0,
        prsOpenedCount: 0,
        prsMergedCount: 0,
        issuesCreatedCount: 0,
        lastActiveDate: null,
        recentCommits: [],
        recentPrs: [],
        recentIssues: [],
      },
      found: Boolean(found),
      lastSyncedAt: insights.lastSyncedAt,
    };
  }

  let list = insights.developers;
  if (hideBots) {
    list = list.filter(d => !d.isBot);
  }

  return {
    repository: insights.repository,
    developers: list,
    totalDevelopers: insights.developers.length,
    activeDevelopersCount: insights.developers.filter(d => !d.isBot).length,
    lastSyncedAt: insights.lastSyncedAt,
  };
}

/**
 * Retrieve overall team activity summary.
 */
export async function getTeamActivitySummary({
  owner: targetOwner,
  repo: targetRepo,
  developer = null,
} = {}) {
  const { owner, repo } = await resolveTargetRepo(targetOwner, targetRepo);
  const insights = await getDeveloperInsights(owner, repo);

  let recentActivity = insights.recentActivity;
  if (developer && developer.trim()) {
    const filterUser = developer.trim().toLowerCase();
    recentActivity = recentActivity.filter(a => a.author.toLowerCase() === filterUser);
  }

  return {
    repository: insights.repository,
    teamOverview: insights.teamOverview,
    developerFilter: developer ? developer.trim() : null,
    developers: insights.developers,
    recentActivity,
    activityNotice: insights.activityNotice,
    lastSyncedAt: insights.lastSyncedAt,
  };
}
