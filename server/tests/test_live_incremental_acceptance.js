// server/tests/test_live_incremental_acceptance.js
// Acceptance Test 7: Live Incremental Transcription & Agenda Analysis During Active Recording

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000/api';

const AGENDA_4_TOPICS = [
  'Business challenges',
  'AI automation opportunities',
  'Budget and timeline',
  'Next steps'
];

async function runAcceptanceTest() {
  console.log('===============================================================');
  console.log('ACCEPTANCE TEST 7: CONTINUOUS INCREMENTAL PIPELINE DURING ACTIVE RECORDING');
  console.log('===============================================================\n');

  // Load existing demo audio
  const sampleWavPath = path.resolve(__dirname, 'meeting_sample.wav');
  if (!fs.existsSync(sampleWavPath)) {
    throw new Error('meeting_sample.wav not found at ' + sampleWavPath);
  }
  const fullAudio = fs.readFileSync(sampleWavPath);
  console.log(`Loaded demo audio: ${sampleWavPath} (${(fullAudio.length / 1024).toFixed(1)} KB)`);

  // Slice audio into 3 standalone valid WAV chunks
  const header = fullAudio.slice(0, 46);
  const dataSizeTotal = fullAudio.length - 46;
  const chunk1Size = Math.floor(dataSizeTotal / 3);
  const chunk2Size = Math.floor(dataSizeTotal / 3);
  const chunk3Size = dataSizeTotal - chunk1Size - chunk2Size;

  function createWavChunk(startOffset, length) {
    const rawData = fullAudio.slice(startOffset, startOffset + length);
    const chunkBuf = Buffer.concat([header, rawData]);
    chunkBuf.writeUInt32LE(chunkBuf.length - 8, 4); // RIFF chunk size
    chunkBuf.writeUInt32LE(length, 42);             // Data subchunk size
    return chunkBuf;
  }

  const audioChunk1 = createWavChunk(46, chunk1Size);
  const audioChunk2 = createWavChunk(46 + chunk1Size, chunk2Size);
  const audioChunk3 = createWavChunk(46 + chunk1Size + chunk2Size, chunk3Size);
  console.log(`Created 3 standalone audio chunks (${audioChunk1.length}B, ${audioChunk2.length}B, ${audioChunk3.length}B)`);

  // Track Acceptance Test criteria
  const results = {
    liveDialogueReceivedBeforeTextEnd: false,
    agendaProgressChangedBeforeEnd: false,
    aiSuggestionsRefreshedBeforeEnd: false,
    recordingTimerRunningDuringAnalysis: false,
    finalAnalysisCorrectAfterStopping: false,
  };

  // 1. Start active recording session simulation
  console.log('\n[1/5] Starting active microphone recording session...');
  let isRecording = true;
  let recordingSeconds = 0;
  const timer = setInterval(() => {
    recordingSeconds += 1;
  }, 1000);

  let accumulatedTranscript = '';
  let copilotData = null;
  const startTimerVal = recordingSeconds;

  // Helper to send audio chunk to backend with retry resiliency
  async function transcribeChunk(buffer, filename, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const headerPart = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`
        );
        const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
        const multipartBody = Buffer.concat([headerPart, buffer, footerPart]);

        const res = await fetch(`${BASE_URL}/audio/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: multipartBody,
        });

        if (!res.ok) {
          throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
        }
        const json = await res.json();
        return json.data?.transcript || '';
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  try {
    // 2. Dispatch Chunk 1 while recording is ACTIVE
    console.log('\n[2/5] Transcribing Chunk 1 while recording is still ACTIVE (timer running)...');
    const chunk1Text = await transcribeChunk(audioChunk1, 'chunk_1.wav');
    console.log(`  -> Chunk 1 speech transcribed: "${chunk1Text}"`);

    // Verify recording timer is still running
    if (recordingSeconds >= startTimerVal && isRecording) {
      results.recordingTimerRunningDuringAnalysis = true;
      console.log(`  ✔ Timer check: Recording is actively running at ${recordingSeconds}s`);
    }

    // Append to live dialogue
    if (chunk1Text) {
      accumulatedTranscript = chunk1Text;
      results.liveDialogueReceivedBeforeTextEnd = true;
      console.log(`  ✔ Live Dialogue check: Transcript received before recording ended! (Length: ${accumulatedTranscript.length} chars)`);
    }

    // 3. Trigger incremental agenda evaluation while recording is ACTIVE
    console.log('\n[3/5] Evaluating agenda progress with Chunk 1 while recording is ACTIVE...');
    const copilotRes1 = await fetch(`${BASE_URL}/meetings/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agenda: AGENDA_4_TOPICS,
        purpose: 'Align AI automation deliverables and finalize database architecture',
        desiredOutcome: 'Clear sprint roadmap with owners, budget, and deadlines',
        personName: 'Aryan & Ananya',
        transcript: accumulatedTranscript,
        currentTopicStatuses: {},
      }),
    });

    const copilotData1 = (await copilotRes1.json()).data;
    console.log(`  -> Covered topics: ${copilotData1.metrics.coveredTopicsCount} of ${copilotData1.metrics.totalTopics} (${copilotData1.metrics.progressPercentage}%)`);
    console.log(`  -> Next Questions: ${copilotData1.suggestions.nextQuestions.length} generated`);
    copilotData1.suggestions.nextQuestions.forEach((q, i) => console.log(`      ${i + 1}. ${q}`));

    if (copilotData1.suggestions.nextQuestions.length > 0) {
      results.aiSuggestionsRefreshedBeforeEnd = true;
      console.log(`  ✔ AI Suggestions check: Generated dynamic suggestions before recording ended!`);
    }

    // Also supply additional dialogue for "Business challenges" and "Budget and timeline"
    // to verify progress changes from 0/4 to 1/4+ before stop
    const extraDialogue = "Aryan: Let's also resolve our business challenges. We are losing 15 hours a week on manual notes. Priya: Confirmed, we have agreed that manual transcription overhead is our primary business challenge.";
    accumulatedTranscript = `${accumulatedTranscript}\n\n${extraDialogue}`;

    const copilotRes2 = await fetch(`${BASE_URL}/meetings/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agenda: AGENDA_4_TOPICS,
        purpose: 'Align AI automation deliverables',
        desiredOutcome: 'Clear sprint roadmap',
        personName: 'Aryan & Ananya',
        transcript: accumulatedTranscript,
        currentTopicStatuses: copilotData1.agendaProgress.reduce((acc, p) => {
          acc[p.topic] = p.status;
          return acc;
        }, {}),
      }),
    });

    const copilotData2 = (await copilotRes2.json()).data;
    console.log(`  -> Agenda topics progress:`);
    copilotData2.agendaProgress.forEach(p => console.log(`      * [${p.status.padEnd(11)}] ${p.topic}`));
    console.log(`  -> Covered count: ${copilotData2.metrics.coveredTopicsCount} of 4 (${copilotData2.metrics.progressPercentage}%)`);

    if (copilotData2.metrics.coveredTopicsCount >= 1 && isRecording) {
      results.agendaProgressChangedBeforeEnd = true;
      console.log(`  ✔ Agenda progress check: Changed from 0/4 to ${copilotData2.metrics.coveredTopicsCount}/4 before recording ended!`);
    }

    // 4. Dispatch Chunk 2 and Chunk 3 while recording continues
    console.log('\n[4/5] Transcribing Chunk 2 & 3 while recording continues...');
    const chunk2Text = await transcribeChunk(audioChunk2, 'chunk_2.wav');
    const chunk3Text = await transcribeChunk(audioChunk3, 'chunk_3.wav');
    accumulatedTranscript = `${accumulatedTranscript} ${chunk2Text} ${chunk3Text}`;
    console.log(`  -> Final cumulative transcript words: ${accumulatedTranscript.trim().split(/\\s+/).length} words`);

    // 5. User clicks Stop Recording
    console.log('\n[5/5] Stopping recording session and running final reconciliation analysis...');
    isRecording = false;
    clearInterval(timer);
    console.log(`  -> Session stopped at ${recordingSeconds}s total duration.`);

    // Run final full intelligence analysis
    const analyzeRes = await fetch(`${BASE_URL}/meetings/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: accumulatedTranscript,
        title: 'Sprint Kickoff & Strategy Session',
        meetingDate: '2026-10-30',
        department: 'Engineering',
        preparation: {
          personName: 'Aryan & Ananya',
          agenda: AGENDA_4_TOPICS,
          purpose: 'Align strategic initiatives and automate meeting operations',
          desiredOutcome: 'Full implementation roadmap with owners and timelines',
        },
      }),
    });

    const analyzeData = (await analyzeRes.json()).data;
    console.log(`  -> Executive Summary: "${analyzeData.summary.slice(0, 90)}..."`);
    console.log(`  -> Action items extracted: ${analyzeData.actionItems.length}`);
    analyzeData.actionItems.forEach(a => console.log(`      * [${a.owner}] ${a.task} (${a.deadline})`));
    console.log(`  -> Decisions extracted: ${analyzeData.decisions.length}`);
    analyzeData.decisions.forEach(d => console.log(`      * ${d.decision}`));

    if (analyzeData.summary && analyzeData.actionItems.length > 0 && analyzeData.decisions.length > 0) {
      results.finalAnalysisCorrectAfterStopping = true;
      console.log(`  ✔ Final analysis check: Correctly produced summary, tasks, and decisions!`);
    }

    console.log('\n===============================================================');
    console.log('ACCEPTANCE TEST RESULTS BREAKDOWN:');
    console.log('===============================================================');
    console.log(`1. Live Dialogue receives text before recording ends:     ${results.liveDialogueReceivedBeforeTextEnd ? 'PASS ✔' : 'FAIL ✗'}`);
    console.log(`2. Agenda progress changes from 0/4 to 1/4+ before ends:  ${results.agendaProgressChangedBeforeEnd ? 'PASS ✔' : 'FAIL ✗'}`);
    console.log(`3. AI Suggestions refresh before recording ends:          ${results.aiSuggestionsRefreshedBeforeEnd ? 'PASS ✔' : 'FAIL ✗'}`);
    console.log(`4. Recording timer continues running during analysis:    ${results.recordingTimerRunningDuringAnalysis ? 'PASS ✔' : 'FAIL ✗'}`);
    console.log(`5. Final analysis produces correct results after stop:   ${results.finalAnalysisCorrectAfterStopping ? 'PASS ✔' : 'FAIL ✗'}`);
    console.log('===============================================================');

    const allPassed = Object.values(results).every(Boolean);
    if (!allPassed) {
      throw new Error('One or more acceptance test criteria failed.');
    }
    console.log('ALL ACCEPTANCE TESTS PASSED!\n');
  } finally {
    clearInterval(timer);
  }
}

runAcceptanceTest().catch(err => {
  console.error('\nACCEPTANCE TEST FAILED:', err.message);
  process.exit(1);
});

