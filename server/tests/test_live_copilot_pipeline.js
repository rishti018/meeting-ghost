// server/tests/test_live_copilot_pipeline.js
// Automated verification of Live AI Co-Pilot 4-topic progression

const BASE_URL = 'http://localhost:5000/api';

const AGENDA = [
  'Business challenges',
  'AI automation opportunities',
  'Budget and timeline',
  'Next steps'
];

const STEPS = [
  {
    step: 1,
    name: 'Business challenges',
    text: "Aryan: Let's discuss our business challenges. Today our team is losing roughly 15 to 20 hours every week manually transcribing client calls and drafting meeting summaries in spreadsheets.\nPriya: Agreed. We have documented this and confirmed that manual transcription overhead is our primary business challenge.",
    expectedDiscussed: ['Business challenges']
  },
  {
    step: 2,
    name: 'AI automation opportunities',
    text: "Priya: Looking at our AI automation opportunities, we have agreed to adopt an automated speech-to-text pipeline with Gemini to transcribe conversations incrementally and maintain a live action tracker.\nAryan: Perfect, the team agrees and we have settled on this AI automation opportunity.",
    expectedDiscussed: ['Business challenges', 'AI automation opportunities']
  },
  {
    step: 3,
    name: 'Budget and timeline',
    text: "Rahul: Regarding budget and timeline, management has approved our budget allocation of $25,000 and locked in our 4-week delivery timeline for Phase 1.\nPriya: That is confirmed. The budget and timeline are fully aligned and approved.",
    expectedDiscussed: ['Business challenges', 'AI automation opportunities', 'Budget and timeline']
  },
  {
    step: 4,
    name: 'Next steps',
    text: "Aryan: For next steps, Rahul will finalize the MongoDB Atlas schemas by Wednesday, Priya will review the API specifications by Friday, and we will hold our integration test next Monday.\nRahul: Confirmed, all next steps, deadlines, and deliverables are committed.",
    expectedDiscussed: ['Business challenges', 'AI automation opportunities', 'Budget and timeline', 'Next steps']
  }
];

async function runPipelineTest() {
  console.log('====================================================');
  console.log('LIVE AI CO-PILOT 4-TOPIC PROGRESSION TEST');
  console.log('Agenda:', AGENDA);
  console.log('====================================================\n');

  let accumulatedTranscript = '';
  let currentTopicStatuses = {};

  for (const item of STEPS) {
    accumulatedTranscript = accumulatedTranscript
      ? `${accumulatedTranscript}\n\n${item.text}`
      : item.text;

    console.log(`--- [STEP ${item.step}]: Adding dialogue for "${item.name}" ---`);

    const payload = {
      agenda: AGENDA,
      purpose: 'Align strategic initiatives and automate meeting operations',
      desiredOutcome: 'Full implementation roadmap with owners and timelines',
      personName: 'Aryan & Priya',
      transcript: accumulatedTranscript,
      currentTopicStatuses,
    };

    const res = await fetch(`${BASE_URL}/meetings/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Step ${item.step} failed (${res.status}): ${err}`);
    }

    const json = await res.json();
    const data = json.data;

    console.log(`\nResponse Data for Step ${item.step}:`);
    console.log(`- Covered Topics: ${data.metrics.coveredTopicsCount} of ${data.metrics.totalTopics} (${data.metrics.progressPercentage}%)`);
    console.log(`- Topics Left: ${data.metrics.topicsLeftCount}`);
    
    console.log('- Agenda Progress:');
    data.agendaProgress.forEach(p => {
      console.log(`   * [${p.status.padEnd(11)}] ${p.topic}`);
      currentTopicStatuses[p.topic] = p.status;
    });

    console.log('- Next Questions:');
    data.suggestions.nextQuestions.forEach((q, i) => {
      console.log(`   ${i + 1}. ${q}`);
    });

    console.log('- Strategic Talking Points:');
    data.suggestions.talkingPoints.forEach((tp, i) => {
      console.log(`   - ${tp}`);
    });

    // Verification asserts
    for (const exp of item.expectedDiscussed) {
      const topicProgress = data.agendaProgress.find(p => p.topic.toLowerCase() === exp.toLowerCase());
      if (!topicProgress || topicProgress.status !== 'Discussed') {
        throw new Error(`FAIL: Expected topic "${exp}" to be Discussed in step ${item.step}, but got status "${topicProgress?.status}"`);
      }
    }

    if (data.metrics.coveredTopicsCount < item.expectedDiscussed.length) {
      throw new Error(`FAIL: Step ${item.step} covered count ${data.metrics.coveredTopicsCount} < expected ${item.expectedDiscussed.length}`);
    }

    console.log(`\n>>> STEP ${item.step} VERIFIED: ${data.metrics.coveredTopicsCount} of 4 Discussed (${data.metrics.progressPercentage}%) <<<\n`);
  }

  console.log('====================================================');
  console.log('ALL 4 STEPS PASSED: 0/4 -> 1/4 -> 2/4 -> 3/4 -> 4/4');
  console.log('Discussed status preserved throughout pipeline!');
  console.log('====================================================');
}

runPipelineTest().catch(err => {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
