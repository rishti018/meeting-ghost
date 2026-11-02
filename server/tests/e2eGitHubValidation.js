import { getInstallationAccessToken, getInstallationRepositories, verifyGitHubAppConnectivity, generateAppJwt } from '../services/githubAppAuth.js';

async function probe() {
  console.log('--- Probing GitHub App Connectivity & Permissions ---');
  const conn = await verifyGitHubAppConnectivity();
  console.log('Connectivity:', conn);

  const token = await getInstallationAccessToken();
  const repoRes = await fetch('https://api.github.com/repos/rishti018/meeting-ghost', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'MeetingGhost-Platform/1.0',
    }
  });

  const repo = await repoRes.json();
  console.log('Repo Name:', repo.full_name);
  console.log('Permissions granted to token:', repo.permissions);

  const jwt = generateAppJwt();
  const installRes = await fetch('https://api.github.com/app/installations/177022422', {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'MeetingGhost-Platform/1.0',
    }
  });
  const install = await installRes.json();
  console.log('App Installation Permissions:', install.permissions);
}

probe().catch(e => console.error('Probe error:', e));
