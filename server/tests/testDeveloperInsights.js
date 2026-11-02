import { getDeveloperInsights } from '../services/githubService.js';

async function runDeveloperInsightsTests() {
  console.log('\n======================================================');
  console.log('🐙 TESTING DEVELOPER INSIGHTS (PHASE 1)');
  console.log('======================================================\n');

  console.log('1. Querying Developer Insights for connected repository...');
  const insights = await getDeveloperInsights('rishti018', 'meeting-ghost');

  // Verify Repository Object
  console.log('\n--- Repository Information ---');
  console.log('FullName:', insights.repository.fullName);
  console.log('Private:', insights.repository.private);
  console.log('Default Branch:', insights.repository.defaultBranch);
  console.log('Html URL:', insights.repository.htmlUrl);

  if (!insights.repository.fullName.includes('meeting-ghost')) {
    throw new Error('Repository full name mismatch');
  }

  // Verify Team Overview
  console.log('\n--- Team Overview Metrics ---');
  console.log('Total Commits:', insights.teamOverview.totalCommits);
  console.log('Pull Requests (Total):', insights.teamOverview.pullRequests.total);
  console.log('Pull Requests (Merged):', insights.teamOverview.pullRequests.merged);
  console.log('Pull Requests (Open):', insights.teamOverview.pullRequests.open);
  console.log('Issues (Total):', insights.teamOverview.issues.total);
  console.log('Issues (Open):', insights.teamOverview.issues.open);
  console.log('Issues (Closed):', insights.teamOverview.issues.closed);
  console.log('Active Developers:', insights.teamOverview.activeDevelopersCount);

  if (typeof insights.teamOverview.totalCommits !== 'number') {
    throw new Error('totalCommits must be a number');
  }

  // Verify Developer Grouping
  console.log('\n--- Developer Grouping ---');
  console.log('Developers detected:', insights.developers.length);
  insights.developers.forEach(dev => {
    console.log(` • @${dev.username} (${dev.displayName}):`);
    console.log(`   - Commits: ${dev.commitCount}`);
    console.log(`   - PRs Opened: ${dev.prsOpenedCount}, Merged: ${dev.prsMergedCount}`);
    console.log(`   - Issues: ${dev.issuesCreatedCount}`);
    console.log(`   - Bot Account: ${dev.isBot}`);
    console.log(`   - Last Active: ${dev.lastActiveDate}`);
  });

  if (!Array.isArray(insights.developers) || insights.developers.length === 0) {
    throw new Error('Expected at least 1 developer for meeting-ghost');
  }

  const primaryDev = insights.developers[0];
  if (!primaryDev.username || typeof primaryDev.commitCount !== 'number') {
    throw new Error('Developer object missing required fields');
  }

  // Verify Activity Feed
  console.log('\n--- Unified Activity Feed ---');
  console.log('Total activity items:', insights.recentActivity.length);
  insights.recentActivity.slice(0, 5).forEach((act, idx) => {
    console.log(` ${idx + 1}. [${act.type.toUpperCase()}] "${act.title}" by @${act.author} (${act.date})`);
  });

  // Verify API endpoint via HTTP
  console.log('\n--- Testing API Route via HTTP GET /api/github/developer-insights ---');
  const res = await fetch('http://localhost:5000/api/github/developer-insights');
  if (!res.ok) {
    throw new Error(`HTTP GET failed with status ${res.status}`);
  }
  const json = await res.json();
  console.log('HTTP Status: 200 OK');
  console.log('Success:', json.success);
  console.log('Notice:', json.data.activityNotice);

  console.log('\n======================================================');
  console.log('🎉 DEVELOPER INSIGHTS TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runDeveloperInsightsTests().catch(err => {
  console.error('\n❌ Developer Insights test failed:', err);
  process.exit(1);
});

