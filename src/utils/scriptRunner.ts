import { ApiResponse, Environment, ScriptContext } from '../types';

export class ScriptRunner {
  private static createPmObject(response: ApiResponse | null, environment: Environment, logs: string[]): any {
    const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

    return {
      environment: {
        get: (key: string) => {
          const value = environment.variables[key] || '';
          logs.push(`[pm.environment.get] ${key} = ${value}`);
          return value;
        },
        set: (key: string, value: string) => {
          environment.variables[key] = value;
          logs.push(`[pm.environment.set] ${key} = ${value}`);
        }
      },
      response: response ? {
        status: response.status,
        code: response.status, // Postman uses 'code' as well
        statusText: response.statusText,
        headers: response.headers,
        json: () => {
          logs.push(`[pm.response.json] Called`);
          return response.data;
        },
        text: () => {
          const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          logs.push(`[pm.response.text] Length: ${text.length} chars`);
          return text;
        },
        time: response.time,
        responseSize: response.size,
        // Add Postman-style assertion API that can be used in conditionals
        to: {
          have: {
            status: (expectedStatus: number) => {
              const matches = response.status === expectedStatus;
              logs.push(`[pm.response.to.have.status] Expected ${expectedStatus}, got ${response.status} - ${matches ? 'PASS' : 'FAIL'}`);
              return matches; // Return boolean instead of throwing
            }
          }
        }
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
      logs.push('=== Pre-Request Script Execution Started ===');

      // Create a safe execution context
      const pm = this.createPmObject(null, environment, logs);
      const console = {
        log: (...args: any[]) => {
          logs.push('[console.log] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        },
        error: (...args: any[]) => {
          logs.push('[console.error] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        },
        warn: (...args: any[]) => {
          logs.push('[console.warn] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        }
      };

      // Create a function with controlled scope
      const scriptFunction = new Function('pm', 'console', script);
      scriptFunction(pm, console);

      logs.push('=== Pre-Request Script Completed Successfully ===');
      return { success: true, logs };
    } catch (error: any) {
      logs.push(`=== Pre-Request Script Failed ===`);
      logs.push(`Error: ${error.message}`);
      logs.push(`Stack: ${error.stack}`);
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
      logs.push('=== Test Script Execution Started ===');
      logs.push(`Response Status: ${response.status} ${response.statusText}`);
      logs.push(`Response Time: ${response.time}ms`);

      const pm = this.createPmObject(response, environment, logs);
      const console = {
        log: (...args: any[]) => {
          logs.push('[console.log] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        },
        error: (...args: any[]) => {
          logs.push('[console.error] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        },
        warn: (...args: any[]) => {
          logs.push('[console.warn] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
        }
      };

      // Create a function with controlled scope
      const scriptFunction = new Function('pm', 'console', script);
      scriptFunction(pm, console);

      logs.push('=== Test Script Completed Successfully ===');
      return {
        success: true,
        logs,
        testResults: (pm as any)._testResults || []
      };
    } catch (error: any) {
      logs.push(`=== Test Script Failed ===`);
      logs.push(`Error: ${error.message}`);
      logs.push(`Stack: ${error.stack}`);
      return { success: false, error: error.message, logs, testResults: [] };
    }
  }
}