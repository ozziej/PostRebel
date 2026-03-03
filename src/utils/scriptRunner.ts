import { ApiResponse, Environment, ScriptContext } from '../types';

export class ScriptRunner {
  private static createPmObject(response: ApiResponse | null, environment: Environment): any {
    const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

    return {
      environment: {
        get: (key: string) => environment.variables[key] || '',
        set: (key: string, value: string) => {
          environment.variables[key] = value;
        }
      },
      response: response ? {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        json: () => response.data,
        text: () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        time: response.time,
        responseSize: response.size
      } : null,
      test: (name: string, testFn: () => void) => {
        try {
          testFn();
          testResults.push({ name, passed: true });
          console.log(`✓ ${name}`);
        } catch (error: any) {
          testResults.push({ name, passed: false, error: error.message });
          console.log(`✗ ${name}: ${error.message}`);
        }
      },
      expect: (actual: any) => ({
        to: {
          equal: (expected: any) => {
            if (actual !== expected) {
              throw new Error(`Expected ${actual} to equal ${expected}`);
            }
          },
          be: {
            oneOf: (values: any[]) => {
              if (!values.includes(actual)) {
                throw new Error(`Expected ${actual} to be one of ${values.join(', ')}`);
              }
            }
          },
          have: {
            status: (expectedStatus: number) => {
              if (response && response.status !== expectedStatus) {
                throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
              }
            }
          }
        }
      }),
      _testResults: testResults
    };
  }

  static executePreRequestScript(
    script: string,
    environment: Environment
  ): { success: boolean; error?: string; logs: string[] } {
    const logs: string[] = [];

    try {
      // Create a safe execution context
      const pm = this.createPmObject(null, environment);
      const console = {
        log: (...args: any[]) => {
          logs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
        }
      };

      // Create a function with controlled scope
      const scriptFunction = new Function('pm', 'console', script);
      scriptFunction(pm, console);

      return { success: true, logs };
    } catch (error: any) {
      return { success: false, error: error.message, logs };
    }
  }

  static executeTestScript(
    script: string,
    response: ApiResponse,
    environment: Environment
  ): { success: boolean; error?: string; logs: string[]; testResults: any[] } {
    const logs: string[] = [];

    try {
      const pm = this.createPmObject(response, environment);
      const console = {
        log: (...args: any[]) => {
          logs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
        }
      };

      // Create a function with controlled scope
      const scriptFunction = new Function('pm', 'console', script);
      scriptFunction(pm, console);

      return {
        success: true,
        logs,
        testResults: (pm as any)._testResults || []
      };
    } catch (error: any) {
      return { success: false, error: error.message, logs, testResults: [] };
    }
  }
}