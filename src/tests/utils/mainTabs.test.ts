import { describe, it, expect } from 'vitest';
import { MainTab, closeTab, openOrFocusTab, removeMatchingTabs, sanitizeWorkspaceTabs, tabKey, tabsStillPresent } from '../../utils/mainTabs';

const request = (id: string): MainTab => ({ kind: 'request', id });
const runner = (id: string): MainTab => ({ kind: 'runner', id });

describe('openOrFocusTab', () => {
  it('appends a request tab that is not open', () => {
    expect(openOrFocusTab([request('a')], request('b'))).toEqual([request('a'), request('b')]);
  });

  it('leaves an already open request tab in place', () => {
    const tabs = [request('a'), request('b')];
    expect(openOrFocusTab(tabs, request('a'))).toBe(tabs);
  });

  it('treats a runner and a request with the same id as different tabs', () => {
    expect(openOrFocusTab([request('1')], runner('1'))).toEqual([request('1'), runner('1')]);
  });
});

describe('closeTab', () => {
  it('selects the tab on the right when one in the middle closes', () => {
    const result = closeTab([request('a'), runner('b'), request('c')], runner('b'));
    expect(result.tabs).toEqual([request('a'), request('c')]);
    expect(result.neighbor).toEqual(request('c'));
  });

  it('selects the tab on the left when the last tab closes', () => {
    const result = closeTab([request('a'), request('b')], request('b'));
    expect(result.tabs).toEqual([request('a')]);
    expect(result.neighbor).toEqual(request('a'));
  });

  it('returns no neighbor when the only tab closes', () => {
    const result = closeTab([request('a')], request('a'));
    expect(result.tabs).toEqual([]);
    expect(result.neighbor).toBeNull();
  });

  it('does nothing when the tab is not open', () => {
    const tabs = [request('a')];
    expect(closeTab(tabs, request('missing'))).toEqual({ tabs, neighbor: null });
  });
});

describe('sanitizeWorkspaceTabs', () => {
  it('keeps valid per-workspace tabs and a matching active key', () => {
    const saved = sanitizeWorkspaceTabs({
      ws1: { tabs: [request('a'), { kind: 'nope', id: 'x' }, runner('b')], activeKey: 'runner:b' },
    });
    expect(saved.ws1).toEqual({ tabs: [request('a'), runner('b')], activeKey: 'runner:b' });
  });

  it('drops a stale active key and ignores junk', () => {
    expect(sanitizeWorkspaceTabs({ ws1: { tabs: [request('a')], activeKey: 'request:missing' } }).ws1.activeKey).toBeNull();
    expect(sanitizeWorkspaceTabs(null)).toEqual({});
    expect(sanitizeWorkspaceTabs({ ws1: { tabs: 'nope' } })).toEqual({});
  });
});

describe('tabsStillPresent', () => {
  it('removes tabs whose request or runner no longer exists', () => {
    const tabs = [request('a'), request('gone'), runner('r1')];
    expect(tabsStillPresent(tabs, new Set(['a']), new Set(['r1']))).toEqual([request('a'), runner('r1')]);
  });
});

describe('removeMatchingTabs', () => {
  it('keeps the active tab when a different tab is removed', () => {
    const tabs = [request('a'), request('b'), runner('c')];
    const result = removeMatchingTabs(tabs, tabKey(request('a')), tab => tab.id === 'b');
    expect(result.tabs).toEqual([request('a'), runner('c')]);
    expect(result.active).toEqual(request('a'));
    expect(result.activeRemoved).toBe(false);
  });

  it('moves to the nearest remaining tab when the active tab is removed', () => {
    const tabs = [request('a'), request('b'), runner('c')];
    const result = removeMatchingTabs(tabs, tabKey(request('b')), tab => tab.kind === 'request');
    expect(result.tabs).toEqual([runner('c')]);
    expect(result.active).toEqual(runner('c'));
    expect(result.activeRemoved).toBe(true);
  });
});
