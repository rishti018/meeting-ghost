import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config/env.js';

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'MeetingGhost-Platform/1.0';

// In-memory cache for installation access token
let cachedInstallationToken = null;

/**
 * Base64URL encoder conforming to RFC 7515
 */
function base64url(source) {
  const buf = Buffer.isBuffer(source) ? source : Buffer.from(source);
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Mint a short-lived (10-minute) RS256 JSON Web Token (JWT)
 * signed with the GitHub App private key.
 * Private key is read from disk on-demand and NEVER logged or exposed.
 */
export function generateAppJwt() {
  const { appId, privateKeyPath, isConfigured, missingConfig } = config.githubApp;

  if (!isConfigured) {
    throw new Error(`GitHub App is not fully configured. Missing: ${missingConfig.join(', ')}`);
  }

  let privateKeyContent;
  try {
    privateKeyContent = fs.readFileSync(privateKeyPath, 'utf8');
  } catch (err) {
    throw new Error('Unable to read GitHub App private key file from disk.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iat: now - 60, // 60 seconds clock drift buffer
    exp: now + 600, // 10 minutes (maximum allowable by GitHub)
    iss: appId.trim(),
  }));

  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = base64url(signer.sign(privateKeyContent));
    return `${header}.${payload}.${signature}`;
  } catch (err) {
    throw new Error('Failed to sign GitHub App JWT. Please verify the RSA private key format.');
  }
}

/**
 * Request or retrieve a cached Installation Access Token from GitHub
 * Token expires in 1 hour; automatically cached and renewed.
 */
export async function getInstallationAccessToken({ forceRefresh = false } = {}) {
  const { installationId, isConfigured } = config.githubApp;

  if (!isConfigured) {
    throw new Error('GitHub App configuration incomplete. Check GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_PRIVATE_KEY_PATH.');
  }

  // Use cached token if valid for at least 5 more minutes
  if (!forceRefresh && cachedInstallationToken) {
    const timeRemainingMs = cachedInstallationToken.expiresAt.getTime() - Date.now();
    if (timeRemainingMs > 5 * 60 * 1000) {
      return cachedInstallationToken.token;
    }
  }

  const jwt = generateAppJwt();
  const endpoint = `${GITHUB_API_BASE}/app/installations/${encodeURIComponent(installationId.trim())}/access_tokens`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.message || JSON.stringify(errJson);
    } catch (_) {
      errorDetail = await res.text().catch(() => res.statusText);
    }
    throw new Error(`GitHub token exchange failed (${res.status}): ${errorDetail}`);
  }

  const data = await res.json();
  const token = data.token;
  const expiresAt = new Date(data.expires_at || Date.now() + 3600 * 1000);

  // Cache in memory
  cachedInstallationToken = {
    token,
    expiresAt,
  };

  return token;
}

/**
 * Retrieve metadata for the configured GitHub App Installation
 */
export async function getInstallationDetails() {
  const { installationId } = config.githubApp;
  const jwt = generateAppJwt();

  const res = await fetch(`${GITHUB_API_BASE}/app/installations/${encodeURIComponent(installationId.trim())}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${jwt}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to get installation details (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    account: {
      login: data.account?.login || '',
      type: data.account?.type || 'User',
      avatarUrl: data.account?.avatar_url || '',
      htmlUrl: data.account?.html_url || '',
    },
    repositorySelection: data.repository_selection || 'selected',
    permissions: data.permissions || {},
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Retrieve accessible repositories authorized for this GitHub App installation
 */
export async function getInstallationRepositories({ perPage = 100 } = {}) {
  const token = await getInstallationAccessToken();

  const res = await fetch(`${GITHUB_API_BASE}/installation/repositories?per_page=${perPage}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to list installation repositories (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const repositories = (data.repositories || []).map(r => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login || '',
    private: Boolean(r.private),
    htmlUrl: r.html_url,
    description: r.description || '',
    defaultBranch: r.default_branch || 'main',
    openIssuesCount: r.open_issues_count || 0,
    permissions: r.permissions || null,
  }));

  return {
    totalCount: data.total_count ?? repositories.length,
    repositorySelection: data.repository_selection || 'selected',
    repositories,
  };
}

/**
 * End-to-end connectivity verification test
 * Tests App config, RS256 JWT signing, token acquisition, and repository listing
 */
export async function verifyGitHubAppConnectivity() {
  const { appId, installationId, isConfigured, missingConfig } = config.githubApp;

  if (!isConfigured) {
    return {
      success: false,
      error: `GitHub App configuration incomplete. Missing variables: ${missingConfig.join(', ')}`,
      status: 'missing_config',
    };
  }

  try {
    // 1. Verify installation details
    const installDetails = await getInstallationDetails();

    // 2. Verify token acquisition & repository listing
    const repoData = await getInstallationRepositories({ perPage: 25 });

    return {
      success: true,
      appId,
      installationId,
      account: installDetails.account,
      repositorySelection: repoData.repositorySelection,
      repositoryCount: repoData.totalCount,
      repositories: repoData.repositories,
      verifiedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      appId,
      installationId,
      error: err.message,
      status: 'auth_failed',
    };
  }
}

