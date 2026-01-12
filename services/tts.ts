
import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Gemini TTS returns raw 16-bit PCM.
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize Int16 to Float32 range [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class TTSService {
  private audioContext: AudioContext | null = null;
  private cache: Map<string, AudioBuffer> = new Map();

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return this.audioContext;
  }

  private getCacheKey(text: string, voice: VoiceName): string {
    return `${voice}:${text}`;
  }

  async speak(text: string, voice: VoiceName): Promise<void> {
    const ctx = this.getContext();
    const cacheKey = this.getCacheKey(text, voice);
    
    // Resume context if it's suspended (browser policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    let audioBuffer: AudioBuffer;

    if (this.cache.has(cacheKey)) {
      console.log(`TTS: Using cached audio for: "${text.substring(0, 30)}..."`);
      audioBuffer = this.cache.get(cacheKey)!;
    } else {
      try {
        if (!process.env.API_KEY) {
          throw new Error("API Key is not configured.");
        }

        console.log(`TTS: Fetching speech for: "${text.substring(0, 30)}..." with voice ${voice}`);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("Model response did not contain audio data. It might be a safety filter or API issue.");
        }

        const audioBytes = decode(base64Audio);
        audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
        
        // Save to cache
        this.cache.set(cacheKey, audioBuffer);
        console.log(`TTS: Audio cached. Cache size: ${this.cache.size}`);
      } catch (error) {
        console.error("TTSService.speak Critical Error:", error);
        throw error; 
      }
    }

    return new Promise((resolve, reject) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        resolve();
      };
      try {
        source.start(0);
      } catch (e) {
        reject(new Error("Audio start failed: " + (e as Error).message));
      }
    });
  }
  
  async resumeContext() {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  async clearCache() {
    this.cache.clear();
  }
}
