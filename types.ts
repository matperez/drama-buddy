
export interface ScriptLine {
  role: string;
  text: string;
  id: string;
}

export interface ScriptData {
  title: string;
  lines: ScriptLine[];
  roles: string[];
}

// Типы провайдеров TTS
export type TTSProviderType = 'openai' | 'web-speech';

// Голоса теперь строки, так как разные провайдеры имеют разные голоса
export type VoiceName = string;

export interface RoleAssignment {
  [roleName: string]: VoiceName;
}

export enum AppState {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING',
  READING = 'READING'
}

// Конфигурация TTS провайдера
export interface TTSConfig {
  provider: TTSProviderType;
  apiKey?: string;
}
