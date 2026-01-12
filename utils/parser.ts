
import { ScriptData, ScriptLine } from '../types';

export const parseScript = (text: string): ScriptData => {
  const lines = text.split('\n').map(l => l.trim()).filter(line => line !== '');
  const parsedLines: ScriptLine[] = [];
  const roles = new Set<string>();
  let title = "Untitled Script";

  /**
   * Refined Role Detection Heuristic:
   * 1. Matches text at start followed by . or :
   * 2. Role name should be reasonably short (2-35 chars).
   * 3. Role name should not start with a dash '--'.
   * 4. If the 'role' part is a single letter and the 'text' part starts with another initial (e.g., 'А. Н. Толстой'), it's an author, not a role.
   */
  const rolePattern = /^([^.:\n]+)[.:]\s*(.*)$/u;
  const initialPattern = /^[А-ЯA-Z]\.\s*[А-ЯA-Z]\./; // Matches things like "А. Н." or "A. B."

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    
    // Skip dialogue lines starting with dashes
    if (rawLine.startsWith('--') || rawLine.startsWith('-')) {
      if (parsedLines.length > 0) {
        parsedLines[parsedLines.length - 1].text += ' ' + rawLine;
      }
      continue;
    }

    const match = rawLine.match(rolePattern);

    if (match) {
      const roleCandidate = match[1].trim();
      const content = match[2].trim();
      
      const wordCount = roleCandidate.split(/\s+/).length;

      // SPECIFIC FIX: Check if this is an author name (Initials pattern)
      // If group 1 is a single char and group 2 starts with a letter and a dot, it's a name.
      const isInitialPart = roleCandidate.length === 1 && /^[А-ЯA-Z]\.?/.test(content);
      
      const isLikelyRole = 
        roleCandidate.length >= 1 && 
        roleCandidate.length <= 35 && 
        !roleCandidate.includes(',') && 
        wordCount <= 4 &&
        !/^[\d\s]+$/.test(roleCandidate) &&
        !isInitialPart;

      if (isLikelyRole && (content.length > 0 || roles.has(roleCandidate))) {
        parsedLines.push({
          role: roleCandidate,
          text: content,
          id: `line-${i}-${Math.random().toString(36).substr(2, 9)}`
        });
        roles.add(roleCandidate);
      } else {
        // Not a role, might be title or author
        if (i < 3 && parsedLines.length === 0) {
          // Keep appending to title for first few lines if they aren't roles
          title = title === "Untitled Script" ? rawLine : title + " " + rawLine;
        } else if (parsedLines.length > 0) {
          parsedLines[parsedLines.length - 1].text += ' ' + rawLine;
        }
      }
    } else {
      if (i < 3 && parsedLines.length === 0) {
        title = title === "Untitled Script" ? rawLine : title + " " + rawLine;
      } else if (parsedLines.length > 0) {
        parsedLines[parsedLines.length - 1].text += ' ' + rawLine;
      }
    }
  }

  // Final fallback
  if (parsedLines.length === 0 && lines.length > 0) {
    title = lines[0];
  }

  return {
    title,
    lines: parsedLines,
    roles: Array.from(roles).sort()
  };
};
