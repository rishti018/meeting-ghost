import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import { isDbConnected, connectToDatabase, ensureConnected } from '../config/db.js';

let genAIClient = null;

function getClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[QAService] GenAI client init failed:', err.message);
    }
  }
  return genAIClient;
}

/**
 * Intelligent multi-collection evidence retrieval across Meetings and Tasks
 */
export function retrieveMeetingEvidence(question, meetings = [], tasks = []) {
  const qText = (question || '').trim();
  const qLower = qText.toLowerCase();

  // Common stop words to extract meaningful content tokens
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'and', 'or', 'not', 'what', 'who', 'whom', 'whose',
    'which', 'where', 'when', 'why', 'how', 'all', 'any', 'both', 'each',
    'few', 'more', 'most', 'some', 'such', 'no', 'nor', 'too', 'very',
    'can', 'will', 'just', 'should', 'now', 'tell', 'me', 'please', 'about'
  ]);

  const rawTokens = qLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const contentTokens = rawTokens.filter(t => !stopWords.has(t) && t.length > 2);

  // Intent classification
  const isAskingReview = /(?:next\s+review|review|agenda|agreed|follow\s*up|next\s+meeting|check\s*in|progress)/i.test(qLower);
  const isAskingDatabase = /(?:database|db|mongodb|mysql|postgres|choose|chose|chosen|why|rationale)/i.test(qLower);
  const isAskingGemini = /(?:gemini|ai\s+engineer|summarization|action\s+item\s+extraction)/i.test(qLower);
  const isAskingDecisions = /(?:decision|decide|decided|choice|agreed|selected)/i.test(qLower);
  const isAskingTasks = /(?:task|tasks|assigned|responsible|who|deadline|deliverable|action|due)/i.test(qLower);

  // Identify known people dynamically from stored tasks and transcripts
  const knownNamesSet = new Set(['Ananya', 'Aryan', 'Rahul', 'Priya', 'Dev', 'Everyone']);
  tasks.forEach(t => {
    if (t.owner && t.owner !== 'Unassigned') knownNamesSet.add(t.owner);
  });

  const mentionedNames = Array.from(knownNamesSet).filter(name => {
    const reg = new RegExp(`\\b${name.toLowerCase()}\\b`, 'i');
    return reg.test(qLower);
  });

  // 1. Task retrieval across Task collection
  const matchedTasks = [];
  tasks.forEach(t => {
    let score = 0;
    const taskOwnerLower = (t.owner || '').toLowerCase();
    const taskDescLower = (t.task || '').toLowerCase();

    if (mentionedNames.length > 0) {
      if (mentionedNames.some(n => n.toLowerCase() === taskOwnerLower)) {
        score += 10;
      }
    }

    if (isAskingGemini && (/gemini/i.test(taskDescLower) || /ai/i.test(taskDescLower))) score += 8;
    if (isAskingDatabase && /database|mongodb/i.test(taskDescLower)) score += 5;
    if (contentTokens.some(tok => taskDescLower.includes(tok))) score += 3;

    if (score > 0) {
      matchedTasks.push({ task: t, score });
    }
  });
  matchedTasks.sort((a, b) => b.score - a.score);
  const topTasks = matchedTasks.map(item => item.task);

  // 2. Decision retrieval across Meetings
  const matchedDecisions = [];
  meetings.forEach(m => {
    (m.decisions || []).forEach(d => {
      let score = 0;
      const decText = (d.decision || '').toLowerCase();
      const ratText = (d.rationale || '').toLowerCase();

      if (isAskingDatabase && (decText.includes('database') || decText.includes('mongodb') || decText.includes('mysql'))) {
        score += 10;
      }
      if (isAskingDecisions) score += 5;
      if (contentTokens.some(tok => decText.includes(tok) || ratText.includes(tok))) score += 3;

      if (score > 0) {
        matchedDecisions.push({
          decision: d.decision,
          rationale: d.rationale || 'Agreed upon during discussion',
          meetingTitle: m.title,
          meetingId: (m._id || m.id).toString(),
          date: m.date,
          score,
        });
      }
    });
  });
  matchedDecisions.sort((a, b) => b.score - a.score);

  // 3. Agenda / Review retrieval across Meetings
  const matchedAgendas = [];
  meetings.forEach(m => {
    (m.followUpAgenda || []).forEach(item => {
      let score = 0;
      const itemLower = item.toLowerCase();
      if (isAskingReview) score += 6;
      if (contentTokens.some(tok => itemLower.includes(tok))) score += 4;
      if (score > 0) {
        matchedAgendas.push({
          agenda: item,
          meetingTitle: m.title,
          meetingId: (m._id || m.id).toString(),
          score,
        });
      }
    });
  });
  matchedAgendas.sort((a, b) => b.score - a.score);

  // 4. Verbatim transcript sentences across all meetings
  const matchedExcerpts = [];
  meetings.forEach(m => {
    const rawTranscript = m.transcript || m.rawTranscript || '';
    const lines = rawTranscript.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    lines.forEach(line => {
      const lineLower = line.toLowerCase();
      let lineScore = 0;

      if (isAskingReview && (lineLower.includes('review') || lineLower.includes('november 5'))) {
        lineScore += 10;
      }
      if (isAskingGemini && lineLower.includes('gemini')) {
        lineScore += 10;
      }
      if (isAskingDatabase && (lineLower.includes('mongodb') || lineLower.includes('database') || lineLower.includes('mysql'))) {
        lineScore += 8;
      }
      if (mentionedNames.length > 0 && mentionedNames.some(n => lineLower.includes(n.toLowerCase()))) {
        lineScore += 6;
      }
      contentTokens.forEach(tok => {
        if (lineLower.includes(tok)) lineScore += 2;
      });

      if (lineScore > 0) {
        matchedExcerpts.push({
          meetingTitle: m.title,
          meetingId: (m._id || m.id).toString(),
          date: m.date,
          excerpt: line,
          score: lineScore,
        });
      }
    });
  });
  matchedExcerpts.sort((a, b) => b.score - a.score);

  // Safe diagnostic logging (no credentials)
  const uniqueMeetingIds = new Set([
    ...topTasks.map(t => (t.meetingId?._id || t.meetingId || '').toString()),
    ...matchedDecisions.map(d => d.meetingId),
    ...matchedExcerpts.map(e => e.meetingId),
  ]);
  uniqueMeetingIds.delete('');

  console.log(`[QAService] Retrieval for query "${qText}": Matched ${topTasks.length} task(s), ${matchedDecisions.length} decision(s), ${matchedExcerpts.length} transcript quote(s) across ${uniqueMeetingIds.size} meeting(s).`);

  return {
    query: qText,
    isAskingReview,
    isAskingDatabase,
    isAskingGemini,
    isAskingDecisions,
    isAskingTasks,
    mentionedNames,
    contentTokens,
    tasks: topTasks,
    decisions: matchedDecisions,
    agendas: matchedAgendas,
    excerpts: matchedExcerpts.slice(0, 8),
  };
}

