import express from 'express';
import {
  getGitHubStatus,
  getGitHubOAuthUrl,
  exchangeOAuthCode,
  connectWithToken,
  disconnectGitHubAccount,
  listUserRepositories,
  listRepositoryIssues,
  getIssueOrPrDetails,
  linkTaskToGitHub,
  unlinkTaskFromGitHub,
  syncTaskWithGitHub,
  verifyGitHubAppConnectivity,
  getDeveloperInsights,
  getRecentCommits,
  getRepositoryPullRequests,
  getRepositoryIssues,
  getDeveloperWiseActivity,
  getTeamActivitySummary,
} from '../services/githubService.js';
import {
  getCommitmentExecutionInsights,
  getSingleTaskCommitmentInsight,
} from '../services/commitmentIntelligenceService.js';

const router = express.Router();

/**
 * GET /api/github/commitment-insights
 * Retrieve Commitment vs Execution Intelligence across meeting action items
 */
router.get('/commitment-insights', async (req, res, next) => {
  try {
    const { meetingId, owner, status, userMapping, refresh } = req.query;

    let parsedUserMapping = {};
    if (userMapping) {
      try {
        parsedUserMapping = typeof userMapping === 'string' ? JSON.parse(userMapping) : userMapping;
      } catch (_) {
        parsedUserMapping = {};
      }
    }

    const result = await getCommitmentExecutionInsights({
      meetingId,
      owner,
      status,
      userMapping: parsedUserMapping,
      refresh: refresh === 'true' || refresh === '1',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/github/commitment-insights
 * Retrieve Commitment vs Execution Intelligence with explicit userMapping object payload
 */
router.post('/commitment-insights', async (req, res, next) => {
  try {
    const { meetingId, owner, status, userMapping = {}, refresh = false } = req.body;

    const result = await getCommitmentExecutionInsights({
      meetingId,
      owner,
      status,
      userMapping,
      refresh: Boolean(refresh),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/commitment-insights/:taskId
 * Retrieve Commitment vs Execution Intelligence for a single action item
 */
router.get('/commitment-insights/:taskId', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { mappedUser, refresh } = req.query;

    const result = await getSingleTaskCommitmentInsight(taskId, {
      mappedUser,
      refresh: refresh === 'true' || refresh === '1',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/summary
 * Retrieve overall team activity summary and metrics
 */
router.get('/developer-insights/summary', async (req, res, next) => {
  try {
    const { owner, repo, developer } = req.query;
    const summary = await getTeamActivitySummary({ owner, repo, developer });
    res.json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/commits
 * Retrieve recent commits from the repository with author, message, branch, and date
 */
router.get('/developer-insights/commits', async (req, res, next) => {
  try {
    const { owner, repo, branch, limit, page, author } = req.query;
    const result = await getRecentCommits({ owner, repo, branch, limit, page, author });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/pulls
 * Retrieve pull requests from the repository with author, title, state, and merged status
 */
router.get('/developer-insights/pulls', async (req, res, next) => {
  try {
    const { owner, repo, state, limit, page, author } = req.query;
    const result = await getRepositoryPullRequests({ owner, repo, state, limit, page, author });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/issues
 * Retrieve issues from the repository with assignee, state, creation/update dates
 */
router.get('/developer-insights/issues', async (req, res, next) => {
  try {
    const { owner, repo, state, limit, page, assignee, author } = req.query;
    const result = await getRepositoryIssues({ owner, repo, state, limit, page, assignee, author });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/developers
 * Retrieve developer-wise activity grouped by GitHub username
 */
router.get('/developer-insights/developers', async (req, res, next) => {
  try {
    const { owner, repo, hideBots, developer } = req.query;
    const result = await getDeveloperWiseActivity({
      owner,
      repo,
      hideBots: hideBots === 'true' || hideBots === '1',
      developer,
    });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights/developers/:username
 * Retrieve individual developer activity details
 */
router.get('/developer-insights/developers/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    const { owner, repo } = req.query;
    const result = await getDeveloperWiseActivity({
      owner,
      repo,
      developer: username,
    });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/developer-insights
 * Retrieve Developer Insights overview (aliased to summary)
 */
router.get('/developer-insights', async (req, res, next) => {
  try {
    const { owner, repo, developer } = req.query;
    const insights = await getTeamActivitySummary({ owner, repo, developer });
    res.json({
      success: true,
      data: insights,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/app-verify
 * Test and verify GitHub App configuration and connectivity
 */
router.get('/app-verify', async (req, res, next) => {
  try {
    const result = await verifyGitHubAppConnectivity();
    res.json({
      success: result.success,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/status
 * Get connection status of GitHub integration
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await getGitHubStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/auth-url
 * Get OAuth authorization URL
 */
router.get('/auth-url', async (req, res, next) => {
  try {
    const { state } = req.query;
    const urlInfo = getGitHubOAuthUrl(state);
    res.json({
      success: true,
      data: urlInfo,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/callback
 * Handles OAuth callback from GitHub and redirects to client
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${clientUrl}/settings?github_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`${clientUrl}/settings?github_error=missing_code`);
  }

  try {
    await exchangeOAuthCode(code);
    res.redirect(`${clientUrl}/settings?github=connected`);
  } catch (err) {
    console.error('[GitHub Callback Error]:', err.message);
    res.redirect(`${clientUrl}/settings?github_error=${encodeURIComponent(err.message)}`);
  }
});

/**
 * POST /api/github/connect
 * Secure backend token connection
 */
router.post('/connect', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'GitHub access token is required.' });
    }

    const result = await connectWithToken(token);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/github/disconnect
 * Disconnects GitHub account
 */
router.post('/disconnect', async (req, res, next) => {
  try {
    const result = await disconnectGitHubAccount();
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/repos
 * Lists accessible repositories for connected account
 */
router.get('/repos', async (req, res, next) => {
  try {
    const { perPage } = req.query;
    const repos = await listUserRepositories({ perPage: perPage ? parseInt(perPage, 10) : 50 });
    res.json({
      success: true,
      data: repos,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/repos/:owner/:repo/issues
 * Lists issues and PRs for a specific repo
 */
router.get('/repos/:owner/:repo/issues', async (req, res, next) => {
  try {
    const { owner, repo } = req.params;
    const { state, perPage } = req.query;
    const issues = await listRepositoryIssues(owner, repo, {
      state: state || 'all',
      perPage: perPage ? parseInt(perPage, 10) : 40,
    });
    res.json({
      success: true,
      data: issues,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/repos/:owner/:repo/issues/:number
 * Retrieves single issue/PR live details
 */
router.get('/repos/:owner/:repo/issues/:number', async (req, res, next) => {
  try {
    const { owner, repo, number } = req.params;
    const details = await getIssueOrPrDetails(owner, repo, number);
    res.json({
      success: true,
      data: details,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/github/tasks/:id/link
 * Links an Action Tracker task to a GitHub resource
 */
router.post('/tasks/:id/link', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { repoOwner, repoName, issueNumber, resourceType } = req.body || {};

    const updatedTask = await linkTaskToGitHub(id, {
      repoOwner,
      repoName,
      issueNumber,
      resourceType,
    });

    res.json({
      success: true,
      data: updatedTask,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/github/tasks/:id/unlink
 * Unlinks a GitHub resource from a task
 */
router.post('/tasks/:id/unlink', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedTask = await unlinkTaskFromGitHub(id);
    res.json({
      success: true,
      data: updatedTask,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/github/tasks/:id/sync
 * Re-synchronizes task with live GitHub progress
 */
router.post('/tasks/:id/sync', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedTask = await syncTaskWithGitHub(id);
    res.json({
      success: true,
      data: updatedTask,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

