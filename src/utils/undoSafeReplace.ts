// Replaces an <input>/<textarea>'s full value while keeping the browser's
// native undo (Cmd/Ctrl+Z) able to revert it in one step. Setting `.value`
// directly (what a plain controlled-React update does) does not register as
// an undoable edit in Chromium; select-all + execCommand('insertText', ...)
// does, because it's dispatched through the same path as a real keystroke.
export function replacePreservingUndo(el: HTMLTextAreaElement | HTMLInputElement, newValue: string): void {
  el.focus();
  el.select();
  const applied = typeof document.execCommand === 'function' && document.execCommand('insertText', false, newValue);
  if (!applied) {
    el.value = newValue;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
