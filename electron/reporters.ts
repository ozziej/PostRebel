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
function buildTestsuiteXml(result: CliRunResult, nodes: RunnerNode[], suiteName: string): string {
  const relevant = nodes.filter(n => n.type === 'request' || n.type === 'retry');
  const escapedName = escapeXml(suiteName);

  const testcases = relevant.map(node => {
    const nodeResult = result.nodeResults[node.id];
    const name = escapeXml(node.data.label || node.id);
    const timeSec = (((nodeResult?.response?.time) ?? 0) / 1000).toFixed(3);

    if (!nodeResult || nodeResult.status === 'idle') {
      return `    <testcase name="${name}" classname="${escapedName}" time="0">\n      <skipped/>\n    </testcase>`;
    }
    if (nodeResult.status === 'error') {
      const msg = escapeXml(nodeResult.error || `HTTP ${nodeResult.response?.status ?? 'error'}`);
      return `    <testcase name="${name}" classname="${escapedName}" time="${timeSec}">\n      <failure message="${msg}">${msg}</failure>\n    </testcase>`;
    }
    return `    <testcase name="${name}" classname="${escapedName}" time="${timeSec}"/>`;
  });

  const failures = relevant.filter(n => result.nodeResults[n.id]?.status === 'error').length;
  const skipped = relevant.filter(n => !result.nodeResults[n.id] || result.nodeResults[n.id].status === 'idle').length;

  return [
    `<testsuite name="${escapedName}" tests="${relevant.length}" failures="${failures}" skipped="${skipped}" time="${(result.durationMs / 1000).toFixed(3)}">`,
    ...testcases,
    '</testsuite>',
  ].join('\n');
}

export function formatJUnit(result: CliRunResult, nodes: RunnerNode[]): string {
  return ['<?xml version="1.0" encoding="UTF-8"?>', buildTestsuiteXml(result, nodes, result.runner.name)].join('\n');
}

export function formatText(result: CliRunResult): string {
  const summary = `${result.status === 'success' ? '✓' : '✗'} Run ${result.status} (${result.durationMs}ms)`;
  return [...result.logs.map(l => l.message), '', summary].join('\n');
}

// ── Data-file-driven runs: one row of results per external data-file record ────

export interface CliDataRowResult extends CliRunResult {
  rowIndex: number;
  row: Record<string, string>;
}

export interface CliDataRunResult {
  runner: { id: string; name: string };
  collection: { id: string; name: string };
  environment: string | null;
  dataFile: string;
  status: 'success' | 'error';
  rows: CliDataRowResult[];
}

function rowLabel(row: Record<string, string>): string {
  return Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', ');
}

export function formatJsonDataDriven(result: CliDataRunResult): string {
  return JSON.stringify(result, null, 2);
}

// One <testsuite> per row, wrapped in a <testsuites> root — the standard shape
// for a parameterized/data-driven JUnit report.
export function formatJUnitDataDriven(result: CliDataRunResult, nodes: RunnerNode[]): string {
  const suites = result.rows.map(row =>
    buildTestsuiteXml(row, nodes, `${result.runner.name} [row ${row.rowIndex + 1}: ${rowLabel(row.row)}]`)
  );
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<testsuites>', ...suites, '</testsuites>'].join('\n');
}

export function formatTextDataDriven(result: CliDataRunResult): string {
  const lines: string[] = [];
  for (const row of result.rows) {
    lines.push(`── Row ${row.rowIndex + 1}/${result.rows.length}: ${rowLabel(row.row)} ──`);
    lines.push(...row.logs.map(l => l.message));
    lines.push(`${row.status === 'success' ? '✓' : '✗'} Row ${row.rowIndex + 1} ${row.status} (${row.durationMs}ms)`, '');
  }
  const passed = result.rows.filter(r => r.status === 'success').length;
  lines.push(`${result.status === 'success' ? '✓' : '✗'} Data-driven run: ${passed}/${result.rows.length} row(s) passed`);
  return lines.join('\n');
}
