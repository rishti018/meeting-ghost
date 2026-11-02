import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Task } from '../models/Task.js';
import { Meeting } from '../models/Meeting.js';
import { verifyGitHubAppConnectivity } from '../services/githubAppAuth.js';

const API_BASE = 'http://localhost:5000/api';

async function runRealGitHubE2ETests() {
  console.log('\n================================================================');
  console.log('🚀 PHASE 3 – STEP 3: REAL GITHUB ACTIVITY & END-TO-END VALIDATION');
  console.log('================================================================\n');

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

  await connectToDatabase();

  try {
    // -------------------------------------------------------------------
    // STEP 1: Verify GitHub App Connection & Authorized Repository
    // -------------------------------------------------------------------
    console.log('\n--- 1. Verifying Real GitHub App Connection & Authorized Repo ---');
    {
      const conn = await verifyGitHubAppConnectivity();
      assert(conn.success === true, 'GitHub App connectivity check succeeded');
      assert(Boolean(conn.appId), `GitHub App ID: ${conn.appId}`);
      assert(conn.account?.login === 'rishti018', `Connected to authorized account: ${conn.account?.login}`);
      assert(conn.repositories?.length > 0, `Found ${conn.repositories.length} authorized repository`);
      const targetRepo = conn.repositories[0];
      assert(targetRepo.fullName === 'rishti018/meeting-ghost', `Authorized repo matches: ${targetRepo.fullName}`);
      assert(targetRepo.private === true, 'Target repository is private (protected)');
      console.log(`   Repository ID: ${targetRepo.id}, Default Branch: ${targetRepo.defaultBranch}`);

      // Verify HTTP API status endpoint
      const statusRes = await fetch(`${API_BASE}/github/app-verify`);
      assert(statusRes.status === 200, 'GET /api/github/app-verify returned HTTP 200');
    }

    // -------------------------------------------------------------------
    // STEP 2: Verify Real Repository Telemetry from GitHub API
    // -------------------------------------------------------------------
    console.log('\n--- 2. Verifying Real Repository Commits & Telemetry ---');
    {
      const commitsRes = await fetch(`${API_BASE}/github/developer-insights/commits?owner=rishti018&repo=meeting-ghost`);
      assert(commitsRes.status === 200, 'GET /commits returned HTTP 200');
      const commitsJson = await commitsRes.json();
      assert(commitsJson.success === true, 'Commits response has success: true');
      assert(commitsJson.data.commits.length > 0, `Retrieved ${commitsJson.data.commits.length} real commit(s) from GitHub`);

      const realCommit = commitsJson.data.commits[0];
      assert(Boolean(realCommit.sha && realCommit.shortSha), `Real commit SHA: ${realCommit.shortSha}`);
      assert(Boolean(realCommit.message), `Real commit message: "${realCommit.headline}"`);
      assert(realCommit.author.login === 'rishti018', `Real commit author: @${realCommit.author.login}`);
      console.log(`   Verified real commit on GitHub: ${realCommit.shortSha} ("${realCommit.headline}") by @${realCommit.author.login}`);
    }

    // -------------------------------------------------------------------
    // STEP 3: Link Meeting Ghost Action Item to Real GitHub Repository
    // -------------------------------------------------------------------
    console.log('\n--- 3. Linking Real Meeting Ghost Task to GitHub Repository ---');
    let testMeeting = null;
    let testTask = null;
    {
      testMeeting = new Meeting({
        title: 'Q4 Architectural & GitHub Deliverables Sync',
        date: '2026-10-31',
        department: 'Engineering',
        transcript: 'Aryan committed to delivering the core platform architecture and meeting ghost repository setup.',
        summary: 'Sprint planning and GitHub deliverables sign-off meeting.',
      });
      await testMeeting.save();

      testTask = new Task({
        meetingId: testMeeting._id,
        meetingTitle: testMeeting.title,
        task: 'Deliver Meeting Ghost initial platform repository and core setup',
        owner: 'Aryan',
        deadline: 'Nov 5, 2026',
        priority: 'High',
        status: 'Pending',
      });
      await testTask.save();

      // Link to real repository rishti018/meeting-ghost
      const linkRes = await fetch(`${API_BASE}/github/tasks/${testTask._id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          resourceType: 'repository',
        }),
      });

      assert(linkRes.status === 200, 'Task linked to real GitHub repo via POST /api/github/tasks/:id/link');
      const linkJson = await linkRes.json();
      assert(linkJson.data.github.syncStatus === 'synced', 'GitHub resource syncStatus is "synced"');
      assert(linkJson.data.github.repoFullName === 'rishti018/meeting-ghost', 'Task persisted with repoFullName "rishti018/meeting-ghost"');
    }

    // -------------------------------------------------------------------
    // STEP 4: Test Explicit Developer Mapping vs Real GitHub Telemetry
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing Explicit Developer Mapping Against Real GitHub Activity ---');
    {
      // Explicit mapping: Aryan (Meeting Owner) -> rishti018 (GitHub username who authored real commits)
      const insightsRes = await fetch(`${API_BASE}/github/commitment-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: testMeeting._id.toString(),
          userMapping: { Aryan: 'rishti018' },
        }),
      });

      assert(insightsRes.status === 200, 'POST /api/github/commitment-insights returned HTTP 200');
      const insightsJson = await insightsRes.json();
      const taskInsight = insightsJson.data.tasks.find(t => t.commitment.taskId === testTask._id.toString());
      assert(Boolean(taskInsight), 'Found evaluated test task in commitment insights');

      assert(taskInsight.identityMapping.isMapped === true, 'Identity is explicitly mapped');
      assert(taskInsight.identityMapping.mappedGitHubUsername === 'rishti018', 'Mapped username is "rishti018"');
      assert(taskInsight.identityMapping.mappingSource === 'explicit_mapping', 'Mapping source is "explicit_mapping"');
      assert(taskInsight.githubEvidence.commits.length > 0, `Matched ${taskInsight.githubEvidence.commits.length} real commit(s) from GitHub`);
      assert(taskInsight.githubEvidence.commits[0].authorMatchesOwner === true, 'Commit author matches explicitly mapped owner');
      assert(taskInsight.assessment.code === 'activity_detected', 'Assessment changed to "activity_detected" based on real GitHub commit');
      assert(taskInsight.assessment.label === 'Activity detected', 'Assessment label is "Activity detected"');
      console.log(`   Commitment vs Execution matched: Real commit "${taskInsight.githubEvidence.commits[0].headline}" attributed to @rishti018`);
    }

    // -------------------------------------------------------------------
    // STEP 5: Verify Unmapped Owner is NEVER Credited for Other's Commits
    // -------------------------------------------------------------------
    console.log('\n--- 5. Verifying Unmapped Owner is NOT Credited for Real Commits ---');
    {
      // Query without mapping for Aryan, or with Priya (who has not committed)
      const unmappedRes = await fetch(`${API_BASE}/github/commitment-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: testMeeting._id.toString(),
          userMapping: {}, // No mapping provided
        }),
      });

      const unmappedJson = await unmappedRes.json();
      const taskInsight = unmappedJson.data.tasks.find(t => t.commitment.taskId === testTask._id.toString());

      assert(taskInsight.identityMapping.isMapped === false, 'Owner is unmapped');
      assert(taskInsight.identityMapping.mappedGitHubUsername === null, 'Mapped username is null');
      assert(taskInsight.githubEvidence.commits.length === 0, 'ZERO commits attributed: rishti018 commits are NOT credited to unmapped Aryan');
      assert(taskInsight.assessment.code === 'no_evidence', 'Assessment correctly reflects "no_evidence" without name guessing');
    }

    // -------------------------------------------------------------------
    // STEP 6: Confirm Merged PR / Closed Issue NEVER Auto-Completes Task
    // -------------------------------------------------------------------
    console.log('\n--- 6. Confirming Merged PR NEVER Auto-Completes Meeting Task ---');
    let prTask = null;
    {
      prTask = new Task({
        meetingId: testMeeting._id,
        meetingTitle: testMeeting.title,
        task: 'Implement JWT refresh token rotation mechanism',
        owner: 'Aryan',
        deadline: 'Nov 1, 2026',
        priority: 'High',
        status: 'Pending', // Must remain Pending
        github: {
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          repoFullName: 'rishti018/meeting-ghost',
          issueNumber: 99,
          issueTitle: 'JWT refresh token rotation',
          resourceType: 'pull_request',
          isPullRequest: true,
          prMerged: true, // Merged on GitHub
          htmlUrl: 'https://github.com/rishti018/meeting-ghost/pull/99',
        },
      });
      await prTask.save();

      const prInsightRes = await fetch(`${API_BASE}/github/commitment-insights/${prTask._id}`);
      assert(prInsightRes.status === 200, 'GET /commitment-insights/:id returned HTTP 200');
      const prInsightJson = await prInsightRes.json();

      assert(prInsightJson.data.assessment.code === 'pr_merged_unverified', 'Assessment is "pr_merged_unverified"');
      assert(prInsightJson.data.assessment.label === 'PR merged – awaiting task verification', 'Assessment label matches exact requirement');
      assert(prInsightJson.data.assessment.verificationRequired === true, 'verificationRequired is true');
      assert(prInsightJson.data.assessment.statusDivergence === true, 'statusDivergence is true (local Pending vs GitHub Merged)');

      // Verify MongoDB task status was NOT automatically changed
      const dbTask = await Task.findById(prTask._id);
      assert(dbTask.status === 'Pending', 'CRITICAL GUARANTEE: Task status remains "Pending" in MongoDB and was NOT automatically marked Completed');
    }

    // -------------------------------------------------------------------
    // STEP 7: Test Overdue Tasks Without Evidence
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing Overdue Tasks Without Evidence ---');
    let overdueTask = null;
    {
      overdueTask = new Task({
        meetingId: testMeeting._id,
        meetingTitle: testMeeting.title,
        task: 'Submit quarterly vendor software audit',
        owner: 'Rahul',
        deadline: 'Yesterday',
        dueDateTime: new Date(Date.now() - 86400000 * 3), // 3 days ago
        priority: 'Medium',
        status: 'Pending',
        github: null,
      });
      await overdueTask.save();

      const overdueRes = await fetch(`${API_BASE}/github/commitment-insights/${overdueTask._id}`);
      assert(overdueRes.status === 200, 'GET /commitment-insights/:id for overdue task returned HTTP 200');
      const overdueJson = await overdueRes.json();

      assert(overdueJson.data.commitment.isOverdue === true, 'Task identified as overdue');
      assert(overdueJson.data.assessment.code === 'overdue_no_evidence', 'Assessment is "overdue_no_evidence"');
      assert(overdueJson.data.assessment.label === 'Overdue – no execution evidence', 'Assessment label is "Overdue – no execution evidence"');
    }

    // -------------------------------------------------------------------
    // STEP 8: Test GitHub API Error Handling & Edge Cases
    // -------------------------------------------------------------------
    console.log('\n--- 8. Testing GitHub API Error Handling & Non-Existent Repos ---');
    {
      const errRes = await fetch(`${API_BASE}/github/developer-insights/commits?owner=rishti018&repo=nonexistent-repo-9999`);
      assert(errRes.status === 404, 'Non-existent repository returns HTTP 404 cleanly');
      const errJson = await errRes.json();
      assert(Boolean(errJson.error), 'Clean error message returned without crashing server');

      const badIdRes = await fetch(`${API_BASE}/github/commitment-insights/invalid-object-id`);
      assert(badIdRes.status === 400, 'Malformed task ID returns HTTP 400 cleanly');
    }

    // Clean up created test tasks
    if (testTask) await Task.findByIdAndDelete(testTask._id);
    if (prTask) await Task.findByIdAndDelete(prTask._id);
    if (overdueTask) await Task.findByIdAndDelete(overdueTask._id);
    if (testMeeting) await Meeting.findByIdAndDelete(testMeeting._id);

    console.log('\n================================================================');
    console.log(`🎉 ALL REAL GITHUB E2E TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
    console.log('================================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

runRealGitHubE2ETests().catch(err => {
  console.error('\n❌ Real GitHub E2E Test failed:', err);
  process.exit(1);
});

