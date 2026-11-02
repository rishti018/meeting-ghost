import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Task } from '../models/Task.js';
import { Meeting } from '../models/Meeting.js';
import {
  assessTaskCommitmentVsExecution,
  resolveTaskDeveloperIdentity,
  checkTaskIsOverdue,
  getCommitmentExecutionInsights,
  getSingleTaskCommitmentInsight,
  ASSESSMENT_CODES,
  ASSESSMENT_LABELS,
} from '../services/commitmentIntelligenceService.js';

const API_BASE = 'http://localhost:5000/api/github';

async function runCommitmentIntelligenceTests() {
  console.log('\n======================================================');
  console.log('🧠 TESTING COMMITMENT VS EXECUTION INTELLIGENCE (PHASE 3)');
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

  await connectToDatabase();

  try {
    // -------------------------------------------------------------------
    // 1. Identity Mapping & No Name Guessing
    // -------------------------------------------------------------------
    console.log('\n--- 1. Testing Developer Identity Mapping & Non-Guessing ---');
    {
      // A: Unmapped developer without explicit mapping
      const unmappedTask = { owner: 'Aryan', github: {} };
      const id1 = resolveTaskDeveloperIdentity(unmappedTask, {}, ['rishti018']);
      assert(id1.isMapped === false, 'Do not guess developer identity without explicit mapping');
      assert(id1.mappedGitHubUsername === null, 'Mapped username is null for unmapped owner');
      assert(id1.mappingSource === 'unmapped', 'Mapping source is "unmapped"');

      // B: Explicit userMapping dictionary provided
      const mappedTask = { owner: 'Aryan', github: {} };
      const id2 = resolveTaskDeveloperIdentity(mappedTask, { Aryan: 'aryan-dev' }, ['rishti018']);
      assert(id2.isMapped === true, 'Explicit dictionary mapping resolves correctly');
      assert(id2.mappedGitHubUsername === 'aryan-dev', 'Resolves to explicitly mapped "aryan-dev"');
      assert(id2.mappingSource === 'explicit_mapping', 'Mapping source is "explicit_mapping"');

      // C: Explicit task-level assignee on linked GitHub resource
      const taskWithAssignee = { owner: 'Priya', github: { assignee: 'priyashah-gh' } };
      const id3 = resolveTaskDeveloperIdentity(taskWithAssignee, {}, ['rishti018']);
      assert(id3.isMapped === true, 'Task-level GitHub assignee takes precedence');
      assert(id3.mappedGitHubUsername === 'priyashah-gh', 'Resolves to task.github.assignee');

      // D: Exact literal match to repository contributor
      const directMatchTask = { owner: 'rishti018', github: {} };
      const id4 = resolveTaskDeveloperIdentity(directMatchTask, {}, ['rishti018', 'alice']);
      assert(id4.isMapped === true, 'Direct literal match to repo contributor resolves');
      assert(id4.mappedGitHubUsername === 'rishti018', 'Resolves to literal username');
      assert(id4.mappingSource === 'exact_username_match', 'Mapping source is "exact_username_match"');
    }

    // -------------------------------------------------------------------
    // 2. Overdue Deadline Calculation
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Overdue Deadline Calculation ---');
    {
      const now = new Date('2026-10-31T12:00:00Z');

      // Past date
      const overdueTask = {
        status: 'Pending',
        dueDateTime: new Date('2026-10-30T10:00:00Z'),
        deadline: 'Yesterday',
      };
      assert(checkTaskIsOverdue(overdueTask, now) === true, 'Past dueDateTime correctly evaluated as overdue');

      // Future date
      const futureTask = {
        status: 'Pending',
        dueDateTime: new Date('2026-11-05T10:00:00Z'),
        deadline: 'Nov 5',
      };
      assert(checkTaskIsOverdue(futureTask, now) === false, 'Future dueDateTime evaluated as not overdue');

      // Completed task is never overdue
      const completedTask = {
        status: 'Completed',
        dueDateTime: new Date('2026-10-20T10:00:00Z'),
      };
      assert(checkTaskIsOverdue(completedTask, now) === false, 'Completed task is never evaluated as overdue');
    }

    // -------------------------------------------------------------------
    // 3. Test: Matching Tasks to GitHub Activity
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Matched Execution Activity ---');
    {
      const task = {
        _id: new mongoose.Types.ObjectId(),
        task: 'Implement database schema optimization',
        owner: 'Aryan',
        deadline: 'Tomorrow',
        status: 'In Progress',
        priority: 'High',
        github: {
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          repoFullName: 'rishti018/meeting-ghost',
          issueNumber: 42,
          issueTitle: 'Optimize schema indices',
          issueState: 'open',
          assignee: 'aryan-dev',
        },
      };

      const repositoryCommits = [
        {
          sha: 'abc1234567890',
          shortSha: 'abc1234',
          message: 'Add compound indexes for task queries (#42)',
          headline: 'Add compound indexes for task queries (#42)',
          author: { login: 'aryan-dev', name: 'Aryan Dev' },
          date: new Date().toISOString(),
          htmlUrl: 'https://github.com/rishti018/meeting-ghost/commit/abc1234',
        },
      ];

      const assessment = assessTaskCommitmentVsExecution(task, {
        repositoryCommits,
        repositoryPulls: [],
        userMapping: { Aryan: 'aryan-dev' },
        now: new Date(),
      });

      assert(assessment.assessment.code === ASSESSMENT_CODES.ACTIVITY_DETECTED, 'Assessment code is "activity_detected"');
      assert(assessment.assessment.label === 'Activity detected', 'Assessment label matches requirement');
      assert(assessment.githubEvidence.commits.length === 1, 'Matched 1 relevant commit for issue #42');
      assert(assessment.githubEvidence.commits[0].authorMatchesOwner === true, 'Commit author matches mapped owner');
      assert(assessment.identityMapping.isMapped === true, 'Identity is explicitly mapped');
      assert(assessment.assessment.verificationRequired === false, 'Verification not required for in-progress activity');
    }

    // -------------------------------------------------------------------
    // 4. Test: Missing Evidence
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing Missing Evidence State ---');
    {
      const unlinkedTask = {
        _id: new mongoose.Types.ObjectId(),
        task: 'Draft marketing announcement',
        owner: 'Priya',
        deadline: 'Next Monday',
        dueDateTime: new Date(Date.now() + 86400000 * 5), // 5 days in future
        status: 'Pending',
        github: null,
      };

      const assessment = assessTaskCommitmentVsExecution(unlinkedTask, {
        repositoryCommits: [],
        repositoryPulls: [],
        now: new Date(),
      });

      assert(assessment.assessment.code === ASSESSMENT_CODES.NO_EVIDENCE, 'Assessment code is "no_evidence"');
      assert(assessment.assessment.label === 'No GitHub evidence found', 'Assessment label is "No GitHub evidence found"');
      assert(assessment.githubEvidence.hasEvidence === false, 'hasEvidence flag is false');
      assert(assessment.githubEvidence.evidenceStatus === 'unavailable', 'Evidence status is "unavailable"');
    }

    // -------------------------------------------------------------------
    // 5. Test: Incorrect Identity Mapping (No False Attribution)
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing Incorrect Identity Mapping & No False Attribution ---');
    {
      const task = {
        _id: new mongoose.Types.ObjectId(),
        task: 'Setup CI/CD deployment pipeline',
        owner: 'Aryan', // Meeting owner is Aryan
        deadline: 'Next Week',
        dueDateTime: new Date(Date.now() + 86400000 * 7),
        status: 'Pending',
        github: {
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          repoFullName: 'rishti018/meeting-ghost',
          issueNumber: null,
        },
      };

      // Commits in repo are by rishti018, NOT Aryan
      const repositoryCommits = [
        {
          sha: 'def5678',
          message: 'Update build pipeline configuration',
          headline: 'Update build pipeline configuration',
          author: { login: 'rishti018', name: 'Rishti' },
          date: new Date().toISOString(),
        },
      ];

      // Explicit mapping states Aryan is "aryan-ghost-dev"
      const assessment = assessTaskCommitmentVsExecution(task, {
        repositoryCommits,
        repositoryPulls: [],
        userMapping: { Aryan: 'aryan-ghost-dev' },
        now: new Date(),
      });

      assert(assessment.identityMapping.mappedGitHubUsername === 'aryan-ghost-dev', 'Mapped to expected user "aryan-ghost-dev"');
      assert(assessment.githubEvidence.commits.length === 0, 'Commits by other developers are NOT falsely attributed to Aryan');
      assert(assessment.assessment.code === ASSESSMENT_CODES.NO_EVIDENCE, 'Correctly assesses no evidence for Aryan');
    }

    // -------------------------------------------------------------------
    // 6. Test: Overdue Tasks Without Evidence
    // -------------------------------------------------------------------
    console.log('\n--- 6. Testing Overdue Task Without Evidence ---');
    {
      const overdueTask = {
        _id: new mongoose.Types.ObjectId(),
        task: 'Submit quarterly budget projections',
        owner: 'Rahul',
        deadline: 'Yesterday by 5 PM',
        dueDateTime: new Date(Date.now() - 86400000 * 2), // 2 days in past
        status: 'Pending',
        github: null,
      };

      const assessment = assessTaskCommitmentVsExecution(overdueTask, {
        repositoryCommits: [],
        repositoryPulls: [],
        now: new Date(),
      });

      assert(assessment.commitment.isOverdue === true, 'Task identified as overdue');
      assert(assessment.assessment.code === ASSESSMENT_CODES.OVERDUE_NO_EVIDENCE, 'Assessment code is "overdue_no_evidence"');
      assert(assessment.assessment.label === 'Overdue – no execution evidence', 'Assessment label is "Overdue – no execution evidence"');
    }

    // -------------------------------------------------------------------
    // 7. Test: Merged PRs Awaiting Task Verification (NO Auto-Completion)
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing Merged PRs & No Automatic Task Completion ---');
    {
      // Create a test task in MongoDB to guarantee status immutability check
      const testMeeting = new Meeting({
        title: 'Sprint Commitment Verification Meeting',
        transcript: 'Discussion on PR verification',
        summary: 'Testing merged PR immutability',
      });
      await testMeeting.save();

      const testTask = new Task({
        meetingId: testMeeting._id,
        meetingTitle: testMeeting.title,
        task: 'Implement authentication token refresh',
        owner: 'Aryan',
        deadline: 'Nov 3',
        status: 'Pending', // Must NOT be auto-completed
        github: {
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          repoFullName: 'rishti018/meeting-ghost',
          issueNumber: 101,
          issueTitle: 'Add refresh token endpoint',
          resourceType: 'pull_request',
          isPullRequest: true,
          prMerged: true, // Merged on GitHub
          htmlUrl: 'https://github.com/rishti018/meeting-ghost/pull/101',
          assignee: 'aryan-dev',
        },
      });
      await testTask.save();

      // Assess commitment vs execution
      const assessment = assessTaskCommitmentVsExecution(testTask, {
        repositoryCommits: [],
        repositoryPulls: [
          {
            number: 101,
            title: 'Add refresh token endpoint',
            state: 'closed',
            isMerged: true,
            mergedAt: new Date().toISOString(),
            htmlUrl: 'https://github.com/rishti018/meeting-ghost/pull/101',
          },
        ],
        now: new Date(),
      });

      assert(assessment.assessment.code === ASSESSMENT_CODES.PR_MERGED_UNVERIFIED, 'Assessment code is "pr_merged_unverified"');
      assert(assessment.assessment.label === 'PR merged – awaiting task verification', 'Assessment label is "PR merged – awaiting task verification"');
      assert(assessment.assessment.verificationRequired === true, 'verificationRequired is true');
      assert(assessment.assessment.statusDivergence === true, 'statusDivergence is true (local Pending vs GitHub Merged)');

      // Verify task in database was NOT automatically updated to Completed!
      const reloadedTask = await Task.findById(testTask._id);
      assert(reloadedTask.status === 'Pending', 'CRITICAL RULE: Task status remains "Pending" in MongoDB and was NOT automatically marked Completed');

      // Clean up test records
      await Task.findByIdAndDelete(testTask._id);
      await Meeting.findByIdAndDelete(testMeeting._id);
    }

    // -------------------------------------------------------------------
    // 8. Test: Closed Issue Awaiting Task Verification
    // -------------------------------------------------------------------
    console.log('\n--- 8. Testing Closed Issue Awaiting Verification ---');
    {
      const issueTask = {
        _id: new mongoose.Types.ObjectId(),
        task: 'Resolve SSL certificate expiration issue',
        owner: 'Priya',
        deadline: 'Friday',
        status: 'In Progress',
        github: {
          repoOwner: 'rishti018',
          repoName: 'meeting-ghost',
          issueNumber: 88,
          issueTitle: 'Renew certs',
          issueState: 'closed', // Closed on GitHub
          isPullRequest: false,
          checklistTotal: 2,
          checklistCompleted: 2,
        },
      };

      const assessment = assessTaskCommitmentVsExecution(issueTask, {
        repositoryCommits: [],
        repositoryPulls: [],
        now: new Date(),
      });

      assert(assessment.assessment.code === ASSESSMENT_CODES.ISSUE_CLOSED_UNVERIFIED, 'Assessment code is "issue_closed_unverified"');
      assert(assessment.assessment.label === 'Issue closed – awaiting task verification', 'Assessment label is "Issue closed – awaiting task verification"');
      assert(assessment.assessment.verificationRequired === true, 'verificationRequired is true');
      assert(assessment.assessment.statusDivergence === true, 'statusDivergence is true');
    }

    // -------------------------------------------------------------------
    // 9. Test: HTTP API Endpoints
    // -------------------------------------------------------------------
    console.log('\n--- 9. Testing HTTP API Endpoints ---');
    {
      // A: GET /api/github/commitment-insights
      const getRes = await fetch(`${API_BASE}/commitment-insights`);
      assert(getRes.status === 200, 'GET /api/github/commitment-insights returned HTTP 200');
      const getJson = await getRes.json();
      assert(getJson.success === true, 'GET response has success: true');
      assert(getJson.data && getJson.data.summary, 'GET response contains summary');
      assert(typeof getJson.data.summary.totalTasks === 'number', 'Summary contains totalTasks');
      assert(Array.isArray(getJson.data.tasks), 'GET response contains tasks array');
      assert(Boolean(getJson.data.notice), 'Disclaimer notice present in response');

      // B: POST /api/github/commitment-insights with explicit userMapping
      const postRes = await fetch(`${API_BASE}/commitment-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMapping: { Aryan: 'rishti018', Priya: 'priyashah-dev' },
        }),
      });
      assert(postRes.status === 200, 'POST /api/github/commitment-insights returned HTTP 200');
      const postJson = await postRes.json();
      assert(postJson.success === true, 'POST response has success: true');
      assert(Array.isArray(postJson.data.tasks), 'POST response contains evaluated tasks');

      // C: Error handling - Invalid task ID format
      const errRes = await fetch(`${API_BASE}/commitment-insights/invalid-object-id`);
      assert(errRes.status === 400, 'Invalid task ID format cleanly returns HTTP 400');

      // D: Error handling - Non-existent task ID
      const notFoundRes = await fetch(`${API_BASE}/commitment-insights/507f1f77bcf86cd799439011`);
      assert(notFoundRes.status === 404, 'Non-existent task ID cleanly returns HTTP 404');
    }

    console.log('\n======================================================');
    console.log(`🎉 ALL COMMITMENT INTELLIGENCE TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
    console.log('======================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

runCommitmentIntelligenceTests().catch(err => {
  console.error('\n❌ Commitment Intelligence test failed:', err);
  process.exit(1);
});
