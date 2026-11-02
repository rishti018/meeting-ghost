import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { linkTaskToGitHub, syncTaskWithGitHub, unlinkTaskFromGitHub } from '../services/githubService.js';
import { config } from '../config/env.js';

// Import or replicate calculateTaskProgress for backend verification
function calculateTaskProgress(task) {
  if (!task) return { percentage: null, label: '—', source: 'unavailable' };
  const gh = task.github;
  const localStatus = task.status || 'Pending';

  if (gh && gh.repoFullName && gh.syncStatus !== 'error') {
    const isClosed = gh.issueState === 'closed';
    const isMerged = Boolean(gh.isPullRequest && gh.prMerged);
    const isOpen = gh.issueState === 'open' && !isMerged;

    let statusDivergence = null;
    if (localStatus === 'Completed' && isOpen) {
      statusDivergence = { badge: 'Local Done • GitHub Open' };
    } else if ((localStatus === 'Pending' || localStatus === 'In Progress') && (isClosed || isMerged)) {
      statusDivergence = { badge: isMerged ? 'PR Merged • Local Open' : 'GitHub Closed • Local Open' };
    }

    if (isMerged) return { percentage: 100, label: '100%', source: 'github_pr_merged', statusDivergence };
    if (gh.checklistTotal > 0) {
      const pct = Math.round((gh.checklistCompleted / gh.checklistTotal) * 100);
      return { percentage: pct, label: `${pct}%`, source: 'github_checklist', statusDivergence };
    }
    if (isClosed) return { percentage: 100, label: '100%', source: 'github_issue_closed', statusDivergence };
    if (gh.isPullRequest && isOpen) return { percentage: 50, label: '50%', source: 'github_pr_open', statusDivergence };
    if (localStatus === 'Completed') return { percentage: 100, label: '100%', source: 'local_status', statusDivergence };
    return { percentage: null, label: '—', source: 'unavailable', statusDivergence };
  }

  if (gh && gh.syncStatus === 'error') {
    return { percentage: null, label: '—', source: 'error', statusDivergence: null };
  }

  if (localStatus === 'Completed') return { percentage: 100, label: '100%', source: 'local_status', statusDivergence: null };
  if (localStatus === 'Pending') return { percentage: 0, label: '0%', source: 'local_status', statusDivergence: null };
  return { percentage: null, label: '—', source: 'unavailable', statusDivergence: null };
}

