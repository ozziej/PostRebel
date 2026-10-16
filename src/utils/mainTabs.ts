export type MainTab = { kind: 'request' | 'runner'; id: string };

export interface WorkspaceTabSnapshot {
  tabs: MainTab[];
  activeKey: string | null;
}

function isMainTab(value: unknown): value is MainTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as { kind?: unknown; id?: unknown };
  return (tab.kind === 'request' || tab.kind === 'runner') && typeof tab.id === 'string' && tab.id.length > 0;
}

/** Drop malformed entries from the locally saved tab map. */
export function sanitizeWorkspaceTabs(value: unknown): Record<string, WorkspaceTabSnapshot> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, WorkspaceTabSnapshot> = {};
  for (const [workspaceId, snapshot] of Object.entries(value as Record<string, unknown>)) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    const rawTabs = (snapshot as { tabs?: unknown }).tabs;
    if (!Array.isArray(rawTabs)) continue;
    const tabs = rawTabs.filter(isMainTab).map(tab => ({ kind: tab.kind, id: tab.id }));
    const rawKey = (snapshot as { activeKey?: unknown }).activeKey;
    const activeKey = typeof rawKey === 'string' && tabs.some(tab => tabKey(tab) === rawKey)
      ? rawKey
      : null;
    result[workspaceId] = { tabs, activeKey };
  }
  return result;
}

/** Keep only tabs whose request or runner still exists. */
export function tabsStillPresent(
  tabs: MainTab[],
  requestIds: Set<string>,
  runnerIds: Set<string>,
): MainTab[] {
  return tabs.filter(tab => tab.kind === 'request' ? requestIds.has(tab.id) : runnerIds.has(tab.id));
}

export function tabKey(tab: MainTab): string {
  return `${tab.kind}:${tab.id}`;
}

/** Append a tab when it is not already open. An existing tab stays in place. */
export function openOrFocusTab(tabs: MainTab[], tab: MainTab): MainTab[] {
  if (tabs.some(existing => tabKey(existing) === tabKey(tab))) return tabs;
  return [...tabs, tab];
}

/**
 * Remove a tab. `neighbor` is the tab to the right of the one that closed,
 * or the tab to the left when the closed tab was last.
 */
export function closeTab(tabs: MainTab[], tab: MainTab): { tabs: MainTab[]; neighbor: MainTab | null } {
  const key = tabKey(tab);
  const index = tabs.findIndex(existing => tabKey(existing) === key);
  if (index < 0) return { tabs, neighbor: null };
  const next = tabs.filter(existing => tabKey(existing) !== key);
  const neighbor = next[index] ?? next[index - 1] ?? null;
  return { tabs: next, neighbor };
}

/**
 * Remove every tab matching `shouldRemove`. When the active tab is removed,
 * `active` is the nearest tab that stayed open.
 */
export function removeMatchingTabs(
  tabs: MainTab[],
  activeKey: string | null,
  shouldRemove: (tab: MainTab) => boolean,
): { tabs: MainTab[]; active: MainTab | null; activeRemoved: boolean } {
  const active = tabs.find(existing => tabKey(existing) === activeKey) ?? null;
  const activeRemoved = !!active && shouldRemove(active);
  const next = tabs.filter(existing => !shouldRemove(existing));
  if (!activeRemoved) return { tabs: next, active, activeRemoved: false };

  const index = tabs.findIndex(existing => tabKey(existing) === activeKey);
  const neighbor = tabs.slice(index + 1).find(existing => !shouldRemove(existing))
    ?? [...tabs.slice(0, index)].reverse().find(existing => !shouldRemove(existing))
    ?? null;
  return { tabs: next, active: neighbor, activeRemoved: true };
}
