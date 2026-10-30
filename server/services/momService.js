import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { extractWithRuleFallback } from './geminiService.js';

let genAIClient = null;

function getGenAIClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[MomService] Failed to initialize GoogleGenAI client:', err.message);
    }
  }
  return genAIClient;
}

function isGeminiConfigured() {
  return Boolean(
    config.geminiApiKey &&
    config.geminiApiKey.trim() !== '' &&
    config.geminiApiKey !== 'your_gemini_api_key_here'
  );
}

/**
 * Deterministic rule-based extraction for Minutes of Meeting
 * Used when Gemini is offline or as resilient fallback.
 */
export function extractMomWithRuleFallback({
  transcript = '',
  title = '',
  meetingDate = '',
  department = '',
  preparation = {},
  existingIntel = null,
}) {
  const text = (transcript || '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Title, Date, Time, Department
  const effectiveTitle = (title || existingIntel?.title || 'Not specified').trim();
  const effectiveDate = (meetingDate || existingIntel?.date || new Date().toISOString().split('T')[0]).trim();
  const effectiveDept = (department || existingIntel?.department || 'General').trim();

  // Try extracting time if present in transcript (e.g. "10:00 AM", "3:30 PM", "14:00")
  let effectiveTime = 'Not specified';
  const timeMatch = text.match(/\b([01]?[0-9]|2[0-3]):[0-5][0-9]\s*(?:AM|PM|am|pm)?\b/);
  if (timeMatch) {
    effectiveTime = timeMatch[0].trim();
  }

  // 2. Participants
  const participantsSet = new Set();
  if (preparation?.personName && preparation.personName.trim()) {
    participantsSet.add(preparation.personName.trim());
  }

  for (const line of lines) {
    const speakerMatch = line.match(/^\[?([A-Za-z0-9\s]+?)\]?(?:\s*\([^)]+\))?\s*:\s*(.*)$/);
    if (speakerMatch && speakerMatch[1]) {
      const name = speakerMatch[1].trim();
      if (name.length > 1 && !/^(?:note|timestamp|time|agenda|decision|action|ai)/i.test(name)) {
        participantsSet.add(name);
      }
    }
  }

  // Also check existing tasks for owner names
  if (existingIntel?.actionItems && Array.isArray(existingIntel.actionItems)) {
    for (const item of existingIntel.actionItems) {
      if (item.owner && item.owner !== 'Unassigned' && item.owner !== 'Everyone') {
        participantsSet.add(item.owner.trim());
      }
    }
  }

  const participants = Array.from(participantsSet);

  // 3. Meeting Objective / Purpose
  let objective = 'Not specified';
  if (preparation?.purpose && preparation.purpose.trim()) {
    objective = preparation.purpose.trim();
  } else if (existingIntel?.summary && existingIntel.summary.trim()) {
    objective = existingIntel.summary.trim();
  }

  // 4. Agenda Items
  let agenda = [];
  if (preparation?.agenda && Array.isArray(preparation.agenda) && preparation.agenda.length > 0) {
    agenda = preparation.agenda.map(a => String(a).trim()).filter(Boolean);
  } else if (existingIntel?.keyPoints && Array.isArray(existingIntel.keyPoints) && existingIntel.keyPoints.length > 0) {
    agenda = existingIntel.keyPoints.slice(0, 4);
  }

  // 5. Key Discussion Points
  let keyDiscussionPoints = [];
  if (existingIntel?.keyPoints && Array.isArray(existingIntel.keyPoints) && existingIntel.keyPoints.length > 0) {
    keyDiscussionPoints = existingIntel.keyPoints;
  } else {
    // Extract informative lines
    keyDiscussionPoints = lines
      .filter(l => l.length > 25 && !l.includes('?'))
      .slice(0, 5)
      .map(l => l.replace(/^[A-Za-z0-9\s]+:\s*/, '').trim());
  }
  if (keyDiscussionPoints.length === 0) {
    keyDiscussionPoints = ['General discussion held as recorded in the transcript.'];
  }

  // 6. Important Questions and Responses
  const questionsAndResponses = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('?')) {
      const speakerMatch = line.match(/^\[?([A-Za-z0-9\s]+?)\]?(?:\s*\([^)]+\))?\s*:\s*(.*)$/);
      const asker = speakerMatch ? speakerMatch[1].trim() : 'Not specified';
      const questionText = speakerMatch ? speakerMatch[2].trim() : line;

      let responseText = 'Not specified';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!nextLine.includes('?')) {
          const nextMatch = nextLine.match(/^\[?([A-Za-z0-9\s]+?)\]?(?:\s*\([^)]+\))?\s*:\s*(.*)$/);
          responseText = nextMatch ? `${nextMatch[1].trim()}: ${nextMatch[2].trim()}` : nextLine;
        }
      }

      questionsAndResponses.push({
        question: questionText,
        response: responseText,
        askedBy: asker,
      });

      if (questionsAndResponses.length >= 4) break;
    }
  }

  // 7. Decisions Made
  const decisions = [];
  const sourceDecisions = (existingIntel?.decisions && Array.isArray(existingIntel.decisions) && existingIntel.decisions.length > 0)
    ? existingIntel.decisions
    : (text ? extractWithRuleFallback(text, effectiveTitle, effectiveDate).decisions : []);

  for (const d of sourceDecisions) {
    decisions.push({
      decision: d.decision || 'Recorded decision',
      rationale: d.rationale || 'Agreed upon during discussion',
    });
  }

  // 8. Action Items
  const actionItems = [];
  const sourceActions = (existingIntel?.actionItems && Array.isArray(existingIntel.actionItems) && existingIntel.actionItems.length > 0)
    ? existingIntel.actionItems
    : (text ? extractWithRuleFallback(text, effectiveTitle, effectiveDate).actionItems : []);

  for (const item of sourceActions) {
    actionItems.push({
      task: item.task || item.description || 'Unspecified task',
      owner: item.owner || 'Unassigned',
      deadline: item.deadline || 'Not specified',
      priority: ['High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
      status: ['Pending', 'In Progress', 'Completed'].includes(item.status) ? item.status : 'Pending',
    });
  }

  // 9. Pending Issues / Unresolved Questions
  const pendingIssues = [];
  for (const line of lines) {
    if (/(?:pending|unresolved|to be discussed later|open question|need to follow up on)\s+(.+)/i.test(line)) {
      const match = line.match(/(?:pending|unresolved|to be discussed later|open question|need to follow up on)\s+(.+)/i);
      if (match) pendingIssues.push(match[1].trim());
    }
  }

  // 10. Follow-up Meeting Details
  let followUpMeeting = {
    details: 'Not specified',
    date: 'Not specified',
    time: 'Not specified',
    agenda: 'Not specified',
  };

  if (existingIntel?.followUpAgenda && Array.isArray(existingIntel.followUpAgenda) && existingIntel.followUpAgenda.length > 0) {
    followUpMeeting = {
      details: existingIntel.followUpAgenda.join('; '),
      date: 'Not specified',
      time: 'Not specified',
      agenda: existingIntel.followUpAgenda.join('; '),
    };
  }

  // 11. Conclusion / Summary
  let conclusion = 'Not specified';
  if (existingIntel?.summary) {
    conclusion = existingIntel.summary;
  } else if (lines.length > 0) {
    conclusion = lines.slice(-2).join(' ');
  }

  return {
    title: effectiveTitle,
    meetingDate: effectiveDate,
    meetingTime: effectiveTime,
    department: effectiveDept,
    participants: participants.length > 0 ? participants : ['Not specified'],
    objective: objective,
    agenda: agenda.length > 0 ? agenda : ['Not specified'],
    keyDiscussionPoints,
    questionsAndResponses,
    decisions,
    actionItems,
    pendingIssues: pendingIssues.length > 0 ? pendingIssues : ['No pending issues identified'],
    followUpMeeting,
    conclusion,
    generatedAt: new Date(),
    updatedAt: new Date(),
    isEdited: false,
  };
}

