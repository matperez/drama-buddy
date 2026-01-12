import { ITTSProvider } from './types';

// OpenAI TTS голоса
export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type OpenAIVoice = typeof OPENAI_VOICES[number];

export class OpenAITTSProvider implements ITTSProvider {
  private apiKey: string | null = null;
  private audioContext: AudioContext | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || null;
  }

  getName(): string {
    return 'OpenAI TTS';
  }

  getDescription(): string {
    return 'Высококачественный синтез речи от OpenAI. Требует API ключ.';
  }

  requiresApiKey(): boolean {
    return true;
  }

  getAvailableVoices(): string[] {
    return [...OPENAI_VOICES];
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  async getAudioBuffer(text: string, voice: string): Promise<AudioBuffer> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    if (!OPENAI_VOICES.includes(voice as OpenAIVoice)) {
      throw new Error(`Invalid OpenAI voice: ${voice}. Available: ${OPENAI_VOICES.join(', ')}`);
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice as OpenAIVoice,
        response_format: 'pcm', // Используем PCM для совместимости с AudioContext
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI TTS API error: ${response.status} ${error}`);
    }

    const audioData = await response.arrayBuffer();
    const ctx = this.getContext();
    
    // OpenAI возвращает PCM 16-bit, 24kHz, моно
    const pcmData = new Int16Array(audioData);
    const sampleRate = 24000;
    const numChannels = 1;
    const frameCount = pcmData.length;

    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Нормализация Int16 в Float32 [-1.0, 1.0]
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }

    return buffer;
  }
}
