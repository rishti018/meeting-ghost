import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

let genAIClient = null;

function getClient() {
  if (!genAIClient && config.geminiApiKey) {
    try {
      genAIClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
    } catch (err) {
      console.error('[AudioService] Failed to init client:', err.message);
    }
  }
  return genAIClient;
}

/**
 * Normalize audio MIME types for Gemini multimodal compatibility
 */
function normalizeMimeType(mimeType, fileName = '') {
  const m = (mimeType || '').toLowerCase();
  const f = (fileName || '').toLowerCase();

  if (m.includes('wav') || f.endsWith('.wav')) return 'audio/wav';
  if (m.includes('mp3') || m.includes('mpeg') || f.endsWith('.mp3')) return 'audio/mp3';
  if (m.includes('m4a') || m.includes('mp4') || f.endsWith('.m4a') || f.endsWith('.mp4')) return 'audio/m4a';
  if (m.includes('webm') || f.endsWith('.webm')) return 'audio/webm';
  if (m.includes('ogg') || f.endsWith('.ogg')) return 'audio/ogg';

  return 'audio/mp3';
}

/**
 * Transcribe an uploaded audio buffer using Gemini Multimodal Audio
 * Validates audio file, handles size limit (max 25MB), and tries candidate models with timeouts.
 */
export async function transcribeAudioBuffer({ buffer, mimeType, originalName }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('No audio data received. Please provide a non-empty audio recording or file.');
  }

  const client = getClient();
  const hasKey = Boolean(
    config.geminiApiKey &&
    config.geminiApiKey.trim() !== '' &&
    config.geminiApiKey !== 'your_gemini_api_key_here'
  );

  if (!client || !hasKey) {
    throw new Error('Gemini API key is required on the server to transcribe audio recordings. Please set GEMINI_API_KEY in server/.env or enter the transcript manually in the text editor.');
  }

  // Size limit check (25MB)
  const MAX_SIZE = 25 * 1024 * 1024;
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Audio file exceeds the maximum permitted size of 25MB (Received: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const normalizedMime = normalizeMimeType(mimeType, originalName);
  const base64Data = buffer.toString('base64');

  const prompt = `You are a professional audio transcriber and meeting transcriptionist.
Accurately transcribe all spoken dialogue and speech from this audio recording verbatim.
Format speaker turns clearly if multiple speakers are detected (e.g. "Speaker 1:", "Aryan:", "Priya:").
Do not summarize, embellish, or omit spoken commitments, tasks, dates, or decisions.
Output ONLY the clean, verbatim transcript text without meta-commentary or preamble.`;

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

  console.log(`[AudioService] Transcribing audio (${originalName || 'recording'}, ${(buffer.length / 1024).toFixed(1)} KB, MIME: ${normalizedMime})...`);

  for (const modelName of uniqueModels) {
    try {
      console.log(`[AudioService] Calling Gemini audio transcription (${modelName})...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Audio transcription timed out after 18s on ${modelName}`)), 18000)
      );

      const generatePromise = client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: normalizedMime,
                }
              },
              { text: prompt }
            ]
          }
        ]
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      let transcript = '';
      if (response && response.text) {
        transcript = typeof response.text === 'function' ? response.text() : response.text;
      } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        transcript = response.candidates[0].content.parts[0].text;
      }

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Received empty transcript text from AI model.');
      }

      console.log(`[AudioService] Successfully transcribed audio via ${modelName} (${transcript.trim().split(/\s+/).length} words).`);

      return {
        transcript: transcript.trim(),
        mimeType: normalizedMime,
        fileName: originalName || 'recorded_audio.webm',
        fileSizeBytes: buffer.length,
        modelUsed: modelName,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[AudioService] Model ${modelName} notice: ${err.message?.slice(0, 120)}`);
      continue;
    }
  }

  console.error('[AudioService] All transcription models exhausted:', lastError?.message);
  throw new Error(`Audio transcription failed: ${lastError?.message || 'Unable to transcribe audio.'}`);
}