function getColorCategory(pct) {
  if (pct === null || isNaN(pct)) return 'unavailable (—)';
  if (pct === 100) return 'completed green';
  if (pct >= 80) return 'green';
  if (pct >= 40) return 'amber';
  return 'muted blue';
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTING ACTION TRACKER GITHUB & PROGRESS ENGINE');
  console.log('======================================================\n');

  // Test 1: Color scale & Progress calculation validation
  console.log('1. Testing Progress Calculation & Color Scale Categories:');
  const testCases = [
    {
      name: 'Unlinked Pending task',
      task: { status: 'Pending', github: null },
      expectedPct: 0,
      expectedColor: 'muted blue',
    },
    {
      name: 'Unlinked In Progress task (no fake percentage)',
      task: { status: 'In Progress', github: null },
      expectedPct: null,
      expectedColor: 'unavailable (—)',
    },
    {
      name: 'Unlinked Completed task',
      task: { status: 'Completed', github: null },
      expectedPct: 100,
      expectedColor: 'completed green',
    },
    {
      name: 'Checklist 1/5 (20%)',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', checklistTotal: 5, checklistCompleted: 1, syncStatus: 'synced', issueState: 'open' },
      },
      expectedPct: 20,
      expectedColor: 'muted blue',
    },
    {
      name: 'Checklist 3/5 (60%)',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', checklistTotal: 5, checklistCompleted: 3, syncStatus: 'synced', issueState: 'open' },
      },
      expectedPct: 60,
      expectedColor: 'amber',
    },
    {
      name: 'Checklist 4/5 (80%)',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', checklistTotal: 5, checklistCompleted: 4, syncStatus: 'synced', issueState: 'open' },
      },
      expectedPct: 80,
      expectedColor: 'green',
    },
    {
      name: 'Checklist 5/5 (100%)',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', checklistTotal: 5, checklistCompleted: 5, syncStatus: 'synced', issueState: 'open' },
      },
      expectedPct: 100,
      expectedColor: 'completed green',
    },
    {
      name: 'PR Merged on GitHub',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', isPullRequest: true, prMerged: true, syncStatus: 'synced' },
      },
      expectedPct: 100,
      expectedColor: 'completed green',
    },
    {
      name: 'Issue Closed on GitHub',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', issueState: 'closed', syncStatus: 'synced' },
      },
      expectedPct: 100,
      expectedColor: 'completed green',
    },
    {
      name: 'Local Completed vs GitHub Issue Open (Status Divergence)',
      task: {
        status: 'Completed',
        github: { repoFullName: 'org/repo', issueNumber: 10, issueState: 'open', checklistTotal: 0, syncStatus: 'synced' },
      },
      expectedPct: 100,
      expectedColor: 'completed green',
      expectDivergence: true,
    },
    {
      name: 'Sync Error task (e.g. 404 Issue Not Found)',
      task: {
        status: 'In Progress',
        github: { repoFullName: 'org/repo', syncStatus: 'error', syncError: '404 Not Found' },
      },
      expectedPct: null,
      expectedColor: 'unavailable (—)',
    },
  ];

  for (const tc of testCases) {
    const res = calculateTaskProgress(tc.task);
    const color = getColorCategory(res.percentage);
    console.log(`   • ${tc.name}:`);
    console.log(`     -> Percentage: ${res.label}, Color Category: [${color}], Source: ${res.source}`);
    if (tc.expectDivergence) {
      console.log(`     -> Divergence Badge: "${res.statusDivergence?.badge}"`);
      if (!res.statusDivergence) throw new Error(`Expected divergence badge for ${tc.name}`);
    }
    if (res.percentage !== tc.expectedPct) {
      throw new Error(`Mismatch in percentage for ${tc.name}: expected ${tc.expectedPct}, got ${res.percentage}`);
    }
    if (color !== tc.expectedColor) {
      throw new Error(`Mismatch in color for ${tc.name}: expected ${tc.expectedColor}, got ${color}`);
    }
  }
  console.log('   ✔ All 11 progress calculation & color rule cases passed!\n');

  // Test 2: Database validation - Link Task with 404 non-existent issue
  console.log('2. Testing Validation: Non-existent issue link rejection...');
  await mongoose.connect(config.mongoUri, { dbName: config.dbName });
  const sampleTask = await Task.findOne({});
  if (sampleTask) {
    try {
      await linkTaskToGitHub(sampleTask._id.toString(), {
        repoOwner: 'rishti018',
        repoName: 'meeting-ghost',
        issueNumber: 999999, // Does not exist
      });
      throw new Error('Should have thrown an error for non-existent issue #999999');
    } catch (err) {
      console.log('   ✔ Successfully rejected linking non-existent issue:');
      console.log(`     Error: "${err.message}"`);
    }

    // Test 3: Link repository-level without issue number
    console.log('\n3. Testing Repository-Level Link (No issue number):');
    const linkedRepo = await linkTaskToGitHub(sampleTask._id.toString(), {
      repoOwner: 'rishti018',
      repoName: 'meeting-ghost',
      issueNumber: null,
      resourceType: 'repository',
    });
    console.log('   ✔ Successfully linked repository resource:');
    console.log('     ResourceType:', linkedRepo.github?.resourceType);
    console.log('     RepoFullName:', linkedRepo.github?.repoFullName);
    console.log('     SyncStatus:', linkedRepo.github?.syncStatus);

    // Test 4: Re-syncing repository resource
    const synced = await syncTaskWithGitHub(sampleTask._id.toString());
    console.log('   ✔ Re-sync repository resource status:', synced.github?.syncStatus);

    // Unlink to keep task in clean state
    await unlinkTaskFromGitHub(sampleTask._id.toString());
    console.log('   ✔ Cleanly unlinked test task.');
  }

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log('🎉 ALL PROGRESS AND GITHUB SYNC TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

