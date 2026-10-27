import { describe, it, expect } from 'vitest';
import { createSerialQueue, WindowRegistry } from '../windowState';

describe('createSerialQueue', () => {
  it('runs tasks one at a time in submission order', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const slow = (name: string, ms: number) => enqueue(async () => {
      log.push(`start ${name}`);
      await new Promise(resolve => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      return name;
    });

    const results = await Promise.all([slow('a', 20), slow('b', 0), slow('c', 5)]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps running later tasks after one rejects', async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(async () => { throw new Error('boom'); });
    const next = enqueue(async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('WindowRegistry', () => {
  it('tracks the workspace shown by each window', () => {
    const registry = new WindowRegistry<string>();
    registry.add(1, 'win-1', 'alpha');
    registry.add(2, 'win-2');

    expect(registry.getWorkspaceId(1)).toBe('alpha');
    expect(registry.getWorkspaceId(2)).toBeNull();

    registry.setWorkspaceId(2, 'beta');
    expect(registry.getWorkspaceId(2)).toBe('beta');
  });

  it('finds the window already showing a workspace, ignoring the asking window', () => {
    const registry = new WindowRegistry<string>();
    registry.add(1, 'win-1', 'alpha');
    registry.add(2, 'win-2', 'beta');

    expect(registry.findWindowIdForWorkspace('alpha')).toBe(1);
    expect(registry.findWindowIdForWorkspace('alpha', 1)).toBeUndefined();
    expect(registry.findWindowIdForWorkspace('gamma')).toBeUndefined();
  });

  it('lists workspaces open in other windows', () => {
    const registry = new WindowRegistry<string>();
    registry.add(1, 'win-1', 'alpha');
    registry.add(2, 'win-2', 'beta');
    registry.add(3, 'win-3');

    expect(registry.openWorkspaceIds()).toEqual(['alpha', 'beta']);
    expect(registry.openWorkspaceIds(2)).toEqual(['alpha']);
  });

  it('forgets a window and its focus when it is removed', () => {
    const registry = new WindowRegistry<string>();
    registry.add(1, 'win-1', 'alpha');
    registry.add(2, 'win-2', 'beta');
    registry.markFocused(2);

    registry.remove(2);

    expect(registry.size).toBe(1);
    expect(registry.get(2)).toBeUndefined();
    expect(registry.getFocusedId()).toBeNull();
    expect(registry.openWorkspaceIds()).toEqual(['alpha']);
  });

  it('records the most recently focused window', () => {
    const registry = new WindowRegistry<string>();
    registry.add(1, 'win-1');
    registry.add(2, 'win-2');

    registry.markFocused(1);
    registry.markFocused(2);
    expect(registry.getFocusedId()).toBe(2);

    // Unknown ids are ignored.
    registry.markFocused(99);
    expect(registry.getFocusedId()).toBe(2);
  });
});
