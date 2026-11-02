import { listRepositoryIssues, getIssueOrPrDetails } from '../services/githubService.js';

async function test() {
  const issues = await listRepositoryIssues('facebook', 'react', { perPage: 5 });
  console.log('React issues count:', issues.length);
  for (const iss of issues) {
    const details = await getIssueOrPrDetails('facebook', 'react', iss.number);
    console.log(`Issue #${details.number}: [${details.state}] "${details.title}"`);
    console.log(`  Assignee: ${details.assignee || 'none'}`);
    console.log(`  Checklist: ${details.checklistCompleted} / ${details.checklistTotal}`);
    console.log(`  Is PR: ${details.isPullRequest}, Merged: ${details.prMerged}`);
  }
}

test().catch(console.error);

