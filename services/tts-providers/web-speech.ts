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
      // Приоритет: только русские голоса
      const allVoices = this.synth.getVoices();
      const russianVoices = allVoices.filter(voice => 
        voice.lang.startsWith('ru') || 
        voice.lang === 'ru' ||
        voice.lang.toLowerCase().includes('russian')
      );
      
      // Если есть русские голоса, используем только их
      // Иначе используем все доступные (но это нежелательно)
      this.availableVoices = russianVoices.length > 0 ? russianVoices : allVoices;
    }
  }

  getName(): string {
    return 'Web Speech API';
  }

  getDescription(): string {
    this.loadVoices();
    const hasRussian = this.availableVoices.some(v => 
      v.lang.startsWith('ru') || v.lang === 'ru'
    );
    
    if (hasRussian) {
      return 'Браузерный синтез речи. Бесплатный, не требует API ключа. Показываются только голоса, поддерживающие русский язык.';
    } else {
      return 'Браузерный синтез речи. Бесплатный, не требует API ключа. ⚠️ Русские голоса не найдены - качество чтения может быть низким.';
    }
  }

  requiresApiKey(): boolean {
    return false;
  }

  getAvailableVoices(): string[] {
    // Всегда перезагружаем голоса, так как они могут загружаться асинхронно
    this.loadVoices();
    
    // Используем только отфильтрованные голоса (приоритет русским)
    const voices = this.availableVoices;
    
    if (voices.length === 0) {
      // Если голосов нет вообще, возвращаем дефолтный
      return ['Default Voice'];
    }
    
    // Создаем уникальные имена голосов с указанием языка для ясности
    const voiceNames = new Set<string>();
    voices.forEach(voice => {
      const isRussian = voice.lang.startsWith('ru') || 
                       voice.lang === 'ru' ||
                       voice.lang.toLowerCase().includes('russian');
      
      // Для русских голосов показываем только имя, для остальных - с языком
      const name = isRussian 
        ? voice.name 
        : `${voice.name} (${voice.lang})`;
      
      if (name) {
        voiceNames.add(name);
      }
    });

    const result = Array.from(voiceNames);
    
    // Если после фильтрации голосов нет, но есть русские в системе
    if (result.length === 0 && this.synth) {
      const allVoices = this.synth.getVoices();
      const russianVoices = allVoices.filter(v => 
        v.lang.startsWith('ru') || v.lang === 'ru'
      );
      
      if (russianVoices.length > 0) {
        // Возвращаем русские голоса с их именами
        return russianVoices.map(v => v.name || 'Russian Voice').filter(Boolean);
      }
    }

    return result.length > 0 ? result : ['Default Voice'];
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
    
    // Находим голос по имени, приоритет русским голосам
    const voices = this.synth.getVoices();
    
    // Сначала ищем точное совпадение по имени
    let selectedVoice = voices.find(v => v.name === voice);
    
    // Если не нашли, ищем по имени с языком (формат "Name (lang)")
    if (!selectedVoice && voice.includes('(')) {
      const namePart = voice.split('(')[0].trim();
      selectedVoice = voices.find(v => v.name === namePart);
    }
    
    // Если все еще не нашли, приоритизируем русские голоса
    if (!selectedVoice) {
      selectedVoice = voices.find(v => 
        (v.lang.startsWith('ru') || v.lang === 'ru') && 
        (v.name === voice || v.name?.includes(voice.split('(')[0].trim()))
      );
    }
    
    // Если и это не помогло, берем первый русский голос
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('ru') || v.lang === 'ru');
    }
    
    // В крайнем случае - любой доступный голос
    if (!selectedVoice) {
      selectedVoice = voices[0];
    }

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

    // На мобильных устройствах голоса могут загружаться асинхронно
    // Ждем, пока голоса загрузятся
    await this.ensureVoicesLoaded();

    // Останавливаем любые текущие воспроизведения
    // Но делаем это аккуратно, чтобы не блокировать на мобильных
    if (this.synth.speaking) {
      this.synth.cancel();
      // Небольшая задержка для мобильных устройств
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Promise((resolve, reject) => {
      const voices = this.synth!.getVoices();
      
      if (voices.length === 0) {
        reject(new Error('No voices available. Please wait for voices to load.'));
        return;
      }
      
      // Сначала ищем точное совпадение по имени
      let selectedVoice = voices.find(v => v.name === voice);
      
      // Если не нашли, ищем по имени с языком (формат "Name (lang)")
      if (!selectedVoice && voice.includes('(')) {
        const namePart = voice.split('(')[0].trim();
        selectedVoice = voices.find(v => v.name === namePart);
      }
      
      // Если все еще не нашли, приоритизируем русские голоса
      if (!selectedVoice) {
        selectedVoice = voices.find(v => 
          (v.lang.startsWith('ru') || v.lang === 'ru') && 
          (v.name === voice || v.name?.includes(voice.split('(')[0].trim()))
        );
      }
      
      // Если и это не помогло, берем первый русский голос
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('ru') || v.lang === 'ru');
      }
      
      // В крайнем случае - любой доступный голос
      if (!selectedVoice) {
        selectedVoice = voices[0];
      }

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

      // Обработчики событий
      let resolved = false;
      
      utterance.onend = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      
      utterance.onerror = (error) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Speech synthesis error: ${error.error}`));
        }
      };

      // На мобильных устройствах может потребоваться небольшая задержка
      try {
        this.synth!.speak(utterance);
        
        // Таймаут на случай, если события не сработают
        setTimeout(() => {
          if (!resolved && !this.synth!.speaking) {
            resolved = true;
            resolve();
          }
        }, 30000); // 30 секунд максимум
      } catch (error) {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to speak: ${(error as Error).message}`));
        }
      }
    });
  }

  /**
   * Убеждаемся, что голоса загружены (особенно важно для мобильных устройств)
   */
  private async ensureVoicesLoaded(): Promise<void> {
    if (!this.synth) {
      return;
    }

    // Если голоса уже загружены, возвращаемся
    if (this.synth.getVoices().length > 0) {
      this.loadVoices();
      return;
    }

    // Ждем загрузки голосов (максимум 3 секунды)
    return new Promise((resolve) => {
      const maxWait = 3000;
      const startTime = Date.now();
      
      const checkVoices = () => {
        const voices = this.synth!.getVoices();
        if (voices.length > 0 || Date.now() - startTime > maxWait) {
          this.loadVoices();
          resolve();
        } else {
          setTimeout(checkVoices, 100);
        }
      };

      // Подписываемся на событие загрузки голосов
      if (this.synth.onvoiceschanged !== undefined) {
        const originalHandler = this.synth.onvoiceschanged;
        this.synth.onvoiceschanged = (event?: Event) => {
          this.loadVoices();
          if (originalHandler && typeof originalHandler === 'function') {
            try {
              // Вызываем оригинальный обработчик, если он есть
              if (event) {
                (originalHandler as (event: Event) => void)(event);
              } else {
                (originalHandler as () => void)();
              }
            } catch (e) {
              // Игнорируем ошибки в оригинальном обработчике
            }
          }
          resolve();
        };
      }

      // Начинаем проверку
      checkVoices();
    });
  }
}
