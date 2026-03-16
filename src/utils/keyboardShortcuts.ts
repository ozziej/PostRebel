export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  currentKey: string;
  category: 'request' | 'general' | 'navigation';
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'send-request',
    name: 'Send Request',
    description: 'Send the current API request',
    defaultKey: 'cmd+enter',
    currentKey: 'cmd+enter',
    category: 'request'
  },
  {
    id: 'open-search',
    name: 'Open Search',
    description: 'Open the find dialog',
    defaultKey: 'cmd+f',
    currentKey: 'cmd+f',
    category: 'general'
  },
  {
    id: 'new-request',
    name: 'New Request',
    description: 'Create a new request',
    defaultKey: 'cmd+n',
    currentKey: 'cmd+n',
    category: 'request'
  },
  {
    id: 'save-response',
    name: 'Save Response',
    description: 'Save the current response',
    defaultKey: 'cmd+s',
    currentKey: 'cmd+s',
    category: 'request'
  }
];

export interface ParsedShortcut {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop() || '';

  return {
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('cmd') || parts.includes('meta'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    key: key
  };
}

export function formatShortcutDisplay(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return shortcut
    .replace(/cmd/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/ctrl/gi, 'Ctrl')
    .replace(/alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/enter/gi, isMac ? '↵' : 'Enter')
    .replace(/\+/g, isMac ? '' : '+')
    .toUpperCase();
}

export function normalizeShortcut(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // Normalize cmd/ctrl based on platform
  let normalized = shortcut.toLowerCase();

  if (isMac) {
    normalized = normalized.replace(/ctrl/g, 'cmd');
  } else {
    normalized = normalized.replace(/cmd/g, 'ctrl');
  }

  return normalized;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);

  return (
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.key.toLowerCase() === parsed.key
  );
}

export function isValidShortcut(shortcut: string): boolean {
  try {
    const parsed = parseShortcut(shortcut);

    // Must have at least one modifier
    if (!parsed.ctrl && !parsed.meta && !parsed.alt && !parsed.shift) {
      return false;
    }

    // Must have a valid key
    if (!parsed.key || parsed.key.length === 0) {
      return false;
    }

    // Key should be a single character or special key
    const validSpecialKeys = ['enter', 'space', 'tab', 'escape', 'backspace', 'delete'];
    if (parsed.key.length > 1 && !validSpecialKeys.includes(parsed.key)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function getShortcutConflict(newShortcut: string, shortcuts: KeyboardShortcut[], excludeId?: string): KeyboardShortcut | null {
  const normalized = normalizeShortcut(newShortcut);

  return shortcuts.find(s =>
    s.id !== excludeId &&
    normalizeShortcut(s.currentKey) === normalized
  ) || null;
}