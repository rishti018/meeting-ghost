import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

let genAIClient = null;

function getGenAIClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[GeminiService] Failed to initialize GoogleGenAI client:', err.message);
    }
  }
  return genAIClient;
}

export function isGeminiConfigured() {
  return Boolean(
    config.geminiApiKey &&
    config.geminiApiKey.trim() !== '' &&
    config.geminiApiKey !== 'your_gemini_api_key_here'
  );
}

/**
 * Intelligent deterministic dialogue & NLP extraction engine
 * Accurately extracts commitments, speaker promises (I'll finish, I'll complete, I'll add),
 * team tasks (everyone should test), decisions, and deadlines.
 */
export function extractWithRuleFallback(transcript, providedTitle, providedDate) {
  const text = (transcript || '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const actionItems = [];
  const decisions = [];
  const keyPoints = [];
  const followUpAgenda = [];

  const yearMatch = providedDate ? String(providedDate).match(/\d{4}/) : null;
  const inferredYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

  function formatDeadline(rawDeadline) {
    if (!rawDeadline) return 'Not specified';
    let d = rawDeadline.trim()
      .replace(/^by\s+/i, '')
      .replace(/^before\s+/i, '')
      .replace(/[.,;:]$/, '')
      .trim();

    if (/^[A-Za-z]+\s+\d{1,2}$/i.test(d)) {
      d = `${d}, ${inferredYear}`;
    }
    return d || 'Not specified';
  }

  function cleanTaskText(task) {
    let t = task.trim()
      .replace(/^to\s+/i, '')
      .replace(/^that\s+/i, '')
      .replace(/[.,;:]$/, '')
      .trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function assignPriority(taskText) {
    if (/api|backend|database|security|mongodb|ingestion|urgent|critical/i.test(taskText)) {
      return 'High';
    }
    if (/ui|design|frontend|dashboard|library/i.test(taskText)) {
      return 'High';
    }
    return 'Medium';
  }

  for (const line of lines) {
    let speaker = null;
    let speakerRole = null;
    let content = line;

    // Detect speaker prefix: "Aryan (Backend Developer): ...", "Aryan: ...", "[Aryan]: ..."
    const speakerMatch = line.match(/^\[?([A-Za-z0-9\s]+?)\]?(?:\s*\(([^)]+)\))?\s*:\s*(.*)$/);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      speakerRole = speakerMatch[2] ? speakerMatch[2].trim() : null;
      content = speakerMatch[3].trim();
    }

    const sentences = content.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);

    for (const rawSentence of sentences) {
      const s = rawSentence.trim().replace(/[.?!]$/, '');

      // 1. Confirmed Decisions e.g. "We have also decided to use MongoDB Atlas as our primary database instead of MySQL"
      if (/(?:decided to|agreed to use|chosen|we have (?:also )?decided to)\s+(.+)/i.test(s)) {
        const decMatch = s.match(/(?:decided to|agreed to use|chosen|we have (?:also )?decided to)\s+(.+?)(?:instead of\s+([^,.]+))?$/i);
        let decisionText = s;
        if (decMatch) {
          const mainChoice = decMatch[1].trim();
          const alt = decMatch[2] ? ` instead of ${decMatch[2].trim()}` : '';
          decisionText = mainChoice.charAt(0).toUpperCase() + mainChoice.slice(1) + alt;
          if (!decisionText.toLowerCase().startsWith('use') && !decisionText.toLowerCase().startsWith('adopt')) {
            decisionText = `Use ${decisionText}`;
          }
        }
        decisions.push({
          decision: decisionText,
          rationale: 'Explicitly agreed upon during the meeting',
        });
        keyPoints.push(`Decision made: ${decisionText}`);
        continue;
      }

      // 2. Follow-up review agenda e.g. "Let's review progress on November 5"
      if (/let's review|will review|review progress|next meeting/i.test(s) && !/everyone should/i.test(s)) {
        followUpAgenda.push(s.charAt(0).toUpperCase() + s.slice(1));
        keyPoints.push(s);
        continue;
      }

      // 3. Team-wide commitments e.g. "Before then, everyone should test their features and report any blockers in the team chat."
      const teamMatch = s.match(/(?:before\s+then,?\s*)?everyone\s+should\s+(.+?)(?:\s+(?:before|by)\s+(.+))?$/i);
      if (teamMatch) {
        let taskRaw = teamMatch[1].trim();
        let rawDeadline = teamMatch[2] ? teamMatch[2].trim() : null;

        if (/before\s+then/i.test(s) && followUpAgenda.length > 0) {
          const lastAgenda = followUpAgenda[followUpAgenda.length - 1];
          const dateInAgenda = lastAgenda.match(/(?:on|by|before)\s+([A-Za-z]+\s+\d{1,2})/i);
          if (dateInAgenda) {
            rawDeadline = dateInAgenda[1];
            taskRaw = `${taskRaw} before the ${rawDeadline} review`;
          }
        }

        actionItems.push({
          task: cleanTaskText(taskRaw),
          owner: 'Everyone',
          deadline: rawDeadline ? formatDeadline(rawDeadline) : 'Not specified',
          priority: 'Medium',
          status: 'Pending',
        });
        keyPoints.push(`Everyone: ${cleanTaskText(taskRaw)}`);
        continue;
      }

      // 4. First-person speaker commitments e.g. "I'll finish...", "I'll complete...", "I'll integrate...", "I'll add...", "I'll ensure..."
      if (speaker && /^(?:I'll|I will|I am going to|I'm going to)\s+(.+)/i.test(s)) {
        const firstPersonMatch = s.match(/^(?:I'll|I will|I am going to|I'm going to)\s+(.+?)(?:\s+(?:by|due|before)\s+([A-Za-z0-9\s,]+))?$/i);
        if (firstPersonMatch) {
          let taskPart = firstPersonMatch[1].trim();
          let deadlinePart = firstPersonMatch[2] ? firstPersonMatch[2].trim() : null;

          // Check if "by [date]" was included in taskPart
          const inlineDeadline = taskPart.match(/(.+?)\s+by\s+([A-Za-z0-9\s,]+)$/i);
          if (inlineDeadline && !deadlinePart) {
            taskPart = inlineDeadline[1].trim();
            deadlinePart = inlineDeadline[2].trim();
          }

          actionItems.push({
            task: cleanTaskText(taskPart),
            owner: speaker,
            deadline: formatDeadline(deadlinePart),
            priority: assignPriority(taskPart),
            status: 'Pending',
          });
          keyPoints.push(`${speaker} committed to ${taskPart.toLowerCase()}`);
          continue;
        }
      }

      // 5. Third-person commitments e.g. "Priya will finish the UI design by Wednesday"
      const thirdPersonMatch = s.match(/^([A-Z][a-z]+)\s+will\s+(.+?)(?:\s+(?:by|before)\s+([A-Za-z0-9\s,]+))?$/i);
      if (thirdPersonMatch) {
        const person = thirdPersonMatch[1].trim();
        const taskPart = thirdPersonMatch[2].trim();
        const deadlinePart = thirdPersonMatch[3] ? thirdPersonMatch[3].trim() : null;

        actionItems.push({
          task: cleanTaskText(taskPart),
          owner: person,
          deadline: formatDeadline(deadlinePart),
          priority: assignPriority(taskPart),
          status: 'Pending',
        });
        keyPoints.push(`${person} will ${taskPart.toLowerCase()}`);
        continue;
      }

      // General note
      if (s.length > 15 && !s.toLowerCase().startsWith('good') && !s.toLowerCase().startsWith('let\'s finalize')) {
        keyPoints.push(s);
      }
    }
  }

  // Generate title if not provided
  let title = (providedTitle && providedTitle.trim().length > 0)
    ? providedTitle.trim()
    : 'Team Alignment & Project Sync';

  if (!providedTitle) {
    if (decisions.length > 0) {
      title = `${decisions[0].decision.slice(0, 40)} & Sprint Sync`;
    } else if (actionItems.length > 0) {
      title = `Sprint Planning: ${actionItems.length} Key Deliverables`;
    }
  }

  const summary = `The meeting covered ${actionItems.length} action item(s) and ${decisions.length} confirmed decision(s). Key responsibilities were allocated and follow-up priorities established.`;

  const detailedSummary = `In this session, participants aligned on core deliverables and project architectural choices. ${
    actionItems.map(a => `${a.owner} committed to ${a.task.toLowerCase()} (Deadline: ${a.deadline})`).join('. ')
  }. ${
    decisions.map(d => `The team confirmed: "${d.decision}" (${d.rationale})`).join('. ')
  }. ${
    followUpAgenda.length > 0 ? `Follow-up items for the upcoming session include: ${followUpAgenda.join(', ')}.` : ''
  }`;

  return {
    title,
    summary,
    detailedSummary,
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Discussion completed successfully.'],
    actionItems,
    decisions,
    followUpAgenda: followUpAgenda.length > 0 ? followUpAgenda : ['Review milestone progress in next meeting'],
    transcript: text,
  };
}

