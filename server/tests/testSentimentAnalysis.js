import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Meeting } from '../models/Meeting.js';
import {
  extractSentimentWithRuleFallback,
  sanitizeSentimentOutput,
  analyzeSpeakerSentiment,
  analyzeAndSaveMeetingSentiment,
  getMeetingSentiment,
} from '../services/sentimentService.js';

const API_BASE = 'http://localhost:5000/api/meetings';

async function runSentimentAnalysisTests() {
  console.log('\n======================================================');
  console.log('❤️  TESTING SPEAKER SENTIMENT & EMOTION-AWARE INTELLIGENCE');
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

  let testMeetingId = null;

  try {
    // -------------------------------------------------------------------
    // 1. Speaker-wise Sentiment & Emotional Signal Detection (Rule Fallback)
    // -------------------------------------------------------------------
    console.log('\n--- 1. Testing Speaker Sentiment & Emotional Signal Recognition ---');

    const multiSpeakerTranscript = `
[00:00] Alice: Welcome everyone. I am really excited about our release progress! The team has done an awesome job.
[00:30] Bob: Thanks Alice. I am confident that the core API is definitely on track for Friday.
[01:00] Charlie: I am not sure about the database migration though. I am wondering if we might hit connection pool limits.
[01:45] Dana: Honestly, I am frustrated that the staging cluster is blocked again. We're still waiting for devops approval.
[02:15] Bob: I'm concerned about the data privacy risk if we bypass that approval step.
[02:45] Alice: I disagree with bypassing security checks. We should follow protocol instead.
[03:15] Charlie: That makes sense. Let's agree to schedule a quick sync with DevOps at 2 PM.
[03:45] Dana: Sounds good. We are aligned on that.
`;

    const sentimentResult = extractSentimentWithRuleFallback({
      transcript: multiSpeakerTranscript,
      title: 'Sprint Retrospective & Release Sync',
    });

    assert(sentimentResult !== null, 'Sentiment extraction returns a structured object');
    assert(typeof sentimentResult.conversationalTone === 'string', 'Conversational tone is a descriptive string');
    assert(['Positive', 'Neutral', 'Negative', 'Mixed'].includes(sentimentResult.overallSentiment), 'Overall sentiment has valid enum label');

    // Check Sentiment Distribution
    const dist = sentimentResult.distribution;
    assert(dist && typeof dist === 'object', 'Distribution is present');
    assert(typeof dist.positive === 'number' && typeof dist.negative === 'number', 'Distribution contains positive and negative numeric percentages');
    assert(dist.positive + dist.neutral + dist.negative + dist.mixed === 100, `Distribution percentages sum to 100% (Sum: ${dist.positive + dist.neutral + dist.negative + dist.mixed}%)`);

    // Check Multi-speaker Recognition
    const speakerNames = sentimentResult.speakers.map(s => s.speaker);
    assert(speakerNames.includes('Alice'), 'Recognized speaker Alice');
    assert(speakerNames.includes('Bob'), 'Recognized speaker Bob');
    assert(speakerNames.includes('Charlie'), 'Recognized speaker Charlie');
    assert(speakerNames.includes('Dana'), 'Recognized speaker Dana');

    // Check Individual Emotional Signals
    const aliceObs = sentimentResult.observations.filter(o => o.speaker === 'Alice');
    assert(aliceObs.some(o => o.emotionalSignal === 'Enthusiasm' || o.sentiment === 'Positive'), 'Detected Enthusiasm / Positive sentiment for Alice');

    const bobObs = sentimentResult.observations.filter(o => o.speaker === 'Bob');
    assert(bobObs.some(o => o.emotionalSignal === 'Confidence' || o.emotionalSignal === 'Concern'), 'Detected Confidence / Concern for Bob');

    const charlieObs = sentimentResult.observations.filter(o => o.speaker === 'Charlie');
    assert(charlieObs.some(o => o.emotionalSignal === 'Uncertainty'), 'Detected Uncertainty for Charlie');

    const danaObs = sentimentResult.observations.filter(o => o.speaker === 'Dana');
    assert(danaObs.some(o => o.emotionalSignal === 'Frustration'), 'Detected Frustration for Dana');

    const disagreementObs = sentimentResult.observations.filter(o => o.emotionalSignal === 'Disagreement');
    assert(disagreementObs.length > 0, 'Detected Disagreement signal in conversation');

    // -------------------------------------------------------------------
    // 2. Missing Speaker Identity Graceful Handling
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Missing Speaker Identity Graceful Handling ---');

    const untaggedTranscript = `
Everything is proceeding according to our timeline.
We are confident that the deliverables will be met without issues.
However, there is some uncertainty regarding the cloud provider rates.
`;

    const untaggedResult = extractSentimentWithRuleFallback({
      transcript: untaggedTranscript,
      title: 'Untagged Meeting Dialogue',
    });

    assert(untaggedResult.speakers.some(s => s.speaker === 'Unknown Speaker'), 'Gracefully handles missing speaker identity as "Unknown Speaker"');
    assert(untaggedResult.observations.every(o => o.speaker.length > 0), 'Every observation has a non-empty speaker label');

    // -------------------------------------------------------------------
    // 3. Grounded Evidence & Transcript Quote Verification
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Evidence Grounding & Non-Hallucination ---');

    sentimentResult.observations.forEach(o => {
      assert(Boolean(o.quote && o.quote.trim().length > 0), `Observation for ${o.speaker} contains grounded quote`);
      assert(Boolean(o.explanation && o.explanation.trim().length > 0), `Observation has contextual explanation`);
      assert(['High', 'Medium', 'Low', 'Unknown'].includes(o.confidence), `Confidence level is valid enum: ${o.confidence}`);
      assert(Boolean(o.segment && o.segment.trim().length > 0), `Segment reference is present: ${o.segment}`);
    });

    // Check Key Moments
    assert(sentimentResult.keyMoments.length > 0, 'Key moments captured from dialogue');
    sentimentResult.keyMoments.forEach(km => {
      assert(['Agreement', 'Concern', 'Uncertainty', 'Disagreement'].includes(km.type), `Key moment type is valid: ${km.type}`);
      assert(Boolean(km.quote && km.quote.trim()), `Key moment has verbatim quote`);
      assert(Boolean(km.context && km.context.trim()), `Key moment has explanatory context`);
    });

    // -------------------------------------------------------------------
    // 4. Emotion-Aware AI Suggestions & Constructive Grounding
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing Emotion-Aware Constructive Suggestions ---');

    assert(sentimentResult.suggestions.length > 0, 'Emotion-aware suggestions were generated');
    sentimentResult.suggestions.forEach(sug => {
      assert(Boolean(sug.trigger && sug.trigger.trim()), 'Suggestion has clear trigger observation');
      assert(Boolean(sug.recommendedAction && sug.recommendedAction.trim()), 'Suggestion has actionable next step');
      assert(Boolean(sug.rationale && sug.rationale.trim()), 'Suggestion has grounded rationale');

      // Strict test: Ensure suggestions are professional, non-judgmental and zero psychological diagnoses
      const lowerSug = `${sug.trigger} ${sug.recommendedAction} ${sug.rationale}`.toLowerCase();
      assert(!lowerSug.includes('depressed') && !lowerSug.includes('mental health') && !lowerSug.includes('incompetent'),
        'Suggestion does not contain psychiatric or employee performance evaluations');
    });

    // -------------------------------------------------------------------
    // 5. Schema Validation & Sanitizer Resilience
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing Schema Sanitizer & Resilience ---');

    // Test with malformed input
    const malformedData = {
      conversationalTone: '',
      overallSentiment: 'INVALID_ENUM',
      distribution: { positive: 150, negative: -20, neutral: 'not-a-number' },
      speakers: [
        { speaker: 'Alice', overallSentiment: 'HAPPY_MOOD', emotionalSignals: ['InvalidSignal', 'Confidence'] },
      ],
      observations: [
        { speaker: 'Alice', sentiment: 'INVALID_SENTIMENT', emotionalSignal: 'SUPER_ANGRY', quote: 'test quote' },
      ],
    };

    const sanitized = sanitizeSentimentOutput(malformedData, {
      transcript: 'Alice: Everything looks good.',
      title: 'Fallback Test',
    });

    assert(sanitized.overallSentiment === 'Neutral', 'Sanitizer replaces invalid overallSentiment enum with "Neutral"');
    assert(sanitized.distribution.positive <= 100 && sanitized.distribution.positive >= 0, 'Sanitizer clamps positive percentage within 0-100');
    assert(sanitized.speakers[0].overallSentiment === 'Neutral', 'Sanitizer validates speaker sentiment enum');
    assert(sanitized.speakers[0].emotionalSignals.includes('Confidence'), 'Sanitizer preserves valid emotional signal');
    assert(!sanitized.speakers[0].emotionalSignals.includes('InvalidSignal'), 'Sanitizer removes invalid emotional signal');
    assert(sanitized.observations[0].sentiment === 'Neutral', 'Sanitizer validates observation sentiment enum');
    assert(sanitized.observations[0].emotionalSignal === 'None', 'Sanitizer replaces invalid emotional signal with "None"');

    // Test empty transcript validation
    let emptyCaught = false;
    try {
      extractSentimentWithRuleFallback({ transcript: '' });
    } catch (err) {
      emptyCaught = true;
      assert(err.message.includes('Transcript cannot be empty'), 'Empty transcript throws descriptive error');
    }
    assert(emptyCaught, 'Empty transcript validation caught');

    // -------------------------------------------------------------------
    // 6. MongoDB Persistence Integration
    // -------------------------------------------------------------------
    console.log('\n--- 6. Testing MongoDB Meeting Persistence ---');

    // Create test meeting via API server (which is already live and connected to MongoDB Atlas)
    const createRes = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Automated Sentiment Intelligence Test Meeting',
        date: '2026-10-31',
        department: 'Engineering',
        transcript: multiSpeakerTranscript,
        summary: 'Test meeting summary for sentiment intelligence validation.',
        detailedSummary: 'Detailed overview of discussions between Alice, Bob, Charlie, and Dana.',
        keyPoints: ['API on track', 'Database pool risks discussed', 'Devops sync scheduled'],
        decisions: [{ decision: 'Hold DevOps sync at 2 PM', rationale: 'Address staging cluster blocker safely' }],
      }),
    });

    assert(createRes.status === 201, `Created test meeting via POST /api/meetings (Status: ${createRes.status})`);
    const createBody = await createRes.json();
    testMeetingId = createBody.data?.id || createBody.data?._id;
    assert(Boolean(testMeetingId), `Persisted test meeting in MongoDB (ID: ${testMeetingId})`);

    // If local mongoose connection is ready, test analyzeAndSaveMeetingSentiment directly
    if (mongoose.connection.readyState === 1) {
      const persistedSentiment = await analyzeAndSaveMeetingSentiment(testMeetingId);
      assert(persistedSentiment !== null, 'analyzeAndSaveMeetingSentiment returned sentiment data');
      assert(typeof persistedSentiment.conversationalTone === 'string', 'Persisted sentiment contains conversationalTone');

      const fetchedMeeting = await Meeting.findById(testMeetingId);
      assert(fetchedMeeting.sentiment !== null, 'Meeting document in MongoDB has sentiment field populated');
      assert(fetchedMeeting.sentiment.speakers.length >= 4, `Persisted ${fetchedMeeting.sentiment.speakers.length} speakers to MongoDB`);
      assert(fetchedMeeting.sentiment.suggestions.length > 0, `Persisted ${fetchedMeeting.sentiment.suggestions.length} suggestions to MongoDB`);

      const retrieved = await getMeetingSentiment(testMeetingId);
      assert(retrieved !== null && retrieved.conversationalTone === fetchedMeeting.sentiment.conversationalTone,
        'getMeetingSentiment retrieves existing persisted sentiment');
    }

    // -------------------------------------------------------------------
    // 7. HTTP API Endpoint Verification
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing HTTP Endpoints ---');

    // A: POST /api/meetings/:id/sentiment/analyze
    const analyzeRes = await fetch(`${API_BASE}/${testMeetingId}/sentiment/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(analyzeRes.status === 200, `POST /:id/sentiment/analyze returned 200 OK (Status: ${analyzeRes.status})`);
    const analyzeBody = await analyzeRes.json();
    assert(analyzeBody.success === true, 'POST /:id/sentiment/analyze response success is true');
    assert(analyzeBody.data.speakers.length >= 4, 'Re-analysis persisted and returned speakers');
    assert(typeof analyzeBody.data.conversationalTone === 'string', 'Returned conversationalTone is descriptive string');
    assert(analyzeBody.data.distribution && typeof analyzeBody.data.distribution.positive === 'number', 'Returned sentiment distribution');

    // B: GET /api/meetings/:id/sentiment
    const getRes = await fetch(`${API_BASE}/${testMeetingId}/sentiment`);
    assert(getRes.status === 200, `GET /:id/sentiment returned 200 OK (Status: ${getRes.status})`);
    const getBody = await getRes.json();
    assert(getBody.success === true, 'GET /:id/sentiment response success is true');
    assert(getBody.data && getBody.data.conversationalTone, 'GET /:id/sentiment returns populated sentiment data');
    assert(getBody.data.speakers.length >= 4, `GET returned ${getBody.data.speakers.length} speakers`);
    assert(getBody.data.suggestions.length > 0, `GET returned ${getBody.data.suggestions.length} suggestions`);

    // C: POST /api/meetings/sentiment/analyze-direct
    const directRes = await fetch(`${API_BASE}/sentiment/analyze-direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: multiSpeakerTranscript,
        title: 'Direct Sentiment Test',
      }),
    });
    assert(directRes.status === 200, `POST /sentiment/analyze-direct returned 200 OK (Status: ${directRes.status})`);
    const directBody = await directRes.json();
    assert(directBody.success === true, 'Direct analysis returned success true');
    assert(directBody.data.distribution.positive !== undefined, 'Direct analysis returned distribution');

    // D: Error cases - 400 for invalid ID
    const badIdRes = await fetch(`${API_BASE}/invalid-mongo-id/sentiment`);
    assert(badIdRes.status === 400, 'GET /invalid-mongo-id/sentiment returned 400 Bad Request');

    // E: Error cases - 404 for non-existent ID
    const fakeId = new mongoose.Types.ObjectId().toString();
    const missingRes = await fetch(`${API_BASE}/${fakeId}/sentiment`);
    assert(missingRes.status === 404, 'GET /fake-id/sentiment returned 404 Not Found');

    console.log('\n======================================================');
    console.log(`🎉 ALL TESTS PASSED! (${passed}/${passed + failed})`);
    console.log('======================================================\n');
  } catch (err) {
    console.error(`\n❌ TEST SUITE FAILED with error:`, err);
  } finally {
    if (testMeetingId) {
      try {
        await fetch(`${API_BASE}/${testMeetingId}`, { method: 'DELETE' });
        console.log(`[Cleanup] Removed test meeting ${testMeetingId} via API.`);
      } catch (_) {}
      if (mongoose.connection.readyState === 1) {
        try {
          await Meeting.findByIdAndDelete(testMeetingId);
        } catch (_) {}
      }
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[Database] Disconnected from MongoDB.');
    }
  }
}

runSentimentAnalysisTests();
