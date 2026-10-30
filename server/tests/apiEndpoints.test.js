/**
 * API Endpoints Verification Test
 * Tests HTTP routing, error handlers, input validation, and health endpoint.
 */

process.env.NODE_ENV = 'test';
import http from 'http';
import { connectToDatabase } from '../config/db.js';

const PORT = 5055;
let server = null;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
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
  console.log('\n======================================================');
  console.log('📡 RUNNING API ENDPOINTS INTEGRATION TEST');
  console.log('======================================================\n');

  const { default: app } = await import('../index.js');
  server = app.listen(PORT);
  let dbConn = await connectToDatabase();
  if (!dbConn) {
    await new Promise(r => setTimeout(r, 1000));
    dbConn = await connectToDatabase();
  }
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

  try {
    // 1. Health endpoint with active ping and secrets isolation
    const health = await request('GET', '/api/health');
    const healthPayloadStr = JSON.stringify(health.data);
    const hasSecrets = healthPayloadStr.includes('Bk5MGffKmLiiIPwR') || healthPayloadStr.includes('rishti018_db_user');
    assert(
      'GET /api/health returns status 200 and healthy ping payload',
      health.status === 200 && health.data.database?.connected === true && health.data.database?.ping === true,
      `Ping: ${health.data.database?.ping}, Latency: ${health.data.database?.latencyMs}ms, DB: ${health.data.database?.databaseName}`
    );
    assert(
      'GET /api/health never exposes passwords or credentials in response',
      !hasSecrets,
      `Safe Host: ${health.data.database?.clusterHost}`
    );

    // 2. Reject empty transcript on POST /api/meetings
    const emptyMtg = await request('POST', '/api/meetings', { transcript: '' });
    assert(
      'POST /api/meetings rejects empty transcript with 400',
      emptyMtg.status === 400 && Boolean(emptyMtg.data.error),
      emptyMtg.data.error
    );

    // 3. Reject invalid ObjectId on GET /api/meetings/:id
    const badIdMtg = await request('GET', '/api/meetings/not-an-id');
    assert(
      'GET /api/meetings/:id rejects invalid ObjectId with 400',
      badIdMtg.status === 400 && Boolean(badIdMtg.data.error),
      badIdMtg.data.error
    );

    // 4. Reject invalid ObjectId on PATCH /api/tasks/:id
    const badIdTask = await request('PATCH', '/api/tasks/not-an-id', { status: 'Completed' });
    assert(
      'PATCH /api/tasks/:id rejects invalid ObjectId with 400',
      badIdTask.status === 400 && Boolean(badIdTask.data.error),
      badIdTask.data.error
    );

    // 5. Reject invalid status on PATCH /api/tasks/:id (with valid-length pseudo id)
    const badStatusTask = await request('PATCH', '/api/tasks/507f1f77bcf86cd799439011', { status: 'UnknownStatus' });
    assert(
      'PATCH /api/tasks/:id validates status enum',
      badStatusTask.status === 400,
      badStatusTask.data.error
    );

    // 6. Reject empty question on POST /api/ask
    const emptyAsk = await request('POST', '/api/ask', { question: '' });
    assert(
      'POST /api/ask rejects empty question with 400',
      emptyAsk.status === 400 && Boolean(emptyAsk.data.error),
      emptyAsk.data.error
    );

    // 7. Test POST /api/meetings/analyze with valid transcript
    const sampleDialogue = `Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting.`;
    const analyzeRes = await request('POST', '/api/meetings/analyze', {
      transcript: sampleDialogue,
      title: 'Sprint Kickoff',
    });
    assert(
      'POST /api/meetings/analyze returns structured intelligence preview',
      analyzeRes.status === 200 && Boolean(analyzeRes.data.data?.summary) && Array.isArray(analyzeRes.data.data?.actionItems),
      `Summary: ${analyzeRes.data.data?.summary?.slice(0, 50)}...`
    );

    // 8. 404 handler for undefined API routes
    const missing = await request('GET', '/api/nonexistent-route-xyz');
    assert(
      'Undefined /api/* route returns 404 JSON',
      missing.status === 404 && Boolean(missing.data.error),
      missing.data.error
    );

    console.log('\n======================================================');
    console.log(`API Endpoints Test Completed: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('API Test Error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    try {
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();

