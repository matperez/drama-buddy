import { ITTSProvider } from './tts-providers/types';
import { OpenAITTSProvider } from './tts-providers/openai';
import { WebSpeechTTSProvider } from './tts-providers/web-speech';

export class TTSService {
  private provider: ITTSProvider;
  private audioContext: AudioContext | null = null;
  private cache: Map<string, AudioBuffer> = new Map();
  private pendingRequests: Map<string, Promise<AudioBuffer>> = new Map();
  private useDirectPlayback: boolean = false;

  constructor(provider: ITTSProvider) {
    this.provider = provider;
    this.useDirectPlayback = provider.supportsDirectPlayback?.() ?? false;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  private getCacheKey(text: string, voice: string): string {
    return `${voice}:${text}`;
  }

  /**
   * Получить аудио буфер для текста и голоса
   */
  async getAudioBuffer(text: string, voice: string): Promise<AudioBuffer> {
    // Если провайдер поддерживает прямое воспроизведение, не используем кэш
    if (this.useDirectPlayback) {
      return this.provider.getAudioBuffer(text, voice);
    }

    const cacheKey = this.getCacheKey(text, voice);

    // 1. Проверяем кэш
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 2. Проверяем, есть ли уже запрос для этого текста
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    // 3. Выполняем запрос
    const requestPromise = (async () => {
      try {
        const buffer = await this.provider.getAudioBuffer(text, voice);
        this.cache.set(cacheKey, buffer);
        return buffer;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Предзагрузка аудио в кэш
   */
  async prefetch(text: string, voice: string): Promise<void> {
    try {
      if (this.useDirectPlayback) {
        // Для прямого воспроизведения предзагрузка не нужна
        return;
      }
      await this.getAudioBuffer(text, voice);
      console.log(`TTS: Prefetched audio for: "${text.substring(0, 20)}..."`);
    } catch (e) {
      console.warn("TTS: Prefetch failed", e);
    }
  }

  /**
   * Воспроизведение аудио для текста
   */
  async speak(text: string, voice: string): Promise<void> {
    // Если провайдер поддерживает прямое воспроизведение, используем его
    if (this.useDirectPlayback && this.provider.speakDirectly) {
      return this.provider.speakDirectly(text, voice);
    }

    // Иначе используем стандартный путь через AudioBuffer
    const ctx = this.getContext();
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await this.getAudioBuffer(text, voice);

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
    // Для провайдеров с прямым воспроизведением (Web Speech API) 
    // AudioContext не используется, но мы все равно пытаемся его разбудить
    // для совместимости и для случаев, когда он может понадобиться
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch (error) {
      // Игнорируем ошибки AudioContext для провайдеров с прямым воспроизведением
      if (!this.useDirectPlayback) {
        console.warn('Failed to resume audio context:', error);
      }
    }
  }

  async clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Получить текущий провайдер
   */
  getProvider(): ITTSProvider {
    return this.provider;
  }

  /**
   * Получить список доступных голосов
   */
  getAvailableVoices(): string[] {
    return this.provider.getAvailableVoices();
  }
}

/**
 * Фабрика для создания провайдеров TTS
 */
export function createTTSProvider(providerType: 'openai' | 'web-speech', apiKey?: string): ITTSProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAITTSProvider(apiKey);
    case 'web-speech':
      return new WebSpeechTTSProvider();
    default:
      throw new Error(`Unknown TTS provider: ${providerType}`);
  }
}
