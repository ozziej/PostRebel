#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs/promises';
import { executeRunner, executeRunnerForDataRows } from '../src/utils/runnerExecutor';
import { parseDataRows, detectDataFileFormat } from '../src/utils/dataFile';
import { Runner, RunnerNodeResult, RunnerLogEntry, Environment } from '../src/types';
import { executeHttpConfig } from './httpTransport';
import {
  getDefaultUserDataDir, resolveWorkspacesDir,
  loadCollections, loadEnvironments, loadRunners, loadCertificates,
} from './workspaceStore';
import {
  formatJson, formatJUnit, formatText, CliRunResult,
  formatJsonDataDriven, formatJUnitDataDriven, formatTextDataDriven, CliDataRunResult, CliDataRowResult,
} from './reporters';

export interface CliOptions {
  collectionName: string;
  workspace: string;
  env?: string;
  runner?: string;
  reporter: 'text' | 'json' | 'junit';
  out?: string;
  workspacesDir?: string;
  userDataDir?: string;
  data?: string;
}

const USAGE = 'Usage: postrebel run <collection> --workspace <name> [--env <name>] [--runner <name>] [--reporter text|json|junit] [--data <file.csv|.json>] [--out <file>]';

// Pure argv parsing — kept separate from I/O so it's trivially unit-testable.
export function parseArgs(argv: string[]): CliOptions {
  if (argv[0] !== 'run') {
    throw new Error(USAGE);
  }

  const positional: string[] = [];
  const opts: Record<string, string> = {};
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      opts[arg.slice(2)] = rest[i + 1];
      i++;
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(`Expected exactly one collection name.\n${USAGE}`);
  }

  const reporter = (opts.reporter || 'text') as CliOptions['reporter'];
  if (!['text', 'json', 'junit'].includes(reporter)) {
    throw new Error(`Unknown --reporter "${opts.reporter}" (expected text, json, or junit)`);
  }

  const workspace = opts.workspace || process.env.POSTREBEL_WORKSPACE;
  if (!workspace) {
    throw new Error(`Missing required --workspace <name>.\n${USAGE}`);
  }

  return {
    collectionName: positional[0],
    workspace,
    env: opts.env,
    runner: opts.runner,
    reporter,
    out: opts.out,
    workspacesDir: opts['workspaces-dir'],
    userDataDir: opts['user-data-dir'],
    data: opts.data,
  };
}

