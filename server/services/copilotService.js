import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

let genAIClient = null;

function getGenAIClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[CopilotService] Failed to initialize GoogleGenAI client:', err.message);
    }
  }
  return genAIClient;
}

/**
 * Intelligent deterministic fallback for Co-Pilot progress & suggestions.
 * Guarantees zero failures if Gemini API is unreachable, rate limited, or during testing.
 */
export function generateCopilotFallback({
  agenda = [],
  purpose = '',
  desiredOutcome = '',
  personName = '',
  transcript = '',
  currentTopicStatuses = {},
}) {
  const text = (transcript || '').toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  const completionKeywords = [
    'agree', 'agreed', 'decided', 'done', 'finish', 'finished', 'completed',
    'confirmed', 'approved', 'signed off', 'resolved', 'will do', 'will handle',
    'settled', 'concluded', 'wrapped up', 'finalized', 'ok with that', 'deal',
    'allocated', 'allocated $', 'approved and confirmed', 'let\'s sync', 'next steps'
  ];

  const inProgressKeywords = [
    'discussing', 'talking about', 'looking into', 'what about', 'how about',
    'considering', 'reviewing', 'evaluating', 'thinking', 'working on', 'current status',
    'explore', 'starting with', 'let\'s start'
  ];

  // Specific semantic domain vocabularies to identify discussion of common agenda topics
  const domainKeywordMap = {
    'business challenges': ['challenge', 'challenges', 'bottleneck', 'bottlenecks', 'problem', 'problems', 'delay', 'delays', 'issue', 'issues', 'manual', 'friction', 'pain point'],
    'ai automation opportunities': ['ai', 'automation', 'automate', 'agent', 'agents', 'triage', 'categorization', 'replies', 'llm', 'model', 'bot', 'workflow'],
    'budget and timeline': ['budget', 'timeline', '$', 'allocated', 'cost', 'costs', 'pricing', 'weeks', 'months', 'deadline', 'timeframe', 'schedule'],
    'next steps': ['next step', 'next steps', 'contract', 'friday', 'monday', 'assign', 'assigned', 'prepare', 'staging', 'sync', 'follow-up', 'action item'],
  };

  const agendaProgress = agenda.map((topic) => {
    const rawTopic = String(topic).trim();
    const cleanLowerTopic = rawTopic.toLowerCase();
    const previousStatus = currentTopicStatuses[rawTopic] || 'Pending';

    // If already marked Discussed, preserve it
    if (previousStatus === 'Discussed') {
      return {
        topic: rawTopic,
        status: 'Discussed',
        notes: 'Topic discussed and agreed upon in the session.',
      };
    }

    const topicWords = cleanLowerTopic
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let matchCount = 0;
    for (const w of topicWords) {
      if (text.includes(w)) {
        matchCount++;
      }
    }

    // Check domain synonyms if available
    let domainMatches = 0;
    for (const [key, synonyms] of Object.entries(domainKeywordMap)) {
      if (cleanLowerTopic.includes(key) || key.includes(cleanLowerTopic)) {
        for (const syn of synonyms) {
          if (text.includes(syn)) domainMatches++;
        }
      }
    }

    const hasDirectMention = cleanLowerTopic.length > 3 && text.includes(cleanLowerTopic);
    const hasWordRatio = topicWords.length > 0 && matchCount / topicWords.length >= 0.4;
    const isTopicTouched = hasDirectMention || hasWordRatio || domainMatches >= 2;

    let status = previousStatus;
    let notes = 'Not yet discussed in the conversation.';

    if (words.length >= 5 && isTopicTouched) {
      // Find nearby context for completion evidence
      let topicIndex = text.indexOf(cleanLowerTopic);
      if (topicIndex === -1 && topicWords.length > 0) {
        topicIndex = text.indexOf(topicWords[0]);
      }
      if (topicIndex === -1) topicIndex = 0;

      const nearbyWindow = text.slice(Math.max(0, topicIndex - 120), Math.min(text.length, topicIndex + 300));
      const hasCompletionWord = completionKeywords.some((ck) => nearbyWindow.includes(ck) || text.includes(ck));
      const hasProgressWord = inProgressKeywords.some((pk) => nearbyWindow.includes(pk));

      // Require substantive evidence for Discussed (not just a single passing word)
      if (hasCompletionWord && (domainMatches >= 1 || matchCount >= 1 || hasDirectMention)) {
        status = 'Discussed';
        notes = 'Topic addressed and commitments or agreements were established.';
      } else if (hasProgressWord || isTopicTouched) {
        status = 'In Progress';
        notes = 'Currently active or touched in conversation; awaiting final alignment.';
      }
    }

    return {
      topic: rawTopic,
      status,
      notes,
    };
  });

  const topicsLeftCount = agendaProgress.filter((p) => p.status !== 'Discussed').length;
  const pendingTopics = agendaProgress.filter((p) => p.status === 'Pending').map((p) => p.topic);
  const inProgressTopics = agendaProgress.filter((p) => p.status === 'In Progress').map((p) => p.topic);

  // Generate contextual next questions (targeting pending topics and avoiding already discussed topics)
  const nextQuestions = [];
  if (inProgressTopics.length > 0) {
    const active = inProgressTopics[0];
    nextQuestions.push(`Regarding "${active}", what is the concrete deliverable and agreed owner?`);
    nextQuestions.push(`Are there any potential risks or dependencies before finalizing "${active}"?`);
  } else if (pendingTopics.length > 0) {
    const nextTopic = pendingTopics[0];
    nextQuestions.push(`Let's transition to "${nextTopic}". ${personName ? `${personName}, ` : ''}what is the proposal on this?`);
    if (pendingTopics.length > 1) {
      nextQuestions.push(`How does our timeline for "${nextTopic}" align with "${pendingTopics[1]}"?`);
    }
  }

  if (desiredOutcome && nextQuestions.length < 3) {
    nextQuestions.push(`To ensure we hit our outcome of "${desiredOutcome}", what is our confirmed immediate next step?`);
  }

  if (nextQuestions.length === 0) {
    nextQuestions.push('Are there any other open questions or unassigned action items before we conclude?');
    nextQuestions.push('Can everyone confirm their respective deadlines and owners for the deliverables?');
  }

  // Generate contextual talking points
  const talkingPoints = [];
  if (pendingTopics.length > 0) {
    talkingPoints.push(`Cover remaining planned topic: "${pendingTopics[0]}" before wrapping up.`);
  }
  if (purpose) {
    talkingPoints.push(`Keep alignment with session purpose: "${purpose}".`);
  }
  if (desiredOutcome) {
    talkingPoints.push(`Verify that assigned deliverables satisfy: "${desiredOutcome}".`);
  }
  if (talkingPoints.length < 2) {
    talkingPoints.push('Summarize assigned owners and delivery dates verbatim before adjourning.');
  }

  const coveredCount = agendaProgress.filter(p => p.status === 'Discussed').length;

  return {
    agendaProgress,
    topicsLeftCount,
    metrics: {
      totalTopics: agenda.length,
      coveredTopicsCount: coveredCount,
      inProgressTopicsCount: progress.filter(p => p.status === 'In Progress').length,
      topicsLeftCount,
      progressPercentage: Math.round((coveredCount / Math.max(1, agenda.length)) * 100),
    },
    suggestions: {
      nextQuestions: nextQuestions.slice(0, 3),
      talkingPoints: talkingPoints.slice(0, 3),
    },
    summarySoFar: words.length > 10
      ? `Conversation covers ${coveredCount} of ${agenda.length} discussed topics.`
      : 'Meeting in progress. Live dialogue is being monitored.',
    source: 'heuristic_fallback',
  };
}

