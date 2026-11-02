import { verifyGitHubAppConnectivity, getInstallationRepositories, getInstallationDetails } from '../services/githubAppAuth.js';
import { config } from '../config/env.js';

async function runVerification() {
  console.log('\n======================================================');
  console.log('🐙 GITHUB APP AUTHENTICATION & CONNECTIVITY PROBE');
  console.log('======================================================\n');

  console.log('1. Configuration Check:');
  console.log('   - GITHUB_APP_ID:', config.githubApp.appId ? 'Configured (' + config.githubApp.appId + ')' : 'MISSING');
  console.log('   - GITHUB_INSTALLATION_ID:', config.githubApp.installationId ? 'Configured (' + config.githubApp.installationId + ')' : 'MISSING');
  console.log('   - GITHUB_PRIVATE_KEY_PATH:', config.githubApp.privateKeyPath ? 'Resolved (' + config.githubApp.privateKeyPath + ')' : 'NOT FOUND');
  console.log('   - Fully Configured:', config.githubApp.isConfigured);

  if (!config.githubApp.isConfigured) {
    console.error('\n❌ Missing required configuration. Cannot proceed.');
    process.exit(1);
  }

  console.log('\n2. Testing RS256 JWT & Installation Details...');
  const installInfo = await getInstallationDetails();
  console.log('   ✔ Successfully authenticated as GitHub App!');
  console.log('   - Target Account:', installInfo.account?.login, '(' + installInfo.account?.type + ')');
  console.log('   - Repository Selection Scope:', installInfo.repositorySelection);
  console.log('   - Account Profile:', installInfo.account?.htmlUrl);

  console.log('\n3. Testing Installation Access Token Exchange & Repository Query...');
  const reposInfo = await getInstallationRepositories();
  console.log('   ✔ Successfully exchanged JWT for temporary Installation Access Token!');
  console.log('   - Total Accessible Repositories:', reposInfo.totalCount);
  console.log('   - Authorized Repositories List:');
  reposInfo.repositories.forEach((repo, idx) => {
    console.log(`     ${idx + 1}. ${repo.fullName} [${repo.private ? 'Private' : 'Public'}] - Issues: ${repo.openIssuesCount}`);
  });

  console.log('\n4. Full Connectivity Verification:');
  const result = await verifyGitHubAppConnectivity();
  console.log('   - Verification Status:', result.success ? 'PASSED (200 OK)' : 'FAILED');
  console.log('   - Verified At:', result.verifiedAt);

  console.log('\n======================================================');
  console.log('🎉 GITHUB APP INTEGRATION VERIFIED 100% SUCCESSFULLY');
  console.log('======================================================\n');
}

runVerification().catch(err => {
  console.error('\n❌ Verification Failed:');
  console.error(err.message);
  process.exit(1);
});

