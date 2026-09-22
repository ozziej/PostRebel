import { ApiRequest, ApiResponse, Certificate, Collection, Environment } from '../types';
import { HttpService } from './httpService';

type SendRequestCallback = (error: Error | null, response: any) => void;

// Normalizes the argument passed to pm.sendRequest — either a plain URL
// string, or a Postman-style request object — into an ApiRequest so it can
// be run through the same HttpService used for normal requests.
function normalizeSendRequestArg(requestish: any): ApiRequest {
  if (typeof requestish === 'string') {
    return { id: 'pm-send-request', name: 'pm.sendRequest', method: 'GET', url: requestish, headers: {} };
  }

  const headers: Record<string, string> = {};
  if (Array.isArray(requestish?.header)) {
    for (const h of requestish.header) {
      if (h?.key) headers[h.key] = h.value ?? '';
    }
  } else if (requestish?.header && typeof requestish.header === 'object') {
    Object.assign(headers, requestish.header);
  } else if (requestish?.headers && typeof requestish.headers === 'object') {
    Object.assign(headers, requestish.headers);
  }

  let body: ApiRequest['body'] | undefined;
  const rawBody = requestish?.body;
  if (typeof rawBody === 'string') {
    body = { type: 'raw', rawSubtype: 'json', data: rawBody };
  } else if (rawBody && typeof rawBody === 'object' && rawBody.mode === 'raw') {
    body = { type: 'raw', rawSubtype: 'json', data: rawBody.raw || '' };
  }

  const method = (requestish?.method || 'GET').toUpperCase();

  return {
    id: 'pm-send-request',
    name: 'pm.sendRequest',
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) ? method : 'GET',
    url: requestish?.url || '',
    headers,
    body,
  };
}

export class ScriptRunner {
  // In-memory, app-session-scoped globals shared by every script execution —
  // mirrors Postman's pm.globals, without disk persistence.
  private static globals: Record<string, string> = {};

  private static buildPmResponse(response: ApiResponse): any {
    return {
      status: response.status,
      code: response.status,
      statusText: response.statusText,
      headers: response.headers,
      json: () => response.data,
      text: () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      time: response.time,
      responseSize: response.size,
      to: {
        have: {
          status: (expectedStatus: number) => response.status === expectedStatus,
        },
      },
    };
  }

  private static createPmObject(
    response: ApiResponse | null,
    environment: Environment,
    logs: string[],
    collection: Collection | null,
    certificates: Certificate[],
    pendingRequests: Promise<void>[],
  ): any {
    const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

    return {
      environment: {
        get: (key: string) => environment.variables[key] || '',
        set: (key: string, value: string) => { environment.variables[key] = value; },
      },
      collectionVariables: {
        get: (key: string) => collection?.variables?.[key] || '',
        set: (key: string, value: string) => {
          if (!collection) return;
          if (!collection.variables) collection.variables = {};
          collection.variables[key] = value;
        },
      },
      globals: {
        get: (key: string) => ScriptRunner.globals[key] || '',
        set: (key: string, value: string) => { ScriptRunner.globals[key] = value; },
      },
      sendRequest: (requestish: any, callback?: SendRequestCallback) => {
        const adHocRequest = normalizeSendRequestArg(requestish);
        const promise = HttpService.executeRequest(adHocRequest, environment, certificates, collection)
          .then(sentResponse => { callback?.(null, ScriptRunner.buildPmResponse(sentResponse)); })
          .catch((error: any) => { callback?.(error instanceof Error ? error : new Error(String(error)), undefined); });
        pendingRequests.push(promise);
      },
      response: response ? this.buildPmResponse(response) : null,
      test: (name: string, testFn: () => void) => {
        try {
          testFn();
          testResults.push({ name, passed: true });
          logs.push(`✓ ${name}`);
        } catch (error: any) {
          testResults.push({ name, passed: false, error: error.message });
          logs.push(`✗ ${name}: ${error.message}`);
        }
      },
      expect: (actual: any) => ({
        to: {
          equal: (expected: any) => {
            if (actual !== expected)
              throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
          },
          be: {
            oneOf: (values: any[]) => {
              if (!values.includes(actual))
                throw new Error(`Expected ${JSON.stringify(actual)} to be one of [${values.join(', ')}]`);
            },
          },
          have: {
            status: (expectedStatus: number) => {
              if (response && response.status !== expectedStatus)
                throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
            },
          },
        },
      }),
      _testResults: testResults,
    };
  }

  static async executePreRequestScript(
    script: string,
    environment: Environment,
    options: { collection?: Collection | null; certificates?: Certificate[] } = {},
  ): Promise<{ success: boolean; error?: string; logs: string[] }> {
    const logs: string[] = [];
    const pendingRequests: Promise<void>[] = [];
    try {
      const pm = this.createPmObject(null, environment, logs, options.collection ?? null, options.certificates ?? [], pendingRequests);
      const console = {
        log:   (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('error: ' + args.map(String).join(' ')),
        warn:  (...args: any[]) => logs.push('warn: '  + args.map(String).join(' ')),
      };
      new Function('pm', 'console', script)(pm, console);
      await Promise.all(pendingRequests);
      return { success: true, logs };
    } catch (error: any) {
      logs.push(`Script error: ${error.message}`);
      return { success: false, error: error.message, logs };
    }
  }

  static async executeTestScript(
    script: string,
    response: ApiResponse,
    environment: Environment,
    options: { collection?: Collection | null; certificates?: Certificate[] } = {},
  ): Promise<{ success: boolean; error?: string; logs: string[]; testResults: any[] }> {
    const logs: string[] = [];
    const pendingRequests: Promise<void>[] = [];

    if (/\bresponseBody\b/.test(script)) {
      logs.push('⚠ Warning: "responseBody" is a legacy Postman variable and is not supported here. Use pm.response.text() or pm.response.json() instead.');
    }

    try {
      const pm = this.createPmObject(response, environment, logs, options.collection ?? null, options.certificates ?? [], pendingRequests);
      const console = {
        log:   (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('error: ' + args.map(String).join(' ')),
        warn:  (...args: any[]) => logs.push('warn: '  + args.map(String).join(' ')),
      };
      // responseBody is passed as undefined so scripts that reference it get a clear warning
      // rather than a ReferenceError that swallows the rest of the script
      new Function('pm', 'console', 'responseBody', script)(pm, console, undefined);
      await Promise.all(pendingRequests);
      return { success: true, logs, testResults: (pm as any)._testResults };
    } catch (error: any) {
      logs.push(`Script error: ${error.message}`);
      return { success: false, error: error.message, logs, testResults: [] };
    }
  }
}