/**
 * Validate and sanitize structured AI response against schema
 */
export function validateAndSanitizeOutput(data, rawTranscript, providedTitle, providedDate) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI analysis produced empty or non-object output');
  }

  const title = (data.title && typeof data.title === 'string' && data.title.trim().length > 0)
    ? data.title.trim()
    : (providedTitle && providedTitle.trim().length > 0 ? providedTitle.trim() : 'Meeting Intelligence Report');

  const summary = (data.summary && typeof data.summary === 'string' && data.summary.trim().length > 0)
    ? data.summary.trim()
    : 'Meeting summary extracted from transcript.';

  const detailedSummary = (data.detailedSummary && typeof data.detailedSummary === 'string' && data.detailedSummary.trim().length > 0)
    ? data.detailedSummary.trim()
    : summary;

  const keyPoints = Array.isArray(data.keyPoints)
    ? data.keyPoints.filter(p => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
    : [];

  const yearMatch = providedDate ? String(providedDate).match(/\d{4}/) : null;
  const inferredYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

  function sanitizeDeadline(rawDeadline) {
    if (!rawDeadline) return 'Not specified';
    let d = String(rawDeadline).trim()
      .replace(/^by\s+/i, '')
      .replace(/^before\s+/i, '')
      .replace(/[.,;:]$/, '')
      .trim();

    if (/^[A-Za-z]+\s+\d{1,2}$/i.test(d)) {
      d = `${d}, ${inferredYear}`;
    }
    return d || 'Not specified';
  }

  const rawActionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
  let actionItems = rawActionItems.map(item => ({
    task: (item.task && typeof item.task === 'string' && item.task.trim().length > 0) ? item.task.trim() : 'Unspecified task',
    owner: (item.owner && typeof item.owner === 'string' && item.owner.trim().length > 0) ? item.owner.trim() : 'Unassigned',
    deadline: sanitizeDeadline(item.deadline),
    priority: ['High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
    status: ['Pending', 'In Progress', 'Completed'].includes(item.status) ? item.status : 'Pending',
  }));

  // If AI extracted 0 action items but the transcript clearly contains speaker commitments ("I'll", "will", "everyone should"),
  // cross-check with deterministic extractor to guarantee no deliverables are dropped.
  if (actionItems.length === 0 && rawTranscript) {
    const fallbackData = extractWithRuleFallback(rawTranscript, providedTitle, providedDate);
    if (fallbackData.actionItems.length > 0) {
      console.log(`[GeminiService] AI returned 0 action items; recovering ${fallbackData.actionItems.length} commitments from transcript analysis.`);
      actionItems = fallbackData.actionItems;
    }
  }

  const rawDecisions = Array.isArray(data.decisions) ? data.decisions : [];
  let decisions = rawDecisions.map(d => ({
    decision: (d.decision && typeof d.decision === 'string' && d.decision.trim().length > 0) ? d.decision.trim() : 'Recorded decision',
    rationale: (d.rationale && typeof d.rationale === 'string' && d.rationale.trim().length > 0) ? d.rationale.trim() : 'Agreed upon in discussion',
  }));

  if (decisions.length === 0 && rawTranscript) {
    const fallbackData = extractWithRuleFallback(rawTranscript, providedTitle, providedDate);
    if (fallbackData.decisions.length > 0) {
      decisions = fallbackData.decisions;
    }
  }

  const rawFollowUp = Array.isArray(data.followUpAgenda) ? data.followUpAgenda : [];
  let followUpAgenda = rawFollowUp.filter(a => typeof a === 'string' && a.trim().length > 0).map(a => a.trim());

  if (followUpAgenda.length === 0 && rawTranscript) {
    const fallbackData = extractWithRuleFallback(rawTranscript, providedTitle, providedDate);
    if (fallbackData.followUpAgenda.length > 0) {
      followUpAgenda = fallbackData.followUpAgenda;
    }
  }

  return {
    title,
    summary,
    detailedSummary,
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Review meeting transcript for general discussion details.'],
    actionItems,
    decisions,
    followUpAgenda: followUpAgenda.length > 0 ? followUpAgenda : ['Review action items in next check-in'],
    transcript: (rawTranscript || '').trim(),
  };
}

/**
 * Main meeting analysis function using official @google/genai SDK
 * with automatic model discovery and resilient extraction fallback
 */
export async function analyzeMeetingTranscript({ transcript, title, meetingDate, preparation }) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript cannot be empty');
  }

  const client = getGenAIClient();

  if (!client || !isGeminiConfigured()) {
    console.log('[GeminiService] GEMINI_API_KEY not configured or offline. Utilizing dialogue extraction engine.');
    return extractWithRuleFallback(transcript, title, meetingDate);
  }

  const systemPrompt = `You are Meeting Ghost, an expert AI meeting intelligence and transcription analyst.
Analyze the following meeting transcript and produce a strictly valid JSON object matching the requested schema.

CRITICAL ACTION ITEM EXTRACTION RULES:
1. Extract EVERY explicitly stated commitment, deliverable, or assigned task.
2. Recognize commitments made by speakers in dialogue:
   - "I'll finish..." / "I will complete..." -> Owner is the current speaker.
   - "I'll integrate..." / "I'll add..." / "I'll ensure..." -> Owner is the current speaker.
   - "[Person] will [task]..." / "[Person] to do..." -> Owner is [Person].
   - "Everyone should test..." / "Before then, everyone should..." -> Owner is "Everyone".
   - If a commitment has no identifiable owner, set "owner": "Unassigned".
3. Extract explicitly stated deadlines (e.g. "by November 2", "by November 3", "by Wednesday", "before November 5 review"). If no deadline is stated, set "deadline": "Not specified".
4. NEVER invent task owners, deadlines, or commitments that were not in the transcript.
5. Confirmed decisions (e.g. "decided to use MongoDB Atlas instead of MySQL") belong under "decisions", NOT "actionItems".
6. Follow-up reviews (e.g. "Let's review progress on November 5") belong under "followUpAgenda", NOT "actionItems" unless assigned to an owner.
7. Status MUST default to "Pending".
8. Prioritize with "High", "Medium", or "Low" based on criticality (APIs, DB, architecture, UI deliverables are High).

SCHEMA:
{
  "title": "Clear, professional meeting title",
  "summary": "Concise 1-2 sentence executive summary",
  "detailedSummary": "Comprehensive paragraph summarizing all discussions, deliverables, decisions, and next steps",
  "keyPoints": ["Key discussion point 1", "Key discussion point 2"],
  "actionItems": [
    {
      "task": "Specific task description",
      "owner": "Person name, Everyone, or Unassigned",
      "deadline": "Deadline or Not specified",
      "priority": "High | Medium | Low",
      "status": "Pending"
    }
  ],
  "decisions": [
    {
      "decision": "Confirmed decision",
      "rationale": "Reason explicitly stated in the meeting"
    }
  ],
  "followUpAgenda": ["Topic for next meeting"]
}`;

  let prepSection = '';
  if (preparation && typeof preparation === 'object') {
    const parts = [];
    if (preparation.personName) parts.push(`TARGET PARTICIPANT: ${preparation.personName}`);
    if (preparation.purpose) parts.push(`PURPOSE: ${preparation.purpose}`);
    if (Array.isArray(preparation.agenda) && preparation.agenda.length > 0) parts.push(`DISCUSSION AGENDA: ${preparation.agenda.join('; ')}`);
    if (preparation.desiredOutcome) parts.push(`DESIRED OUTCOME: ${preparation.desiredOutcome}`);
    if (parts.length > 0) {
      prepSection = `MEETING PREPARATION CONTEXT:\n${parts.join('\n')}\n\n`;
    }
  }

  const userContent = `${prepSection}MEETING DATE: ${meetingDate || 'Unknown'}
PROVIDED TITLE: ${title || 'None'}

TRANSCRIPT:
"""
${transcript}
"""`;

  // Candidate models to try in sequence if one experiences high demand (503) or is deprecated (404)
  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-flash-lite-latest',
    config.geminiModel,
  ].filter(Boolean);

  // Remove duplicates
  const uniqueModels = Array.from(new Set(candidateModels));

  let lastError = null;

  for (const modelName of uniqueModels) {
    try {
      console.log(`[GeminiService] Calling Gemini API (${modelName})...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini API call timed out after 15s`)), 15000)
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
        throw new Error('Received empty text from Gemini API');
      }

      const cleanedText = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsedData = JSON.parse(cleanedText);

      return validateAndSanitizeOutput(parsedData, transcript, title, meetingDate);
    } catch (err) {
      lastError = err;
      console.warn(`[GeminiService] Model ${modelName} notice: ${err.message?.slice(0, 100)}`);
      // Try next candidate model
      continue;
    }
  }

  console.warn(`[GeminiService] All AI model calls completed or unavailable (${lastError?.message?.slice(0, 80)}). Falling back to dialogue extraction engine.`);
  return extractWithRuleFallback(transcript, title, meetingDate);
}
