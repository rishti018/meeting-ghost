import { GoogleGenAI } from '@google/genai';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { Meeting } from '../models/Meeting.js';
import { isDbConnected, connectToDatabase } from '../config/db.js';

let genAIClient = null;

function getGenAIClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[SentimentService] Failed to initialize GoogleGenAI client:', err.message);
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

const VALID_SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Mixed'];
const VALID_EMOTIONAL_SIGNALS = [
  'Enthusiasm',
  'Confidence',
  'Uncertainty',
  'Frustration',
  'Concern',
  'Disagreement',
  'None',
  'Insufficient Evidence',
];
const VALID_CONFIDENCES = ['High', 'Medium', 'Low', 'Unknown'];
const VALID_MOMENT_TYPES = ['Agreement', 'Concern', 'Uncertainty', 'Disagreement'];

/**
 * Deterministic rule-based extraction for Speaker Sentiment & Emotion-Aware Intelligence
 * Resilient fallback when Gemini is offline, rate-limited, or unconfigured.
 */
export function extractSentimentWithRuleFallback({
  transcript = '',
  title = '',
  meetingDate = '',
  preparation = {},
  existingIntel = null,
} = {}) {
  const text = (transcript || '').trim();
  if (!text) {
    throw new Error('Transcript cannot be empty for sentiment analysis.');
  }

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Parse lines into dialogue items with speaker, timestamp/segment, and text
  const utterances = [];
  let currentSpeaker = 'Unknown Speaker';

  rawLines.forEach((line, index) => {
    // Check for patterns like:
    // "[00:15] Alice: ..." or "Alice (Lead): ..." or "Alice: ..." or "[Alice]: ..."
    const speakerPrefixRegex = /^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?\[?([A-Za-z0-9_.\s]+?)\]?(?:\s*\([^)]+\))?\s*:\s*(.*)$/;
    const match = line.match(speakerPrefixRegex);

    if (match && match[2] && !/^(?:note|timestamp|time|agenda|decision|action|ai)/i.test(match[2].trim())) {
      const timestamp = match[1] ? `[${match[1]}]` : null;
      currentSpeaker = match[2].trim();
      const content = match[3] ? match[3].trim() : '';
      const segmentRef = timestamp || `Segment ${index + 1}`;
      utterances.push({
        speaker: currentSpeaker,
        segment: segmentRef,
        text: content || line,
        rawLine: line,
      });
    } else {
      // If line contains standalone timestamp prefix like "[01:30] Something..."
      const tsMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
      const segmentRef = tsMatch ? `[${tsMatch[1]}]` : `Segment ${index + 1}`;
      const lineText = tsMatch ? tsMatch[2].trim() : line;
      utterances.push({
        speaker: currentSpeaker,
        segment: segmentRef,
        text: lineText,
        rawLine: line,
      });
    }
  });

  // Emotional keyword patterns
  const enthusiasmWords = /\b(excited|enthusiastic|awesome|amazing|fantastic|great job|thrilled|pumped|love this|super proud|brilliant)\b/i;
  const confidenceWords = /\b(confident|definitely|certainly|absolutely|guarantee|on track|fully covered|under control|smooth sailing|no doubt)\b/i;
  const uncertaintyWords = /\b(not sure|unsure|maybe|perhaps|might|wondering|could be|hesitant|unclear|don't know if|not convinced yet)\b/i;
  const frustrationWords = /\b(frustrated|frustrating|annoyed|blocked|holding us up|again\?|waste of time|fed up|still waiting|stuck on)\b/i;
  const concernWords = /\b(concerned|concern|worried|risk|vulnerable|failing|issue|delay|behind schedule|caution|bottleneck|watch out)\b/i;
  const disagreementWords = /\b(disagree|don't agree|strongly oppose|differently|differ|cannot support|push back|opposed to|not ideal)\b/i;

  const positiveWords = /\b(great|good|excellent|solid|happy|glad|pleased|progress|success|successful|well done|perfect|smooth|effective|achieved|celebrate)\b/i;
  const negativeWords = /\b(bad|terrible|awful|broken|failed|failure|failing|disaster|problem|trouble|critical bug|blocker|worse|wrong)\b/i;

  const observations = [];
  const keyMoments = [];
  const suggestions = [];

  utterances.forEach(u => {
    const t = u.text;
    const hasEnthusiasm = enthusiasmWords.test(t);
    const hasConfidence = confidenceWords.test(t);
    const hasUncertainty = uncertaintyWords.test(t);
    const hasFrustration = frustrationWords.test(t);
    const hasConcern = concernWords.test(t);
    const hasDisagreement = disagreementWords.test(t);

    const hasPos = positiveWords.test(t) || hasEnthusiasm || hasConfidence;
    const hasNeg = negativeWords.test(t) || hasFrustration || hasConcern || hasDisagreement;

    let sentiment = 'Neutral';
    if (hasPos && hasNeg) {
      sentiment = 'Mixed';
    } else if (hasPos) {
      sentiment = 'Positive';
    } else if (hasNeg) {
      sentiment = 'Negative';
    }

    let emotionalSignal = 'None';
    let explanation = 'Communicated standard informational status.';
    let confidence = 'Medium';

    if (hasEnthusiasm) {
      emotionalSignal = 'Enthusiasm';
      explanation = `Expressed strong positive energy regarding discussion points (${u.speaker}).`;
      confidence = 'High';
    } else if (hasFrustration) {
      emotionalSignal = 'Frustration';
      explanation = `Indicated friction or delays that are impeding progress (${u.speaker}).`;
      confidence = 'High';
    } else if (hasConcern) {
      emotionalSignal = 'Concern';
      explanation = `Raised potential operational or technical risks requiring attention (${u.speaker}).`;
      confidence = 'High';
    } else if (hasDisagreement) {
      emotionalSignal = 'Disagreement';
      explanation = `Offered a divergent viewpoint or reservation on proposed approach (${u.speaker}).`;
      confidence = 'High';
    } else if (hasConfidence) {
      emotionalSignal = 'Confidence';
      explanation = `Expressed clarity and high certainty on delivery and next steps (${u.speaker}).`;
      confidence = 'High';
    } else if (hasUncertainty) {
      emotionalSignal = 'Uncertainty';
      explanation = `Expressed hesitation or open questions needing clarification (${u.speaker}).`;
      confidence = 'Medium';
    } else if (sentiment === 'Neutral') {
      emotionalSignal = 'None';
      confidence = 'Low';
    }

    // Only record notable observations or ensure every speaker gets representation
    observations.push({
      speaker: u.speaker,
      segment: u.segment,
      sentiment,
      emotionalSignal,
      quote: u.text.length > 200 ? `${u.text.slice(0, 197)}...` : u.text,
      explanation,
      confidence,
    });

    // Capture Key Moments
    if (hasDisagreement) {
      keyMoments.push({
        type: 'Disagreement',
        speaker: u.speaker,
        segment: u.segment,
        quote: u.text,
        context: 'Divergent technical or workflow preference noted in discussion.',
      });
    } else if (hasConcern) {
      keyMoments.push({
        type: 'Concern',
        speaker: u.speaker,
        segment: u.segment,
        quote: u.text,
        context: 'Operational or timeline vulnerability highlighted.',
      });
    } else if (hasUncertainty) {
      keyMoments.push({
        type: 'Uncertainty',
        speaker: u.speaker,
        segment: u.segment,
        quote: u.text,
        context: 'Clarification required on requirements or ownership.',
      });
    } else if (hasConfidence || hasEnthusiasm || /\b(agree|sounds good|deal|aligned|consensus)\b/i.test(t)) {
      if (keyMoments.length < 8 && (hasEnthusiasm || /\b(agree|aligned|consensus)\b/i.test(t))) {
        keyMoments.push({
          type: 'Agreement',
          speaker: u.speaker,
          segment: u.segment,
          quote: u.text,
          context: 'Consensus or positive alignment affirmed by participants.',
        });
      }
    }

    // Generate constructive emotion-aware workflow suggestions
    if ((hasFrustration || hasConcern) && suggestions.length < 5) {
      suggestions.push({
        trigger: `${u.speaker} voiced concern or friction regarding "${u.text.slice(0, 60)}..."`,
        quote: u.text,
        recommendedAction: `Schedule a targeted follow-up or provide explicit specifications to unblock ${u.speaker}.`,
        rationale: 'Addressing voiced blockers promptly prevents delivery bottlenecks and cross-team dependencies from slipping.',
      });
    } else if (hasUncertainty && suggestions.length < 5) {
      suggestions.push({
        trigger: `${u.speaker} indicated uncertainty on "${u.text.slice(0, 60)}..."`,
        quote: u.text,
        recommendedAction: `Document clear acceptance criteria and confirm dependency commitments in written meeting minutes.`,
        rationale: 'Explicit written confirmation eliminates ambiguity and aligns expectations across stakeholders.',
      });
    } else if (hasDisagreement && suggestions.length < 5) {
      suggestions.push({
        trigger: `Differing viewpoints expressed by ${u.speaker} on "${u.text.slice(0, 60)}..."`,
        quote: u.text,
        recommendedAction: `Hold an architecture review spike to evaluate trade-offs objectively against measurable criteria.`,
        rationale: 'Structured trade-off evaluation de-escalates friction and establishes shared consensus grounded in data.',
      });
    }
  });

  // Calculate Sentiment Distribution
  const totalObs = observations.length || 1;
  const posCount = observations.filter(o => o.sentiment === 'Positive').length;
  const negCount = observations.filter(o => o.sentiment === 'Negative').length;
  const mixCount = observations.filter(o => o.sentiment === 'Mixed').length;
  const neuCount = totalObs - posCount - negCount - mixCount;

  const distribution = {
    positive: Math.round((posCount / totalObs) * 100),
    neutral: Math.round((neuCount / totalObs) * 100),
    negative: Math.round((negCount / totalObs) * 100),
    mixed: Math.round((mixCount / totalObs) * 100),
  };

  // Adjust distribution to ensure sum equals 100
  const sum = distribution.positive + distribution.neutral + distribution.negative + distribution.mixed;
  if (sum !== 100 && totalObs > 0) {
    distribution.neutral += (100 - sum);
  }

  // Aggregate by Speaker
  const speakerMap = new Map();
  observations.forEach(o => {
    if (!speakerMap.has(o.speaker)) {
      speakerMap.set(o.speaker, []);
    }
    speakerMap.get(o.speaker).push(o);
  });

  const speakers = Array.from(speakerMap.entries()).map(([speaker, obsList]) => {
    const sPos = obsList.filter(o => o.sentiment === 'Positive').length;
    const sNeg = obsList.filter(o => o.sentiment === 'Negative').length;
    const sMix = obsList.filter(o => o.sentiment === 'Mixed').length;
    const sNeu = obsList.filter(o => o.sentiment === 'Neutral').length;

    let overallSentiment = 'Neutral';
    if (sMix > 0 || (sPos > 0 && sNeg > 0)) {
      overallSentiment = 'Mixed';
    } else if (sPos > sNeg && sPos >= sNeu) {
      overallSentiment = 'Positive';
    } else if (sNeg > sPos && sNeg >= sNeu) {
      overallSentiment = 'Negative';
    }

    const uniqueSignals = Array.from(new Set(
      obsList
        .map(o => o.emotionalSignal)
        .filter(s => s && s !== 'None' && s !== 'Insufficient Evidence')
    ));

    let summary = `${speaker} participated actively with predominantly ${overallSentiment.toLowerCase()} conversational tone.`;
    if (uniqueSignals.length > 0) {
      summary += ` Displayed cues of ${uniqueSignals.join(', ')}.`;
    }

    return {
      speaker,
      overallSentiment,
      emotionalSignals: uniqueSignals.length > 0 ? uniqueSignals : ['None'],
      observationCount: obsList.length,
      summary,
    };
  });

  // Overall Sentiment Tone
  let overallSentiment = 'Neutral';
  if (distribution.positive > distribution.negative && distribution.positive > distribution.neutral) {
    overallSentiment = 'Positive';
  } else if (distribution.negative > distribution.positive && distribution.negative >= 30) {
    overallSentiment = 'Negative';
  } else if (distribution.mixed > 25 || (distribution.positive > 20 && distribution.negative > 20)) {
    overallSentiment = 'Mixed';
  }

  let conversationalTone = 'Constructive & Collaborative';
  if (distribution.negative >= 40) {
    conversationalTone = 'Challenging with Critical Friction';
  } else if (distribution.mixed >= 30) {
    conversationalTone = 'Deliberative with Diverse Perspectives';
  } else if (distribution.positive >= 50) {
    conversationalTone = 'High-Alignment & Optimistic';
  }

  // Sentiment Shifts across conversation
  const shifts = [];
  if (rawLines.length > 4) {
    const firstHalf = observations.slice(0, Math.floor(observations.length / 2));
    const secondHalf = observations.slice(Math.floor(observations.length / 2));

    const firstPos = firstHalf.filter(o => o.sentiment === 'Positive').length;
    const firstNeg = firstHalf.filter(o => o.sentiment === 'Negative').length;
    const secondPos = secondHalf.filter(o => o.sentiment === 'Positive').length;
    const secondNeg = secondHalf.filter(o => o.sentiment === 'Negative').length;

    if (firstNeg > firstPos && secondPos >= secondNeg) {
      shifts.push({
        fromStage: 'Opening & Problem Scoping',
        toStage: 'Solution Alignment & Next Steps',
        shiftDescription: 'Shifted from initial concerns and blockers to positive resolution and aligned action items.',
        trigger: 'Clarification of technical deliverables and assigned ownership.',
      });
    } else if (firstPos > firstNeg && secondNeg > secondPos) {
      shifts.push({
        fromStage: 'Initial Status Sharing',
        toStage: 'Technical Deep Dive',
        shiftDescription: 'Shifted from initial optimism to critical examination of edge cases and risks.',
        trigger: 'Discovery of unforeseen timeline dependencies and workload bottlenecks.',
      });
    } else {
      shifts.push({
        fromStage: 'Meeting Kickoff',
        toStage: 'Adjournment',
        shiftDescription: 'Maintained steady, focused deliberation throughout agenda topics.',
        trigger: 'Systematic progression through planned meeting discussion items.',
      });
    }
  }

  // If no suggestions generated, add standard constructive facilitation recommendations
  if (suggestions.length === 0) {
    suggestions.push({
      trigger: 'Meeting concluded with broad alignment on core topics.',
      quote: text.slice(0, 100),
      recommendedAction: 'Circulate confirmed action items with deadlines to all participants within 24 hours.',
      rationale: 'Immediate follow-up reinforces accountability and locks in commitment clarity.',
    });
  }

  return {
    conversationalTone,
    overallSentiment,
    distribution,
    speakers,
    observations: observations.slice(0, 50),
    shifts,
    keyMoments: keyMoments.slice(0, 12),
    suggestions: suggestions.slice(0, 6),
    generatedAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Validate and sanitize structured Sentiment output to adhere to strict schema
 */
export function sanitizeSentimentOutput(data, fallbackContext = {}) {
  if (!data || typeof data !== 'object') {
    return extractSentimentWithRuleFallback(fallbackContext);
  }

  const cleanString = (val, fallback = '') => {
    if (typeof val === 'string' && val.trim().length > 0 && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined') {
      return val.trim();
    }
    return fallback;
  };

  const conversationalTone = cleanString(data.conversationalTone, 'Constructive & Collaborative');
  const overallSentiment = VALID_SENTIMENTS.includes(data.overallSentiment)
    ? data.overallSentiment
    : 'Neutral';

  // Distribution
  const rawDist = data.distribution && typeof data.distribution === 'object' ? data.distribution : {};
  let pos = Math.max(0, Math.min(100, Math.round(Number(rawDist.positive) || 0)));
  let neg = Math.max(0, Math.min(100, Math.round(Number(rawDist.negative) || 0)));
  let mix = Math.max(0, Math.min(100, Math.round(Number(rawDist.mixed) || 0)));
  let neu = Math.max(0, Math.min(100, Math.round(Number(rawDist.neutral) || 0)));

  const total = pos + neg + mix + neu;
  if (total === 0) {
    neu = 100;
  } else if (total !== 100) {
    neu = Math.max(0, 100 - (pos + neg + mix));
  }

  const distribution = { positive: pos, neutral: neu, negative: neg, mixed: mix };

  // Speakers
  const speakers = Array.isArray(data.speakers)
    ? data.speakers.map(s => {
        const speaker = cleanString(s?.speaker, 'Unknown Speaker');
        const sSentiment = VALID_SENTIMENTS.includes(s?.overallSentiment) ? s.overallSentiment : 'Neutral';
        const rawSignals = Array.isArray(s?.emotionalSignals) ? s.emotionalSignals : [];
        const emotionalSignals = rawSignals
          .map(sig => cleanString(sig, ''))
          .filter(sig => VALID_EMOTIONAL_SIGNALS.includes(sig));

        return {
          speaker,
          overallSentiment: sSentiment,
          emotionalSignals: emotionalSignals.length > 0 ? emotionalSignals : ['None'],
          observationCount: Math.max(0, parseInt(s?.observationCount, 10) || 0),
          summary: cleanString(s?.summary, `${speaker} participated with ${sSentiment.toLowerCase()} sentiment.`),
        };
      })
    : [];

  // Observations
  const observations = Array.isArray(data.observations)
    ? data.observations.map(o => {
        const obsSentiment = VALID_SENTIMENTS.includes(o?.sentiment) ? o.sentiment : 'Neutral';
        const obsSignal = VALID_EMOTIONAL_SIGNALS.includes(o?.emotionalSignal) ? o.emotionalSignal : 'None';
        const obsConf = VALID_CONFIDENCES.includes(o?.confidence) ? o.confidence : 'Medium';

        return {
          speaker: cleanString(o?.speaker, 'Unknown Speaker'),
          segment: cleanString(o?.segment, 'Segment 1'),
          sentiment: obsSentiment,
          emotionalSignal: obsSignal,
          quote: cleanString(o?.quote, ''),
          explanation: cleanString(o?.explanation, 'Observed conversational statement.'),
          confidence: obsConf,
        };
      }).filter(o => o.quote.length > 0 || o.explanation.length > 0)
    : [];

  // Shifts
  const shifts = Array.isArray(data.shifts)
    ? data.shifts.map(sh => ({
        fromStage: cleanString(sh?.fromStage, 'Discussion Opening'),
        toStage: cleanString(sh?.toStage, 'Discussion Conclusion'),
        shiftDescription: cleanString(sh?.shiftDescription, 'Sentiment evolved as topics were resolved.'),
        trigger: cleanString(sh?.trigger, 'Progression through agenda items.'),
      }))
    : [];

  // Key Moments
  const keyMoments = Array.isArray(data.keyMoments)
    ? data.keyMoments.map(km => {
        const mType = VALID_MOMENT_TYPES.includes(km?.type) ? km.type : 'Agreement';
        return {
          type: mType,
          speaker: cleanString(km?.speaker, 'Unknown Speaker'),
          segment: cleanString(km?.segment, 'Segment 1'),
          quote: cleanString(km?.quote, ''),
          context: cleanString(km?.context, 'Noted discussion highlight.'),
        };
      }).filter(km => km.quote.length > 0 || km.context.length > 0)
    : [];

  // Suggestions
  const suggestions = Array.isArray(data.suggestions)
    ? data.suggestions.map(sug => ({
        trigger: cleanString(sug?.trigger, 'Meeting discussion topic.'),
        quote: cleanString(sug?.quote, ''),
        recommendedAction: cleanString(sug?.recommendedAction, 'Align on next steps in writing.'),
        rationale: cleanString(sug?.rationale, 'Reinforces team transparency and execution momentum.'),
      })).filter(sug => sug.recommendedAction.length > 0)
    : [];

  return {
    conversationalTone,
    overallSentiment,
    distribution,
    speakers,
    observations,
    shifts,
    keyMoments,
    suggestions,
    generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Generate Speaker Sentiment & Emotion-Aware Intelligence using Gemini with multi-model failover & fallback
 */
export async function analyzeSpeakerSentiment({
  transcript = '',
  title = '',
  meetingDate = '',
  preparation = {},
  existingIntel = null,
} = {}) {
  const text = (transcript || '').trim();
  if (!text) {
    throw new Error('Transcript cannot be empty for sentiment analysis.');
  }

  const fallbackContext = {
    transcript: text,
    title,
    meetingDate,
    preparation,
    existingIntel,
  };

  const client = getGenAIClient();
  if (!client || !isGeminiConfigured()) {
    console.log('[SentimentService] Gemini API not configured or offline. Using rule-based sentiment extractor.');
    return extractSentimentWithRuleFallback(fallbackContext);
  }

  const systemPrompt = `You are Meeting Ghost's emotion-aware meeting intelligence engine.
Your task is to analyze the emotional tone, conversational sentiment, and interpersonal dynamics of the meeting conversation based strictly on the provided transcript.

STRICT ACCURACY AND ETHICAL GUIDELINES:
1. ONLY make observations grounded in explicit transcript evidence and dialogue.
2. DO NOT invent or hallucinate speakers, quotes, or emotional states.
3. If speaker names are missing in transcript, use "Unknown Speaker" or segment identifiers.
4. ZERO PSYCHOLOGICAL OR PERFORMANCE DIAGNOSES: Never evaluate an individual's mental health, personality, competence, or employee performance. Focus strictly on meeting communication, alignment, collaboration, and workflow clarity.
5. All recommendations MUST be constructive, non-judgmental, professional next steps (e.g., clarify requirements, schedule architecture review, document agreed decisions).
6. Allowed Sentiment Labels: "Positive", "Neutral", "Negative", "Mixed".
7. Allowed Emotional Signals: "Enthusiasm", "Confidence", "Uncertainty", "Frustration", "Concern", "Disagreement", "None", "Insufficient Evidence".
8. Allowed Confidence Levels: "High", "Medium", "Low", "Unknown".
9. Allowed Key Moment Types: "Agreement", "Concern", "Uncertainty", "Disagreement".
10. Output MUST be valid JSON adhering strictly to the schema below.

JSON OUTPUT SCHEMA:
{
  "conversationalTone": "Descriptive phrase, e.g. Constructive & Collaborative, Tense with Diverging Views, Deliberative & Cautious",
  "overallSentiment": "Positive | Neutral | Negative | Mixed",
  "distribution": {
    "positive": 45,
    "neutral": 35,
    "negative": 10,
    "mixed": 10
  },
  "speakers": [
    {
      "speaker": "Speaker Name or Unknown Speaker",
      "overallSentiment": "Positive | Neutral | Negative | Mixed",
      "emotionalSignals": ["Confidence", "Enthusiasm"],
      "observationCount": 4,
      "summary": "Concise grounded summary of this speaker's communication style and sentiment in this meeting."
    }
  ],
  "observations": [
    {
      "speaker": "Speaker Name or Unknown Speaker",
      "segment": "[01:23] or Segment 1",
      "sentiment": "Positive | Neutral | Negative | Mixed",
      "emotionalSignal": "Enthusiasm | Confidence | Uncertainty | Frustration | Concern | Disagreement | None | Insufficient Evidence",
      "quote": "Direct transcript quote",
      "explanation": "Why this sentiment/signal was identified based on dialogue",
      "confidence": "High | Medium | Low | Unknown"
    }
  ],
  "shifts": [
    {
      "fromStage": "Opening Discussion",
      "toStage": "Architecture Consensus",
      "shiftDescription": "Descriptive shift in team tone",
      "trigger": "What occurred in conversation that prompted the shift"
    }
  ],
  "keyMoments": [
    {
      "type": "Agreement | Concern | Uncertainty | Disagreement",
      "speaker": "Speaker Name",
      "segment": "Timestamp or segment ref",
      "quote": "Direct verbatim quote",
      "context": "Contextual significance of this moment to the meeting outcome"
    }
  ],
  "suggestions": [
    {
      "trigger": "Specific observed uncertainty or concern",
      "quote": "Transcript quote that prompted recommendation",
      "recommendedAction": "Actionable, constructive next step for workflow or facilitation",
      "rationale": "Clear rationale explaining how this recommendation benefits team progress"
    }
  ]
}`;

  let prepSection = '';
  if (preparation && typeof preparation === 'object') {
    const parts = [];
    if (preparation.personName) parts.push(`TARGET PARTICIPANT: ${preparation.personName}`);
    if (preparation.purpose) parts.push(`PURPOSE: ${preparation.purpose}`);
    if (Array.isArray(preparation.agenda) && preparation.agenda.length > 0) parts.push(`AGENDA: ${preparation.agenda.join('; ')}`);
    if (parts.length > 0) {
      prepSection = `MEETING PREPARATION CONTEXT:\n${parts.join('\n')}\n\n`;
    }
  }

  const userContent = `${prepSection}TITLE: ${title || existingIntel?.title || 'Not specified'}
DATE: ${meetingDate || existingIntel?.date || 'Not specified'}

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
      console.log(`[SentimentService] Calling Gemini API (${modelName}) for sentiment analysis...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini sentiment analysis call timed out after 20s')), 20000)
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
      const rawText = response.text ? response.text.trim() : '';

      if (!rawText) {
        throw new Error('Empty response received from Gemini API');
      }

      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // Strip markdown fences if present
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          parsed = JSON.parse(jsonMatch[1].trim());
        } else {
          throw parseErr;
        }
      }

      console.log(`[SentimentService] Successfully generated sentiment analysis using model: ${modelName}`);
      return sanitizeSentimentOutput(parsed, fallbackContext);
    } catch (err) {
      console.warn(`[SentimentService] Model ${modelName} failed: ${err.message}. Trying next fallback...`);
      lastError = err;
    }
  }

  console.error(`[SentimentService] All candidate Gemini models failed. Falling back to rule-based engine. Last error: ${lastError?.message}`);
  return extractSentimentWithRuleFallback(fallbackContext);
}

/**
 * Analyze sentiment for a meeting and persist it to the Meeting document in MongoDB
 */
export async function analyzeAndSaveMeetingSentiment(meetingId, options = {}) {
  if (!meetingId || !mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new Error('Valid meeting ID is required for sentiment analysis.');
  }

  if (!isDbConnected()) {
    await connectToDatabase();
  }

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new Error('Meeting not found');
  }

  const transcript = (meeting.transcript || meeting.rawTranscript || '').trim();
  if (!transcript) {
    throw new Error('Meeting transcript is empty. Cannot analyze sentiment.');
  }

  const sentimentData = await analyzeSpeakerSentiment({
    transcript,
    title: meeting.title,
    meetingDate: meeting.date,
    preparation: meeting.preparation,
    existingIntel: meeting,
    ...options,
  });

  meeting.sentiment = sentimentData;
  await meeting.save();

  return meeting.sentiment;
}

/**
 * Retrieve saved sentiment analysis for a meeting, or optionally generate it if missing
 */
export async function getMeetingSentiment(meetingId, { autoAnalyzeIfMissing = false } = {}) {
  if (!meetingId || !mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new Error('Valid meeting ID is required.');
  }

  if (!isDbConnected()) {
    await connectToDatabase();
  }

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new Error('Meeting not found');
  }

  if (meeting.sentiment && meeting.sentiment.conversationalTone) {
    return meeting.sentiment;
  }

  if (autoAnalyzeIfMissing && meeting.transcript && meeting.transcript.trim()) {
    return await analyzeAndSaveMeetingSentiment(meetingId);
  }

  return null;
}

