export interface ITTSProvider {
  /**
   * Получить список доступных голосов для этого провайдера
   */
  getAvailableVoices(): string[];

  /**
   * Проверить, доступен ли провайдер (есть ли необходимые API ключи, поддерживается ли браузером)
   */
  isAvailable(): boolean | Promise<boolean>;

  /**
   * Получить аудио буфер для текста и голоса
   */
  getAudioBuffer(text: string, voice: string): Promise<AudioBuffer>;

  /**
   * Название провайдера для отображения в UI
   */
  getName(): string;

  /**
   * Описание провайдера
   */
  getDescription(): string;

  /**
   * Требуется ли API ключ
   */
  requiresApiKey(): boolean;

  /**
   * Поддерживает ли провайдер прямое воспроизведение (без AudioBuffer)
   * Если true, TTSService будет использовать speakDirectly вместо getAudioBuffer
   */
  supportsDirectPlayback?(): boolean;

  /**
   * Прямое воспроизведение (для провайдеров, которые не могут предоставить AudioBuffer)
   */
  speakDirectly?(text: string, voice: string): Promise<void>;

  /**
   * Активация провайдера (для мобильных браузеров, требуется пользовательское взаимодействие)
   */
  activate?(): Promise<void>;
}
