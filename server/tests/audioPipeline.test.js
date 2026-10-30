import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { connectToDatabase } from '../config/db.js';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import { answerMeetingQuestion } from '../services/qaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5058;

// Multipart form-data helper
function uploadAudioRequest(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const postDataHeader = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="audio"; filename="${fileName}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    );
    const postDataFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([postDataHeader, fileData, postDataFooter]);

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/audio/transcribe',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function jsonRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  process.env.NODE_ENV = 'test';
  const { default: app } = await import('../index.js');

  console.log('\n======================================================');
  console.log('🎙️ RUNNING AUDIO TRANSCRIPTION & PIPELINE END-TO-END TEST');
  console.log('======================================================\n');

  await connectToDatabase();
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 400));

  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  let createdMeetingId = null;

  try {
    const wavPath = path.join(__dirname, 'meeting_sample.wav');
    if (!fs.existsSync(wavPath)) {
      throw new Error(`Test WAV file not found at ${wavPath}`);
    }

    // Test 1: Upload and Transcribe Real Audio via POST /api/audio/transcribe
    console.log('[1/4] Testing Audio Upload & Speech-to-Text via HTTP API...');
    const audioRes = await uploadAudioRequest(wavPath);
    const transcriptText = audioRes.data?.data?.transcript;

    assert(
      'POST /api/audio/transcribe status 200 with verified speech-to-text',
      audioRes.status === 200 && Boolean(transcriptText && transcriptText.length > 10),
      `Words: ${transcriptText?.split(/\s+/).length}, Model: ${audioRes.data?.data?.modelUsed || 'Gemini'}`
    );
    assert(
      'Audio transcript contains spoken commitments verbatim',
      transcriptText && /audio integration|recording interface/i.test(transcriptText),
      `Excerpt: "${transcriptText?.slice(0, 70)}..."`
    );

    // Test 2: Ingest Transcribed Meeting through existing pipeline
    console.log('\n[2/4] Testing Ingestion Pipeline with Audio-derived Transcript...');
    const ingestRes = await jsonRequest('POST', '/api/meetings', {
      title: 'Audio Pipeline Verified Meeting',
      department: 'Engineering',
      transcript: transcriptText,
      meetingDate: '2026-10-30',
    });

    createdMeetingId = ingestRes.data?.data?.id || ingestRes.data?.data?._id;
    const actionItems = ingestRes.data?.data?.actionItems || [];
    const decisions = ingestRes.data?.data?.decisions || [];

    assert(
      'POST /api/meetings generates executive summary & saves audio meeting',
      ingestRes.status === 201 && Boolean(ingestRes.data?.data?.summary),
      `Meeting ID: ${createdMeetingId}`
    );
    assert(
      'Action items extracted from audio speech with owners and deadlines',
      actionItems.length >= 2 && actionItems.some(a => /aryan/i.test(a.owner)) && actionItems.some(a => /ananya/i.test(a.owner)),
      `Deliverables: ${actionItems.map(a => `${a.owner}: ${a.task} (${a.deadline})`).join(' | ')}`
    );
    assert(
      'Decisions identified from audio speech',
      decisions.length >= 1 && decisions.some(d => /mongodb/i.test(d.decision)),
      `Decision: ${decisions[0]?.decision}`
    );

    // Test 3: Verify Persistence in MongoDB Atlas
    console.log('\n[3/4] Testing MongoDB Atlas Persistence & Cross-Collection Linking...');
    const fetchedMeeting = await Meeting.findById(createdMeetingId).populate('actionItems');
    const linkedTasks = await Task.find({ meetingId: createdMeetingId });

    assert(
      'Audio meeting record persisted in MongoDB Atlas',
      Boolean(fetchedMeeting && fetchedMeeting.transcript === transcriptText),
      `Title: "${fetchedMeeting?.title}"`
    );
    assert(
      'Tasks persisted in MongoDB Task collection linked to audio meeting',
      linkedTasks.length >= 2,
      `Linked Tasks in DB: ${linkedTasks.length}`
    );

    // Verify GET /api/meetings/:id endpoint returns full original transcript for report display
    const apiMeetingRes = await jsonRequest('GET', `/api/meetings/${createdMeetingId}`);
    assert(
      'GET /api/meetings/:id returns full original transcript for report display',
      apiMeetingRes.status === 200 && (apiMeetingRes.data?.data?.transcript === transcriptText || apiMeetingRes.data?.data?.rawTranscript === transcriptText),
      `Transcript length: ${apiMeetingRes.data?.data?.transcript?.length || 0} chars`
    );

    // Test 4: Verify Grounded Q&A over Audio-derived Transcript
    console.log('\n[4/4] Testing Grounded Q&A over Audio-derived Meeting...');
    const qaResult = await answerMeetingQuestion('Who will complete the audio integration?');
    assert(
      'Ask Meetings answers question grounded on audio transcript',
      Boolean(qaResult.answer && /aryan/i.test(qaResult.answer)),
      `Answer: "${qaResult.answer?.slice(0, 60)}..."`
    );

    console.log('\n======================================================');
    console.log(`Audio Pipeline Test Completed: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('Audio Test Error:', err);
    failed++;
  } finally {
    // Cleanup created test meeting
    if (createdMeetingId) {
      try {
        await Meeting.findByIdAndDelete(createdMeetingId);
        await Task.deleteMany({ meetingId: createdMeetingId });
        console.log(`Cleaned up test meeting ${createdMeetingId}`);
      } catch (_) {}
    }
    if (server) {
      server.close();
    }
    try {
      await mongoose.disconnect();
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();