/**
 * Validate and sanitize structured MoM output
 */
export function sanitizeMomOutput(data, fallbackContext = {}) {
  if (!data || typeof data !== 'object') {
    return extractMomWithRuleFallback(fallbackContext);
  }

  const cleanString = (val, fallback = 'Not specified') => {
    if (typeof val === 'string' && val.trim().length > 0 && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined') {
      return val.trim();
    }
    return fallback;
  };

  const title = cleanString(data.title, fallbackContext.title || 'Not specified');
  const meetingDate = cleanString(data.meetingDate, fallbackContext.meetingDate || 'Not specified');
  const meetingTime = cleanString(data.meetingTime, 'Not specified');
  const department = cleanString(data.department, fallbackContext.department || 'General');
  const objective = cleanString(data.objective, fallbackContext.preparation?.purpose || 'Not specified');
  const conclusion = cleanString(data.conclusion, fallbackContext.existingIntel?.summary || 'Not specified');

  const participants = Array.isArray(data.participants)
    ? data.participants.map(p => cleanString(p, '')).filter(Boolean)
    : [];

  const agenda = Array.isArray(data.agenda)
    ? data.agenda.map(a => cleanString(a, '')).filter(Boolean)
    : [];

  const keyDiscussionPoints = Array.isArray(data.keyDiscussionPoints)
    ? data.keyDiscussionPoints.map(p => cleanString(p, '')).filter(Boolean)
    : [];

  const questionsAndResponses = Array.isArray(data.questionsAndResponses)
    ? data.questionsAndResponses.map(qr => ({
        question: cleanString(qr?.question, 'Not specified'),
        response: cleanString(qr?.response, 'Not specified'),
        askedBy: cleanString(qr?.askedBy, 'Not specified'),
      })).filter(qr => qr.question !== 'Not specified' || qr.response !== 'Not specified')
    : [];

  const decisions = Array.isArray(data.decisions)
    ? data.decisions.map(d => ({
        decision: cleanString(d?.decision, 'Recorded decision'),
        rationale: cleanString(d?.rationale, 'Agreed upon during discussion'),
      })).filter(d => d.decision.length > 0)
    : [];

  const actionItems = Array.isArray(data.actionItems)
    ? data.actionItems.map(item => ({
        task: cleanString(item?.task, 'Unspecified task'),
        owner: cleanString(item?.owner, 'Unassigned'),
        deadline: cleanString(item?.deadline, 'Not specified'),
        priority: ['High', 'Medium', 'Low'].includes(item?.priority) ? item.priority : 'Medium',
        status: ['Pending', 'In Progress', 'Completed'].includes(item?.status) ? item.status : 'Pending',
      })).filter(item => item.task.length > 0)
    : [];

  const pendingIssues = Array.isArray(data.pendingIssues)
    ? data.pendingIssues.map(p => cleanString(p, '')).filter(Boolean)
    : [];

  const rawFollowUp = data.followUpMeeting && typeof data.followUpMeeting === 'object' ? data.followUpMeeting : {};
  const followUpMeeting = {
    details: cleanString(rawFollowUp.details || (typeof data.followUpMeeting === 'string' ? data.followUpMeeting : ''), 'Not specified'),
    date: cleanString(rawFollowUp.date, 'Not specified'),
    time: cleanString(rawFollowUp.time, 'Not specified'),
    agenda: cleanString(rawFollowUp.agenda, 'Not specified'),
  };

  return {
    title,
    meetingDate,
    meetingTime,
    department,
    participants: participants.length > 0 ? participants : ['Not specified'],
    objective,
    agenda: agenda.length > 0 ? agenda : ['Not specified'],
    keyDiscussionPoints: keyDiscussionPoints.length > 0 ? keyDiscussionPoints : ['Not specified'],
    questionsAndResponses,
    decisions,
    actionItems,
    pendingIssues: pendingIssues.length > 0 ? pendingIssues : ['No pending issues identified'],
    followUpMeeting,
    conclusion,
    generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
    updatedAt: new Date(),
    isEdited: Boolean(data.isEdited),
  };
}