/**
 * Live Co-Pilot Analysis using Gemini with deterministic fallback
 */
export async function analyzeCopilotProgress({
  agenda = [],
  purpose = '',
  desiredOutcome = '',
  personName = '',
  transcript = '',
  currentTopicStatuses = {},
}) {
  if (!Array.isArray(agenda) || agenda.length === 0) {
    return {
      active: false,
      message: 'No agenda topics provided in meeting preparation. Live AI Co-Pilot is standing by.',
      agendaProgress: [],
      topicsLeftCount: 0,
      metrics: {
        totalTopics: 0,
        coveredTopicsCount: 0,
        inProgressTopicsCount: 0,
        topicsLeftCount: 0,
        progressPercentage: 0,
      },
      suggestions: { nextQuestions: [], talkingPoints: [] },
      summarySoFar: '',
    };
  }

  const cleanTranscript = (transcript || '').trim();

  // If transcript is very short or empty, provide instant initial guidance without API round-trip
  if (cleanTranscript.length < 25) {
    return generateCopilotFallback({
      agenda,
      purpose,
      desiredOutcome,
      personName,
      transcript: cleanTranscript,
      currentTopicStatuses,
    });
  }

  const client = getGenAIClient();
  const hasKey = Boolean(
    config.geminiApiKey &&
    config.geminiApiKey.trim() !== '' &&
    config.geminiApiKey !== 'your_gemini_api_key_here'
  );

  if (!client || !hasKey) {
    console.log('[CopilotService] Gemini key not present; using deterministic NLP engine.');
    return generateCopilotFallback({
      agenda,
      purpose,
      desiredOutcome,
      personName,
      transcript: cleanTranscript,
      currentTopicStatuses,
    });
  }

  const prompt = `You are a real-time AI Meeting Co-Pilot assisting an executive or team lead during an active meeting.
Analyze the current live transcript against the pre-meeting preparation agenda.

CONTEXT:
- Meeting Counterparty: ${personName || 'Meeting attendee'}
- Meeting Purpose: ${purpose || 'Alignment and collaboration'}
- Desired Outcome: ${desiredOutcome || 'Agree on clear deliverables and timelines'}

PLANNED AGENDA TOPICS (WITH CURRENT STATUS):
${agenda.map((t, i) => `${i + 1}. "${t}" (Current status: ${currentTopicStatuses[t] || 'Pending'})`).join('\n')}

CURRENT LIVE TRANSCRIPT SO FAR:
"""
${cleanTranscript}
"""

YOUR INSTRUCTIONS:
1. For each topic in the PLANNED AGENDA TOPICS list:
   - Determine its status based on conversational evidence in the transcript:
     * "Discussed": Covered substantively; decisions, concrete plans, timelines, commitments, or clear outcomes were established.
     * "In Progress": Currently being discussed or introduced, but not yet concluded.
     * "Pending": Has not yet been addressed in the conversation.
   - SUBSTANCE RULE: Do NOT mark a topic "Discussed" simply because a similar word was mentioned in passing. Require meaningful discussion.
   - PRESERVATION RULE: If a topic was already marked "Discussed" in the (Current status), PRESERVE "Discussed" unless the conversation explicitly reopens it.
   - Provide a concise 1-sentence note for each topic explaining what was covered or what remains.
2. Formulate 2-3 "nextQuestions":
   - Concise, high-value, actionable questions the host should ask next.
   - Target pending and in-progress topics and guide the meeting toward the Desired Outcome.
   - STRICT CONSTRAINT: Never suggest questions that have already been clearly answered in the transcript!
3. Formulate 2-3 "talkingPoints":
   - Brief tactical suggestions, reminders, or transitions for the host.
4. Calculate "topicsLeftCount" (sum of Pending and In Progress topics).
5. Provide a 1-sentence "summarySoFar".

Output STRICT JSON matching this schema:
{
  "agendaProgress": [
    {
      "topic": "Topic text exact match",
      "status": "Pending" | "In Progress" | "Discussed",
      "notes": "Short status explanation"
    }
  ],
  "topicsLeftCount": 1,
  "suggestions": {
    "nextQuestions": ["Question 1", "Question 2"],
    "talkingPoints": ["Point 1", "Point 2"]
  },
  "summarySoFar": "Brief summary of progress"
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
  let lastError = null;

  for (const modelName of uniqueModels) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Copilot call timed out on ${modelName}`)), 12000)
      );

      const generatePromise = client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      let textResponse = '';
      if (response && response.text) {
        textResponse = typeof response.text === 'function' ? response.text() : response.text;
      } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        textResponse = response.candidates[0].content.parts[0].text;
      }

      if (!textResponse || textResponse.trim().length === 0) {
        throw new Error('Empty response from model');
      }

      const parsed = JSON.parse(textResponse);

      // Validate structure, guarantee all original agenda topics exist, and preserve progress
      const validatedProgress = agenda.map((topic) => {
        const rawTopic = String(topic);
        const previousStatus = currentTopicStatuses[rawTopic] || 'Pending';
        const found = (parsed.agendaProgress || []).find(
          (p) => (p.topic || '').toLowerCase() === rawTopic.toLowerCase()
        );

        let newStatus = found && ['Pending', 'In Progress', 'Discussed'].includes(found.status)
          ? found.status
          : previousStatus;

        // Never downgrade an already Discussed topic back to Pending or In Progress
        if (previousStatus === 'Discussed') {
          newStatus = 'Discussed';
        }

        return {
          topic: rawTopic,
          status: newStatus,
          notes: found?.notes || (newStatus === 'Discussed' ? 'Covered and aligned in session.' : 'Topic pending discussion.'),
        };
      });

      const leftCount = validatedProgress.filter((p) => p.status !== 'Discussed').length;

      const coveredCount = validatedProgress.filter((p) => p.status === 'Discussed').length;

      return {
        active: true,
        agendaProgress: validatedProgress,
        topicsLeftCount: leftCount,
        metrics: {
          totalTopics: agenda.length,
          coveredTopicsCount: coveredCount,
          inProgressTopicsCount: validatedProgress.filter((p) => p.status === 'In Progress').length,
          topicsLeftCount: leftCount,
          progressPercentage: Math.round((coveredCount / Math.max(1, agenda.length)) * 100),
        },
        suggestions: {
          nextQuestions: Array.isArray(parsed.suggestions?.nextQuestions)
            ? parsed.suggestions.nextQuestions.slice(0, 3)
            : [],
          talkingPoints: Array.isArray(parsed.suggestions?.talkingPoints)
            ? parsed.suggestions.talkingPoints.slice(0, 3)
            : [],
        },
        summarySoFar: parsed.summarySoFar || 'Meeting progress updated.',
        source: `gemini (${modelName})`,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[CopilotService] Model ${modelName} notice: ${err.message?.slice(0, 100)}`);
      continue;
    }
  }

  console.warn('[CopilotService] Falling back to deterministic copilot engine:', lastError?.message);
  return generateCopilotFallback({
    agenda,
    purpose,
    desiredOutcome,
    personName,
    transcript: cleanTranscript,
    currentTopicStatuses,
  });
}

