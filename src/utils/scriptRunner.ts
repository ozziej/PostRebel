import { ApiResponse, Environment } from '../types';

export class ScriptRunner {
  private static createPmObject(response: ApiResponse | null, environment: Environment, logs: string[]): any {
    const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

    return {
      environment: {
        get: (key: string) => environment.variables[key] || '',
        set: (key: string, value: string) => { environment.variables[key] = value; },
      },
      response: response ? {
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
      } : null,
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

  static executePreRequestScript(
    script: string,
    environment: Environment,
  ): { success: boolean; error?: string; logs: string[] } {
    const logs: string[] = [];
    try {
      const pm = this.createPmObject(null, environment, logs);
      const console = {
        log:   (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('error: ' + args.map(String).join(' ')),
        warn:  (...args: any[]) => logs.push('warn: '  + args.map(String).join(' ')),
      };
      new Function('pm', 'console', script)(pm, console);
      return { success: true, logs };
    } catch (error: any) {
      logs.push(`Script error: ${error.message}`);
      return { success: false, error: error.message, logs };
    }
  }

  static executeTestScript(
    script: string,
    response: ApiResponse,
    environment: Environment,
  ): { success: boolean; error?: string; logs: string[]; testResults: any[] } {
    const logs: string[] = [];

    if (/\bresponseBody\b/.test(script)) {
      logs.push('⚠ Warning: "responseBody" is a legacy Postman variable and is not supported here. Use pm.response.text() or pm.response.json() instead.');
    }

    try {
      const pm = this.createPmObject(response, environment, logs);
      const console = {
        log:   (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('error: ' + args.map(String).join(' ')),
        warn:  (...args: any[]) => logs.push('warn: '  + args.map(String).join(' ')),
      };
      // responseBody is passed as undefined so scripts that reference it get a clear warning
      // rather than a ReferenceError that swallows the rest of the script
      new Function('pm', 'console', 'responseBody', script)(pm, console, undefined);
      return { success: true, logs, testResults: (pm as any)._testResults };
    } catch (error: any) {
      logs.push(`Script error: ${error.message}`);
      return { success: false, error: error.message, logs, testResults: [] };
    }
  }
}