import { RunnerNode, RunnerNodeResult, RunnerLogEntry } from '../src/types';

export interface CliRunResult {
  runner: { id: string; name: string };
  collection: { id: string; name: string };
  environment: string | null;
  status: 'success' | 'error';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodeResults: Record<string, RunnerNodeResult>;
  logs: RunnerLogEntry[];
}

export function formatJson(result: CliRunResult): string {
  return JSON.stringify(result, null, 2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// One <testcase> per request/retry node — the nodes with a pass/fail outcome.
// Other node types (delay, debug, setvariable, start, end) are structural, not assertions.
export function formatJUnit(result: CliRunResult, nodes: RunnerNode[]): string {
  const relevant = nodes.filter(n => n.type === 'request' || n.type === 'retry');
  const suiteName = escapeXml(result.runner.name);

  const testcases = relevant.map(node => {
    const nodeResult = result.nodeResults[node.id];
    const name = escapeXml(node.data.label || node.id);
    const timeSec = (((nodeResult?.response?.time) ?? 0) / 1000).toFixed(3);

    if (!nodeResult || nodeResult.status === 'idle') {
      return `    <testcase name="${name}" classname="${suiteName}" time="0">\n      <skipped/>\n    </testcase>`;
    }
    if (nodeResult.status === 'error') {
      const msg = escapeXml(nodeResult.error || `HTTP ${nodeResult.response?.status ?? 'error'}`);
      return `    <testcase name="${name}" classname="${suiteName}" time="${timeSec}">\n      <failure message="${msg}">${msg}</failure>\n    </testcase>`;
    }
    return `    <testcase name="${name}" classname="${suiteName}" time="${timeSec}"/>`;
  });

  const failures = relevant.filter(n => result.nodeResults[n.id]?.status === 'error').length;
  const skipped = relevant.filter(n => !result.nodeResults[n.id] || result.nodeResults[n.id].status === 'idle').length;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${suiteName}" tests="${relevant.length}" failures="${failures}" skipped="${skipped}" time="${(result.durationMs / 1000).toFixed(3)}">`,
    ...testcases,
    '</testsuite>',
  ].join('\n');
}

export function formatText(result: CliRunResult): string {
  const summary = `${result.status === 'success' ? '✓' : '✗'} Run ${result.status} (${result.durationMs}ms)`;
  return [...result.logs.map(l => l.message), '', summary].join('\n');
}