// Runs the CLI end-to-end and returns a process exit code. `log` is injectable
// so tests can capture output instead of writing to the real stdout/stderr.
export async function runCli(
  argv: string[],
  log: (line: string) => void = (line) => console.log(line),
  logError: (line: string) => void = (line) => console.error(line),
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (err: any) {
    logError(err.message);
    return 1;
  }

  const userDataDir = opts.userDataDir || getDefaultUserDataDir();
  const workspacesDir = await resolveWorkspacesDir(userDataDir, opts.workspacesDir);
  const workspacePath = path.join(workspacesDir, opts.workspace);

  const collections = await loadCollections(workspacePath);
  const collection = collections.find(c => c.name.toLowerCase() === opts.collectionName.toLowerCase());
  if (!collection) {
    logError(`Collection "${opts.collectionName}" not found in workspace "${opts.workspace}". Available: ${collections.map(c => c.name).join(', ') || '(none)'}`);
    return 1;
  }

  let environment: Environment | null = null;
  if (opts.env) {
    const environments = await loadEnvironments(workspacePath);
    environment = environments.find(e => e.name.toLowerCase() === opts.env!.toLowerCase()) || null;
    if (!environment) {
      logError(`Environment "${opts.env}" not found in workspace "${opts.workspace}". Available: ${environments.map(e => e.name).join(', ') || '(none)'}`);
      return 1;
    }
  }

  const candidateRunners = (await loadRunners(workspacePath)).filter(r => r.collectionId === collection.id);
  let runner: Runner | undefined;
  if (opts.runner) {
    runner = candidateRunners.find(r => r.name.toLowerCase() === opts.runner!.toLowerCase());
    if (!runner) {
      logError(`Runner "${opts.runner}" not found for collection "${collection.name}". Available: ${candidateRunners.map(r => r.name).join(', ') || '(none)'}`);
      return 1;
    }
  } else if (candidateRunners.length === 1) {
    runner = candidateRunners[0];
  } else if (candidateRunners.length === 0) {
    logError(`Collection "${collection.name}" has no runners. Create one in PostRebel first.`);
    return 1;
  } else {
    logError(`Collection "${collection.name}" has multiple runners; specify one with --runner. Available: ${candidateRunners.map(r => r.name).join(', ')}`);
    return 1;
  }

  const certificates = await loadCertificates(userDataDir);

  // ── Data-file-driven run: same flow, once per row of an external file ─────
  if (opts.data) {
    let content: string;
    try {
      content = await fs.readFile(opts.data, 'utf-8');
    } catch (err: any) {
      logError(`Could not read data file "${opts.data}": ${err.message}`);
      return 1;
    }
    const { rows, errors } = parseDataRows(content, detectDataFileFormat(opts.data));
    if (errors.length > 0) {
      logError(errors[0]);
      return 1;
    }
    if (rows.length === 0) {
      logError(`Data file "${opts.data}" has no rows`);
      return 1;
    }

    const rowResults = await executeRunnerForDataRows(
      runner, collection, environment, certificates, rows,
      () => {},
      () => {},
      undefined,
      undefined,
      undefined,
      executeHttpConfig,
    );

    const dataRows: CliDataRowResult[] = rowResults.map(rowResult => {
      const hasError = Object.values(rowResult.nodeResults).some(r => r.status === 'error');
      const reachedEnd = runner!.nodes.some(n => n.type === 'end' && rowResult.nodeResults[n.id]?.status === 'success');
      const timestamps = rowResult.logs.map(l => l.timestamp).filter((t): t is number => t != null);
      const startedAt = timestamps.length ? new Date(timestamps[0]).toISOString() : new Date().toISOString();
      const completedAt = timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : startedAt;
      const durationMs = timestamps.length ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
      return {
        runner: { id: runner!.id, name: runner!.name },
        collection: { id: collection.id, name: collection.name },
        environment: environment?.name ?? null,
        status: hasError || !reachedEnd ? 'error' : 'success',
        startedAt, completedAt, durationMs,
        nodeResults: rowResult.nodeResults,
        logs: rowResult.logs,
        rowIndex: rowResult.rowIndex,
        row: rowResult.row,
      };
    });

    const dataResult: CliDataRunResult = {
      runner: { id: runner.id, name: runner.name },
      collection: { id: collection.id, name: collection.name },
      environment: environment?.name ?? null,
      dataFile: opts.data,
      status: dataRows.every(r => r.status === 'success') ? 'success' : 'error',
      rows: dataRows,
    };

    const output = opts.reporter === 'json' ? formatJsonDataDriven(dataResult)
      : opts.reporter === 'junit' ? formatJUnitDataDriven(dataResult, runner.nodes)
      : formatTextDataDriven(dataResult);

    if (opts.out) {
      await fs.writeFile(opts.out, output + '\n');
    } else {
      log(output);
    }

    return dataResult.status === 'success' ? 0 : 1;
  }

  // ── Single run ──────────────────────────────────────────────────────────────
  const nodeResults: Record<string, RunnerNodeResult> = {};
  const logs: RunnerLogEntry[] = [];
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  await executeRunner(
    runner,
    collection,
    environment,
    certificates,
    (nodeId, result) => { nodeResults[nodeId] = result; },
    undefined,
    (entry) => { logs.push({ ...entry, timestamp: Date.now() }); },
    undefined,
    executeHttpConfig,
  );

  const durationMs = Date.now() - startTime;
  const hasError = Object.values(nodeResults).some(r => r.status === 'error');
  const reachedEnd = runner.nodes.some(n => n.type === 'end' && nodeResults[n.id]?.status === 'success');
  const status: CliRunResult['status'] = hasError || !reachedEnd ? 'error' : 'success';

  const result: CliRunResult = {
    runner: { id: runner.id, name: runner.name },
    collection: { id: collection.id, name: collection.name },
    environment: environment?.name ?? null,
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    nodeResults,
    logs,
  };

  const output = opts.reporter === 'json' ? formatJson(result)
    : opts.reporter === 'junit' ? formatJUnit(result, runner.nodes)
    : formatText(result);

  if (opts.out) {
    await fs.writeFile(opts.out, output + '\n');
  } else {
    log(output);
  }

  return status === 'success' ? 0 : 1;
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then(code => process.exit(code));
}