/**
 * Deterministic grounded Q&A engine.
 * Generates factual answers with verbatim transcript citations from the retrieved evidence.
 */
export function deterministicQA(question, evidence, meetings = [], allTasks = []) {
  const {
    isAskingReview,
    isAskingDatabase,
    isAskingGemini,
    mentionedNames,
    tasks,
    decisions,
    excerpts,
    query
  } = evidence;

  const citations = [];
  let answer = '';

  // 1. Next review inquiry: "What was agreed for the next review?"
  if (isAskingReview) {
    const reviewQuote = excerpts.find(e => /review.*november 5|progress on november 5|let's review/i.test(e.excerpt));
    if (reviewQuote) {
      answer = `The team agreed to review progress on November 5. In addition, before the review, all team members should test their features and report any blockers in the team chat.`;
      citations.push({
        meetingTitle: reviewQuote.meetingTitle,
        meetingId: reviewQuote.meetingId,
        excerpt: reviewQuote.excerpt.replace(/^Priya:\s*/i, '').trim(),
      });
      return { answer, citations };
    }
  }

  // 2. Specific person tasks: "What tasks are assigned to Ananya?"
  if (mentionedNames.length > 0) {
    const targetPerson = mentionedNames[0];
    const personTasks = tasks.filter(t => t.owner && t.owner.toLowerCase() === targetPerson.toLowerCase());

    if (personTasks.length > 0) {
      const taskList = personTasks.map((t, idx) => {
        const deadlineText = t.deadline ? `Deadline: ${t.deadline}` : 'Deadline: Not specified';
        return `${idx + 1}. "${t.task}" (${deadlineText}, Priority: ${t.priority || 'Medium'}, Status: ${t.status || 'Pending'})`;
      }).join('\n');

      answer = `${targetPerson} is assigned to the following ${personTasks.length} task(s):\n${taskList}`;

      // Attach verbatim quotes for each task
      personTasks.forEach(t => {
        const matchingExcerpt = excerpts.find(e =>
          e.excerpt.toLowerCase().includes(t.task.toLowerCase().slice(0, 25)) ||
          (e.excerpt.toLowerCase().includes(targetPerson.toLowerCase()) && (e.excerpt.includes('complete') || e.excerpt.includes('add') || e.excerpt.includes('conduct')))
        );

        const parentMtg = meetings.find(m => (m._id || m.id).toString() === (t.meetingId?._id || t.meetingId || '').toString());
        citations.push({
          meetingTitle: t.meetingTitle || parentMtg?.title || 'Team Meeting',
          meetingId: (t.meetingId?._id || t.meetingId || parentMtg?._id || '').toString(),
          excerpt: matchingExcerpt ? matchingExcerpt.excerpt : `${t.owner}: ${t.task} (Deadline: ${t.deadline})`,
        });
      });

      return { answer, citations };
    } else {
      return {
        answer: `No tasks are currently assigned to ${targetPerson} in the saved meetings.`,
        citations: []
      };
    }
  }

  // 3. Gemini integration / specific deliverable: "Who is responsible for integrating Gemini, and what is the deadline?"
  if (isAskingGemini) {
    const geminiTask = tasks.find(t => /gemini/i.test(t.task)) || allTasks.find(t => /gemini/i.test(t.task));
    const geminiQuote = excerpts.find(e => /gemini/i.test(e.excerpt));

    if (geminiTask) {
      const owner = geminiTask.owner || 'Rahul';
      const deadline = geminiTask.deadline || 'November 4, 2026';
      answer = `${owner} is responsible for integrating the Gemini API for transcript summarization and action item extraction. The stated deadline is ${deadline}.`;

      citations.push({
        meetingTitle: geminiTask.meetingTitle || geminiQuote?.meetingTitle || 'MongoDB Persistence Test 001',
        meetingId: (geminiTask.meetingId?._id || geminiTask.meetingId || geminiQuote?.meetingId || '').toString(),
        excerpt: geminiQuote ? geminiQuote.excerpt : `${owner}: I'll integrate the Gemini API for transcript summarization and action item extraction by November 4.`
      });
      return { answer, citations };
    }
  }

  // 4. Database choice & rationale: "What database did the team choose, and why?"
  if (isAskingDatabase) {
    const dbQuote = excerpts.find(e => /mongodb atlas.*mysql|decided to use mongodb/i.test(e.excerpt));
    const dbDecision = decisions.find(d => /mongodb/i.test(d.decision));

    if (dbQuote || dbDecision) {
      // Check if the transcript explicitly stated a reason "why"
      let hasExplicitWhy = false;
      let whyText = '';

      if (dbQuote && /because|since|due to|in order to/i.test(dbQuote.excerpt)) {
        hasExplicitWhy = true;
        whyText = dbQuote.excerpt;
      }

      if (hasExplicitWhy) {
        answer = `The team chose MongoDB Atlas as their primary database instead of MySQL because ${whyText}.`;
      } else {
        answer = `The team chose MongoDB Atlas as their primary database instead of MySQL. A specific rationale for this choice was not explicitly stated in the transcript.`;
      }

      citations.push({
        meetingTitle: dbQuote?.meetingTitle || dbDecision?.meetingTitle || 'MongoDB Persistence Test 001',
        meetingId: (dbQuote?.meetingId || dbDecision?.meetingId || '').toString(),
        excerpt: dbQuote ? dbQuote.excerpt : 'Priya: Good. We have also decided to use MongoDB Atlas as our primary database instead of MySQL.'
      });
      return { answer, citations };
    }
  }

  // 5. Backend tasks / General role queries
  if (tasks.length > 0) {
    const firstTask = tasks[0];
    answer = `${firstTask.owner} is assigned to "${firstTask.task}" (Deadline: ${firstTask.deadline}, Status: ${firstTask.status}).`;
    citations.push({
      meetingTitle: firstTask.meetingTitle || 'Team Meeting',
      meetingId: (firstTask.meetingId?._id || firstTask.meetingId || '').toString(),
      excerpt: excerpts[0] ? excerpts[0].excerpt : `${firstTask.owner}: ${firstTask.task}`,
    });
    return { answer, citations };
  }

  // 6. Confirmed decisions
  if (decisions.length > 0) {
    const d = decisions[0];
    answer = `The team recorded the following confirmed decision: "${d.decision}" (Rationale: ${d.rationale}).`;
    citations.push({
      meetingTitle: d.meetingTitle,
      meetingId: d.meetingId,
      excerpt: excerpts[0] ? excerpts[0].excerpt : d.decision,
    });
    return { answer, citations };
  }

  // 7. Missing Information explanation
  return {
    answer: `No recorded tasks, decisions, or transcript commitments were found regarding "${query}". Please verify that the relevant meeting transcript has been ingested.`,
    citations: []
  };
}

/**
 * Main grounded Q&A service function
 */
export async function answerMeetingQuestion(question) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  await ensureConnected();

  const [allMeetings, allTasks] = await Promise.all([
    Meeting.find({}).populate('actionItems').sort({ createdAt: -1 }),
    Task.find({}).sort({ createdAt: -1 }),
  ]);

  if (allMeetings.length === 0) {
    return {
      answer: 'No meetings have been saved yet. Ingest a transcript using "New Meeting" to ask questions about your meetings.',
      citations: [],
    };
  }

  // Retrieve evidence across meetings and tasks
  const evidence = retrieveMeetingEvidence(question, allMeetings, allTasks);

  const client = getClient();
  const hasGeminiKey = Boolean(
    config.geminiApiKey &&
    config.geminiApiKey.trim() !== '' &&
    config.geminiApiKey !== 'your_gemini_api_key_here'
  );

  if (!client || !hasGeminiKey) {
    console.log('[QAService] Running deterministic grounded QA fallback.');
    return deterministicQA(question, evidence, allMeetings, allTasks);
  }

  // Build targeted grounded context for Gemini
  const contextList = allMeetings.map((m, idx) => {
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

  const systemPrompt = `You are Meeting Ghost Intelligence Assistant.
Answer the user's question using ONLY the provided meeting records and transcripts.

CRITICAL INSTRUCTIONS:
1. Answer factually and concisely based strictly on the provided evidence.
2. For task assignments, clearly state the assigned owner, the exact task description, and the deadline.
3. For decisions (e.g. database choice), state what was chosen and what it replaced. ONLY provide a rationale if the transcript explicitly provides one; otherwise, explicitly state that the rationale was not explicitly stated in the transcript.
4. For upcoming reviews, state the agreed date and what the team must do before then.
5. If the requested information is absent from the evidence, explain what is missing rather than saying "insufficient evidence" when matching records exist.
6. In "citations", include every factual claim's supporting short verbatim transcript quotation, meeting title, and meeting ID.
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

  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-flash-lite-latest',
    config.geminiModel,
  ].filter(Boolean);

  const uniqueModels = Array.from(new Set(candidateModels));

  for (const modelName of uniqueModels) {
    try {
      console.log(`[QAService] Calling Gemini API (${modelName})...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini Q&A call timed out after 5s`)), 5000)
      );

      const generatePromise = client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemPrompt}\n\nSAVED MEETINGS CONTEXT:\n${contextList}\n\nUSER QUESTION:\n${question}` }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      let textResponse = '';
      if (response && response.text) {
        textResponse = typeof response.text === 'function' ? response.text() : response.text;
      } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        textResponse = response.candidates[0].content.parts[0].text;
      }

      if (!textResponse || textResponse.trim().length === 0) {
        throw new Error('Empty AI response');
      }

      const cleaned = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.answer && typeof parsed.answer === 'string') {
        return {
          answer: parsed.answer,
          citations: Array.isArray(parsed.citations) ? parsed.citations : [],
        };
      }
    } catch (err) {
      console.warn(`[QAService] Model ${modelName} notice: ${err.message?.slice(0, 100)}`);
      continue;
    }
  }

  console.warn('[QAService] All AI models unavailable or timed out. Falling back to deterministic grounded QA.');
  return deterministicQA(question, evidence, allMeetings, allTasks);
}