/**
 * Generate Minutes of Meeting using Gemini with multi-model failover & fallback
 */
export async function generateMinutesOfMeeting({
  transcript = '',
  title = '',
  meetingDate = '',
  department = '',
  preparation = {},
  existingIntel = null,
}) {
  const text = (transcript || '').trim();
  if (!text) {
    throw new Error('Transcript cannot be empty for MoM generation.');
  }

  const fallbackContext = {
    transcript: text,
    title,
    meetingDate,
    department,
    preparation,
    existingIntel,
  };

  const client = getGenAIClient();
  if (!client || !isGeminiConfigured()) {
    console.log('[MomService] Gemini API not configured or offline. Using rule-based MoM generator.');
    return extractMomWithRuleFallback(fallbackContext);
  }

  const systemPrompt = `You are Meeting Ghost, an expert executive secretary and meeting intelligence AI.
Your task is to generate professional, formal Minutes of Meeting (MoM) from the provided meeting transcript and preparation context.

STRICT ACCURACY RULES:
1. ONLY include facts, participants, decisions, deadlines, and discussion points that are explicitly stated in the transcript or preparation details.
2. DO NOT invent, assume, or hallucinate participants, decisions, questions, or deadlines.
3. If any field or detail is not stated or unavailable in the context, explicitly label it as "Not specified" (or empty array [] where appropriate).
4. Extract participants only from speaker names (e.g., "Aryan:", "Priya:", "[Rahul]:") or preparation personName.
5. Extract action items with task description, responsible person (owner), and deadline. If no deadline is stated, set "deadline": "Not specified".
6. Extract confirmed decisions with their explicitly stated rationale.
7. Output MUST be strictly valid JSON conforming to the schema below.

SCHEMA:
{
  "title": "Official meeting title",
  "meetingDate": "YYYY-MM-DD or date string",
  "meetingTime": "HH:MM AM/PM or Not specified",
  "department": "Department or General",
  "participants": ["Participant 1", "Participant 2"],
  "objective": "Meeting purpose or objective",
  "agenda": ["Agenda topic 1", "Agenda topic 2"],
  "keyDiscussionPoints": ["Key point 1", "Key point 2"],
  "questionsAndResponses": [
    {
      "question": "Exact or summarized question asked",
      "response": "Response or answer given",
      "askedBy": "Name of person who asked or Not specified"
    }
  ],
  "decisions": [
    {
      "decision": "Confirmed decision",
      "rationale": "Explicit reason or rationale stated in meeting"
    }
  ],
  "actionItems": [
    {
      "task": "Specific actionable deliverable",
      "owner": "Person name or Unassigned",
      "deadline": "Deadline or Not specified",
      "priority": "High | Medium | Low",
      "status": "Pending"
    }
  ],
  "pendingIssues": ["Unresolved question or pending item"],
  "followUpMeeting": {
    "details": "Follow-up meeting summary or Not specified",
    "date": "Date of next meeting or Not specified",
    "time": "Time of next meeting or Not specified",
    "agenda": "Topics for next meeting or Not specified"
  },
  "conclusion": "Final wrap-up summary and outcome of the meeting"
}`;

  let prepSection = '';
  if (preparation && typeof preparation === 'object') {
    const parts = [];
    if (preparation.personName) parts.push(`TARGET PARTICIPANT: ${preparation.personName}`);
    if (preparation.purpose) parts.push(`PURPOSE: ${preparation.purpose}`);
    if (Array.isArray(preparation.agenda) && preparation.agenda.length > 0) parts.push(`PREPARED AGENDA: ${preparation.agenda.join('; ')}`);
    if (preparation.desiredOutcome) parts.push(`DESIRED OUTCOME: ${preparation.desiredOutcome}`);
    if (parts.length > 0) {
      prepSection = `MEETING PREPARATION CONTEXT:\n${parts.join('\n')}\n\n`;
    }
  }

  const userContent = `${prepSection}PROVIDED TITLE: ${title || existingIntel?.title || 'Not specified'}
MEETING DATE: ${meetingDate || existingIntel?.date || 'Not specified'}
DEPARTMENT: ${department || existingIntel?.department || 'General'}

TRANSCRIPT:
"""
${text}
"""`;

  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    config.geminiModel,
  ].filter(Boolean);

  const uniqueModels = Array.from(new Set(candidateModels));
  let lastError = null;

  for (const modelName of uniqueModels) {
    try {
      console.log(`[MomService] Calling Gemini API (${modelName}) for Minutes of Meeting...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini MoM API call timed out after 20s`)), 20000)
      );

      const generatePromise = client.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }
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
        throw new Error('Received empty text response from Gemini API');
      }

      const cleanedText = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsedData = JSON.parse(cleanedText);

      return sanitizeMomOutput(parsedData, fallbackContext);
    } catch (err) {
      lastError = err;
      console.warn(`[MomService] Model ${modelName} notice: ${err.message?.slice(0, 100)}`);
      continue;
    }
  }

  console.warn(`[MomService] All AI models unavailable (${lastError?.message?.slice(0, 80)}). Falling back to rule-based MoM generator.`);
  return extractMomWithRuleFallback(fallbackContext);
}
