import { connectToDatabase } from '../config/db.js';
import { answerMeetingQuestion } from '../services/qaService.js';

async function runVerification() {
  await connectToDatabase();

  const testCases = [
    {
      name: 'Question 1: Next Review Agreement',
      question: 'What was agreed for the next review?',
      validate: (res) => {
        const hasNov5 = /november 5/i.test(res.answer);
        const hasReview = /review/i.test(res.answer);
        const hasCitation = res.citations && res.citations.length > 0 && /november 5/i.test(res.citations[0].excerpt);
        return hasNov5 && hasReview && hasCitation;
      }
    },
    {
      name: 'Question 2: Tasks assigned to Ananya',
      question: 'What tasks are assigned to Ananya?',
      validate: (res) => {
        const hasAnanya = /ananya/i.test(res.answer);
        const hasDashboardOrUI = /dashboard|ui/i.test(res.answer);
        const hasNov3 = /november 3/i.test(res.answer);
        const hasCitation = res.citations && res.citations.length > 0;
        return hasAnanya && hasDashboardOrUI && hasNov3 && hasCitation;
      }
    },
    {
      name: 'Question 3: Gemini Integration Owner & Deadline',
      question: 'Who is responsible for integrating Gemini, and what is the deadline?',
      validate: (res) => {
        const hasRahul = /rahul/i.test(res.answer);
        const hasNov4 = /november 4/i.test(res.answer);
        const hasCitation = res.citations && res.citations.length > 0 && /rahul/i.test(res.citations[0].excerpt);
        return hasRahul && hasNov4 && hasCitation;
      }
    },
    {
      name: 'Question 4: Database Choice and Rationale',
      question: 'What database did the team choose, and why?',
      validate: (res) => {
        const hasMongo = /mongodb/i.test(res.answer);
        const hasMySQL = /mysql/i.test(res.answer);
        // Should state that rationale was not explicitly stated / provided in the transcript
        const mentionsRationale = /rationale|not explicitly|reason/i.test(res.answer);
        const hasCitation = res.citations && res.citations.length > 0 && /mongodb/i.test(res.citations[0].excerpt);
        return hasMongo && hasMySQL && mentionsRationale && hasCitation;
      }
    }
  ];

  console.log('\n======================================================');
  console.log('🔍 VERIFYING ASK MEETINGS GROUNDED RETRIEVAL & Q&A');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`\n--- [TEST] ${tc.name} ---`);
    console.log(`Query: "${tc.question}"`);

    try {
      const res = await answerMeetingQuestion(tc.question);
      console.log(`\nAnswer:\n${res.answer}`);
      console.log(`\nCitations (${res.citations?.length || 0}):`);
      res.citations.forEach((c, idx) => {
        console.log(` [${idx + 1}] Source: "${c.meetingTitle}" (ID: ${c.meetingId})`);
        console.log(`     Excerpt: "${c.excerpt}"`);
      });

      const ok = tc.validate(res);
      if (ok) {
        console.log(`\n\x1b[32m✔ PASS\x1b[0m: ${tc.name}`);
        passed++;
      } else {
        console.log(`\n\x1b[31m✖ FAIL\x1b[0m: ${tc.name} - Output did not satisfy grounding requirements.`);
        failed++;
      }
    } catch (err) {
      console.error(`\n\x1b[31m✖ ERROR\x1b[0m: ${tc.name} - ${err.message}`);
      failed++;
    }
  }

  console.log('\n======================================================');
  console.log(`Ask Meetings Verification: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch(err => {
  console.error(err);
  process.exit(1);
});

