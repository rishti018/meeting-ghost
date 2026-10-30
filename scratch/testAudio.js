import { GoogleGenAI } from '@google/genai';
import { config } from '../server/config/env.js';

function generateTestWav() {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * 1;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 10000;
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return buffer;
}

async function main() {
  const wavBuffer = generateTestWav();
  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const base64Data = wavBuffer.toString('base64');

  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  for (const model of modelsToTry) {
    try {
      console.log(`Trying model: ${model}...`);
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'audio/wav',
                }
              },
              { text: 'Transcribe any speech or describe what you hear.' }
            ]
          }
        ]
      });

      console.log(`Model ${model} SUCCESS:`, response.text);
      break;
    } catch (err) {
      console.log(`Model ${model} FAILED:`, err.message?.slice(0, 150));
    }
  }
}

main();
