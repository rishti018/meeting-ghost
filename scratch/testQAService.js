import { connectToDatabase } from '../server/config/db.js';
import { Meeting } from '../server/models/Meeting.js';
import { Task } from '../server/models/Task.js';
import { GoogleGenAI } from '@google/genai';
import { config } from '../server/config/env.js';

async function testQASystem() {
  await connectToDatabase();
  const meetings = await Meeting.find({});
  const tasks = await Task.find({});

  console.log(`DB loaded: ${meetings.length} meetings, ${tasks.length} tasks`);

  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const testQuestions = [
    'What was agreed for the next review?',
    'What tasks are assigned to Ananya?',
    'Who is responsible for integrating Gemini, and what is the deadline?',
    'What database did the team choose, and why?'
  ];

  for (const question of testQuestions) {
    console.log(`\n======================================================`);
    console.log(`TESTING QUESTION: "${question}"`);
    console.log(`======================================================`);

    const contextList = meetings.map((m, idx) => {
      const raw = m.transcript || m.rawTranscript || '';
      return `--- MEETING #${idx + 1}: "${m.title}" (Date: ${m.date || 'Unknown'}, ID: ${m._id}) ---
RAW TRANSCRIPT:
"""
${raw}
"""
ACTION ITEMS:
${(m.actionItems || []).map(a => `* [${a.status}] ${a.owner}: ${a.task} (Deadline: ${a.deadline}, Priority: ${a.priority})`).join('\n')}
DECISIONS:
${(m.decisions || []).map(d => `* ${d.decision} (Rationale: ${d.rationale})`).join('\n')}
FOLLOW-UP AGENDA:
${(m.followUpAgenda || []).map(a => `* ${a}`).join('\n')}`;
    }).join('\n\n');

    const systemPrompt = `You are Meeting Ghost Intelligence Assistant. Answer the user's question using ONLY the provided meeting records and transcripts.

CRITICAL INSTRUCTIONS:
1. Answer accurately and concisely using ONLY the provided evidence.
2. For task assignments, clearly state the assigned person, the exact deliverable, and the deadline.
3. For decisions (e.g. database choice), state what was chosen and what it replaced. Only provide a rationale if the transcript explicitly provides one; otherwise, explicitly state that the rationale was not explicitly stated in the transcript.
4. For upcoming reviews, state the agreed date and what participants must do before then.
5. If the requested information is absent from the records, explain what is missing rather than saying "insufficient evidence" when matching records exist.
6. For every factual claim, provide the supporting short verbatim transcript quotation, meeting title, and meeting ID in "citations".
7. Return strictly valid JSON:
{
  "answer": "Clear, grounded answer to the question",
  "citations": [
    {
      "meetingTitle": "Exact title of the source meeting",
      "meetingId": "Source meeting ID",
      "excerpt": "Short verbatim transcript quotation supporting this fact"
    }
  ]
}`;

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nSAVED MEETINGS:\n${contextList}\n\nQUESTION: ${question}` }] }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      let text = response.text;
      if (typeof text === 'function') text = text();
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      console.log('AI Answer:\n', parsed.answer);
      console.log('\nAI Citations:\n', JSON.stringify(parsed.citations, null, 2));
    } catch (err) {
      console.error('Gemini error:', err.message);
    }
  }

  process.exit(0);
}

testQASystem().catch(err => {
  console.error(err);
  process.exit(1);
});
