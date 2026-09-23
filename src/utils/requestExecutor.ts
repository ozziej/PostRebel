import { ApiRequest, ApiResponse, Environment, Certificate, Collection } from '../types';
import { HttpService, HttpTransport, ResolvedRequestInfo } from './httpService';
import { ScriptRunner } from './scriptRunner';

// Runs one saved request headlessly — the pre-script → HTTP call → test-script
// sequence a Runner request-node already runs (runnerExecutor.ts's request
// branch), extracted so it's usable outside of a Runner flow (e.g. from the
// MCP server's run_request tool) with no GUI/React state involved.

export interface SingleRequestResult {
  response: ApiResponse;
  resolved: ResolvedRequestInfo;
  variables: Record<string, string>;
  scriptLogs: string[];
}

export async function executeSingleRequest(
  request: ApiRequest,
  environment: Environment | null,
  certificates: Certificate[] = [],
  collection: Collection | null = null,
  transport: HttpTransport = (config) => window.electronAPI.executeHttpRequest(config),
): Promise<SingleRequestResult> {
  let vars: Record<string, string> = environment ? { ...environment.variables } : {};
  const scriptLogs: string[] = [];

  const scratchEnv = (): Environment =>
    environment ? { ...environment, variables: { ...vars } } : { id: 'adhoc-env', name: 'Ad-hoc', variables: { ...vars } };

  if (request.preRequestScript?.trim()) {
    const scriptEnv = scratchEnv();
    const result = await ScriptRunner.executePreRequestScript(request.preRequestScript, scriptEnv, { collection, certificates });
    vars = { ...vars, ...scriptEnv.variables };
    scriptLogs.push(...result.logs);
  }

  const mergedEnv: Environment = environment ? { ...environment, variables: vars } : { id: 'adhoc-env', name: 'Ad-hoc', variables: vars };

  let resolved: ResolvedRequestInfo = { method: request.method, url: request.url, headers: request.headers };
  const response = await HttpService.executeRequest(
    request, mergedEnv, certificates, collection,
    (info) => { resolved = info; },
    transport,
  );

  if (request.testScript?.trim()) {
    const scriptEnv = scratchEnv();
    const result = await ScriptRunner.executeTestScript(request.testScript, response, scriptEnv, { collection, certificates });
    vars = { ...vars, ...scriptEnv.variables };
    scriptLogs.push(...result.logs);
  }

  return { response, resolved, variables: vars, scriptLogs };
}
