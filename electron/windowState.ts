// Pure bookkeeping for multi-window support. Kept free of Electron imports so it
// can be unit-tested with vitest; electron/main.ts supplies the BrowserWindow objects.

// Runs async tasks one after another. Used to serialize read-modify-write cycles
// on settings.json so two windows saving preferences at once cannot lose updates.
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

interface WindowRecord<W> {
  window: W;
  workspaceId: string | null;
}

export class WindowRegistry<W> {
  private records = new Map<number, WindowRecord<W>>();
  private focusedId: number | null = null;

  add(id: number, window: W, workspaceId: string | null = null): void {
    this.records.set(id, { window, workspaceId });
  }

  remove(id: number): void {
    this.records.delete(id);
    if (this.focusedId === id) this.focusedId = null;
  }

  get size(): number {
    return this.records.size;
  }

  get(id: number): W | undefined {
    return this.records.get(id)?.window;
  }

  all(): W[] {
    return [...this.records.values()].map(record => record.window);
  }

  getWorkspaceId(id: number): string | null {
    return this.records.get(id)?.workspaceId ?? null;
  }

  setWorkspaceId(id: number, workspaceId: string | null): void {
    const record = this.records.get(id);
    if (record) record.workspaceId = workspaceId;
  }

  // Windows other than `id` that currently show `workspaceId`.
  findWindowIdForWorkspace(workspaceId: string, exceptId?: number): number | undefined {
    for (const [id, record] of this.records) {
      if (id !== exceptId && record.workspaceId === workspaceId) return id;
    }
    return undefined;
  }

  openWorkspaceIds(exceptId?: number): string[] {
    const ids: string[] = [];
    for (const [id, record] of this.records) {
      if (id !== exceptId && record.workspaceId) ids.push(record.workspaceId);
    }
    return ids;
  }

  markFocused(id: number): void {
    if (this.records.has(id)) this.focusedId = id;
  }

  // Null when no window has been focused since the last removal.
  getFocusedId(): number | null {
    return this.focusedId;
  }
}
