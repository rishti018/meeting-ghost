import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api/github';

async function runApiTests() {
  console.log('\n======================================================');
  console.log('🐙 TESTING DEVELOPER INSIGHTS API ENDPOINTS (PHASE 1)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failed++;
      throw new Error(message);
    } else {
      console.log(`✅ PASS: ${message}`);
      passed++;
    }
  }

  // -------------------------------------------------------------------
  // TEST 1: Commits Endpoint (/commits)
  // -------------------------------------------------------------------
  console.log('\n--- 1. Testing GET /api/github/developer-insights/commits ---');
  {
    const res = await fetch(`${API_BASE}/developer-insights/commits`);
    assert(res.status === 200, 'Commits endpoint returned HTTP 200');
    const json = await res.json();
    assert(json.success === true, 'Response has success: true');
    assert(json.data && json.data.repository, 'Response has repository metadata');
    assert(Array.isArray(json.data.commits), 'Response has commits array');
    assert(json.data.commits.length > 0, `Found ${json.data.commits.length} commits in connected repository`);

    const firstCommit = json.data.commits[0];
    assert(Boolean(firstCommit.sha && firstCommit.shortSha), 'Commit has sha and shortSha');
    assert(Boolean(firstCommit.message), `Commit has message: "${firstCommit.headline}"`);
    assert(Boolean(firstCommit.date), 'Commit has date');
    assert(Boolean(firstCommit.author && (firstCommit.author.login || firstCommit.author.name)), 'Commit has author information');
    assert(Boolean(firstCommit.htmlUrl), 'Commit has htmlUrl');
    assert(typeof firstCommit.author.isBot === 'boolean', 'Commit has isBot flag');

    // Test pagination limit parameter
    const limitRes = await fetch(`${API_BASE}/developer-insights/commits?limit=1&page=1`);
    assert(limitRes.status === 200, 'Commits endpoint with ?limit=1 returned HTTP 200');
    const limitJson = await limitRes.json();
    assert(limitJson.data.commits.length === 1, 'Paging correctly limits commits to 1 item');
    assert(limitJson.data.pagination.limit === 1, 'Pagination reflects limit=1');
  }

  // -------------------------------------------------------------------
  // TEST 2: Pull Requests Endpoint (/pulls)
  // -------------------------------------------------------------------
  console.log('\n--- 2. Testing GET /api/github/developer-insights/pulls ---');
  {
    const res = await fetch(`${API_BASE}/developer-insights/pulls`);
    assert(res.status === 200, 'Pull requests endpoint returned HTTP 200');
    const json = await res.json();
    assert(json.success === true, 'Response has success: true');
    assert(Array.isArray(json.data.pullRequests), 'Response has pullRequests array');
    assert(typeof json.data.pagination.totalFetched === 'number', 'Response has valid pagination totalFetched');
    console.log(`ℹ️ Repository has ${json.data.pullRequests.length} pull requests (cleanly handled empty/low count state)`);
  }

  // -------------------------------------------------------------------
  // TEST 3: Issues Endpoint (/issues)
  // -------------------------------------------------------------------
  console.log('\n--- 3. Testing GET /api/github/developer-insights/issues ---');
  {
    const res = await fetch(`${API_BASE}/developer-insights/issues`);
    assert(res.status === 200, 'Issues endpoint returned HTTP 200');
    const json = await res.json();
    assert(json.success === true, 'Response has success: true');
    assert(Array.isArray(json.data.issues), 'Response has issues array');
    // Ensure all returned items are true issues, not PRs
    const hasAnyPr = json.data.issues.some(i => Boolean(i.pull_request));
    assert(!hasAnyPr, 'Issues endpoint filters out pull requests cleanly');
    console.log(`ℹ️ Repository has ${json.data.issues.length} issues (cleanly handled empty/low count state)`);
  }

  // -------------------------------------------------------------------
  // TEST 4: Developers Endpoint (/developers & /developers/:username)
  // -------------------------------------------------------------------
  console.log('\n--- 4. Testing GET /api/github/developer-insights/developers ---');
  {
    const res = await fetch(`${API_BASE}/developer-insights/developers`);
    assert(res.status === 200, 'Developers endpoint returned HTTP 200');
    const json = await res.json();
    assert(json.success === true, 'Response has success: true');
    assert(Array.isArray(json.data.developers), 'Response has developers array');
    assert(json.data.developers.length > 0, `Detected ${json.data.developers.length} developer(s) in repository`);

    const dev = json.data.developers[0];
    assert(Boolean(dev.username), `Primary developer username: @${dev.username}`);
    assert(typeof dev.commitCount === 'number', 'Developer has commitCount metric');
    assert(typeof dev.prsOpenedCount === 'number', 'Developer has prsOpenedCount metric');
    assert(typeof dev.issuesCreatedCount === 'number', 'Developer has issuesCreatedCount metric');
    assert(Array.isArray(dev.recentCommits), 'Developer has recentCommits list');
    assert(typeof dev.isBot === 'boolean', 'Developer has bot detection flag');

    // Test specific developer route: /developers/:username
    const singleDevRes = await fetch(`${API_BASE}/developer-insights/developers/${dev.username}`);
    assert(singleDevRes.status === 200, `Single developer endpoint for @${dev.username} returned HTTP 200`);
    const singleDevJson = await singleDevRes.json();
    assert(singleDevJson.data.developer.username.toLowerCase() === dev.username.toLowerCase(), 'Single developer matches requested username');
    assert(singleDevJson.data.found === true, 'Single developer marked as found');
  }

  // -------------------------------------------------------------------
  // TEST 5: Overall Team Activity Summary (/summary & /developer-insights)
  // -------------------------------------------------------------------
  console.log('\n--- 5. Testing GET /api/github/developer-insights/summary ---');
  {
    const res = await fetch(`${API_BASE}/developer-insights/summary`);
    assert(res.status === 200, 'Summary endpoint returned HTTP 200');
    const json = await res.json();
    assert(json.success === true, 'Response has success: true');
    assert(json.data.teamOverview && typeof json.data.teamOverview.totalCommits === 'number', 'Team overview contains totalCommits');
    assert(typeof json.data.teamOverview.pullRequests.total === 'number', 'Team overview contains PR stats');
    assert(typeof json.data.teamOverview.issues.total === 'number', 'Team overview contains issue stats');
    assert(Array.isArray(json.data.recentActivity), 'Response includes recent activity feed');
    assert(Boolean(json.data.activityNotice), 'Notice clarifying raw GitHub activity vs verified task completion is present');

    // Test alias route: GET /api/github/developer-insights
    const aliasRes = await fetch(`${API_BASE}/developer-insights`);
    assert(aliasRes.status === 200, 'Alias route /developer-insights returned HTTP 200');

    // Test developer filter on summary: ?developer=...
    const devFilterRes = await fetch(`${API_BASE}/developer-insights/summary?developer=rishti018`);
    assert(devFilterRes.status === 200, 'Summary with ?developer filter returned HTTP 200');
    const devFilterJson = await devFilterRes.json();
    assert(devFilterJson.data.developerFilter === 'rishti018', 'Summary reflects developerFilter query');
  }

  // -------------------------------------------------------------------
  // TEST 6: Error Handling for Non-Existent Repository
  // -------------------------------------------------------------------
  console.log('\n--- 6. Testing Error Handling for Non-Existent Repository ---');
  {
    const errRes = await fetch(`${API_BASE}/developer-insights/commits?owner=rishti018&repo=nonexistent-repo-9999`);
    assert(errRes.status === 404 || errRes.status === 500, `Non-existent repo cleanly returns HTTP ${errRes.status}`);
    const errJson = await errRes.json();
    assert(Boolean(errJson.error), `Error response contains sanitized message: "${errJson.error}"`);
    console.log('Server remained completely stable and did not crash.');
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL DEVELOPER INSIGHTS API TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
  console.log('======================================================\n');
}

runApiTests().catch(err => {
  console.error('\n❌ API Tests encountered an unhandled error:', err);
  process.exit(1);
});

