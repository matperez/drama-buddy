
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

export type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface RoleAssignment {
  [roleName: string]: VoiceName;
}

export enum AppState {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING',
  READING = 'READING'
}
