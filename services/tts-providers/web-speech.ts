import { ITTSProvider } from './types';

export class WebSpeechTTSProvider implements ITTSProvider {
  private synth: SpeechSynthesis | null = null;
  private availableVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      
      // Голоса могут загружаться асинхронно
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (this.synth) {
      this.availableVoices = this.synth.getVoices().filter(voice => {
        // Фильтруем русские голоса или оставляем все, если русских нет
        return voice.lang.startsWith('ru') || voice.lang.startsWith('en');
      });
    }
  }

  getName(): string {
    return 'Web Speech API';
  }

  getDescription(): string {
    return 'Браузерный синтез речи. Бесплатный, не требует API ключа. Качество может быть ниже.';
  }

  requiresApiKey(): boolean {
    return false;
  }

  getAvailableVoices(): string[] {
    // Всегда перезагружаем голоса, так как они могут загружаться асинхронно
    this.loadVoices();
    
    // Если есть русские голоса, возвращаем их, иначе все доступные
    let voices = this.availableVoices;
    if (voices.length === 0 && this.synth) {
      voices = this.synth.getVoices();
    }
    
    // Создаем уникальные имена голосов
    const voiceNames = new Set<string>();
    voices.forEach(voice => {
      // Используем имя голоса или комбинацию имени и языка
      const name = voice.name || `${voice.lang} ${voice.localService ? 'Local' : 'Cloud'}`;
      voiceNames.add(name);
    });

    const result = Array.from(voiceNames);
    
    // Если голосов нет, возвращаем дефолтный
    if (result.length === 0) {
      return ['Default Voice'];
    }

    return result;
  }

  isAvailable(): boolean {
    return !!this.synth;
  }

  supportsDirectPlayback(): boolean {
    return true;
  }

  /**
   * Web Speech API не предоставляет прямой доступ к AudioBuffer.
   * Этот метод создает минимальный буфер для синхронизации,
   * но фактическое воспроизведение происходит через speechSynthesis.
   * 
   * Для прямого воспроизведения используйте метод speakDirectly()
   */
  async getAudioBuffer(text: string, voice: string): Promise<AudioBuffer> {
    if (!this.synth) {
      throw new Error('Web Speech API is not available in this browser');
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Находим голос по имени
    const voices = this.synth.getVoices();
    const selectedVoice = voices.find(v => 
      v.name === voice || 
      `${v.lang} ${v.localService ? 'Local' : 'Cloud'}` === voice
    ) || voices.find(v => v.lang.startsWith('ru')) || voices[0];

    if (!selectedVoice) {
      throw new Error('No voice available');
    }

    // Создаем utterance для оценки длительности
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.lang = 'ru-RU';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Примерная длительность (примерно 150 слов в минуту)
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    const duration = (wordCount / wordsPerMinute) * 60;
    const frameCount = Math.floor(ctx.sampleRate * duration);
    
    // Создаем минимальный буфер для синхронизации
    const buffer = ctx.createBuffer(1, Math.max(frameCount, 1000), ctx.sampleRate);
    
    return buffer;
  }

  /**
   * Прямое воспроизведение через Web Speech API
   * Возвращает Promise, который разрешается когда речь закончится
   */
  async speakDirectly(text: string, voice: string): Promise<void> {
    if (!this.synth) {
      throw new Error('Web Speech API is not available in this browser');
    }

    // Останавливаем любые текущие воспроизведения
    this.synth.cancel();

    return new Promise((resolve, reject) => {
      const voices = this.synth!.getVoices();
      const selectedVoice = voices.find(v => 
        v.name === voice || 
        `${v.lang} ${v.localService ? 'Local' : 'Cloud'}` === voice
      ) || voices.find(v => v.lang.startsWith('ru')) || voices[0];

      if (!selectedVoice) {
        reject(new Error('No voice available'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = selectedVoice;
      utterance.lang = 'ru-RU';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = (error) => reject(new Error(`Speech synthesis error: ${error.error}`));

      this.synth!.speak(utterance);
    });
  }
}
