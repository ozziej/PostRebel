import { ApiRequest, ApiResponse, Environment, Certificate } from '../types';

export class HttpService {
  private static replaceVariables(text: string, environment: Environment): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return environment.variables[varName] || match;
    });
  }

  static async executeRequest(
    request: ApiRequest,
    environment: Environment,
    certificates: Certificate[] = []
  ): Promise<ApiResponse> {
    const startTime = Date.now();

    try {
      // Replace variables in URL
      const url = this.replaceVariables(request.url, environment);

      console.log('[HTTP Service] Making request via main process (no CORS!):', url);

      // Replace variables in headers
      const headers: Record<string, string> = {};
      Object.entries(request.headers).forEach(([key, value]) => {
        headers[key] = this.replaceVariables(value, environment);
      });

      // Add authentication
      if (request.auth) {
        switch (request.auth.type) {
          case 'bearer':
            const token = this.replaceVariables(request.auth.bearer || '', environment);
            headers['Authorization'] = `Bearer ${token}`;
            break;
          case 'basic':
            if (request.auth.basic) {
              const username = this.replaceVariables(request.auth.basic.username, environment);
              const password = this.replaceVariables(request.auth.basic.password, environment);
              const credentials = btoa(`${username}:${password}`);
              headers['Authorization'] = `Basic ${credentials}`;
            }
            break;
          case 'jwt':
            const jwtToken = this.replaceVariables(request.auth.jwt || '', environment);
            headers['Authorization'] = `JWT ${jwtToken}`;
            break;
        }
      }

      // Prepare request config for main process
      const config: any = {
        method: request.method.toLowerCase(),
        url,
        headers,
        timeout: 30000, // 30 second timeout
        rejectUnauthorized: true // Default: verify certificates
      };

      // Handle custom certificates
      if (certificates.length > 0) {
        const urlHost = new URL(url).hostname;
        const relevantCerts = certificates.filter(cert =>
          cert.host === '*' || cert.host === urlHost || urlHost.endsWith(cert.host)
        );

        if (relevantCerts.length > 0) {
          console.log(`[HTTP Service] Found ${relevantCerts.length} certificate(s) for ${urlHost}:`,
            relevantCerts.map(c => ({ name: c.name, host: c.host, type: c.type }))
          );

          // Disable certificate verification for this request in main process
          config.rejectUnauthorized = false;

          console.log(`[HTTP Service] Certificate verification disabled for ${urlHost}`);
        } else {
          console.log(`[HTTP Service] No matching certificates found for ${urlHost}`);
          console.log(`[HTTP Service] Available certificate hosts:`, certificates.map(c => c.host));
        }
      } else {
        console.log('[HTTP Service] No certificates configured');
      }

      // Handle request body
      if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        switch (request.body.type) {
          case 'raw': {
            config.data = this.replaceVariables(request.body.data as string, environment);
            if (!headers['Content-Type']) {
              const rawContentTypes: Record<string, string> = {
                text: 'text/plain',
                javascript: 'application/javascript',
                json: 'application/json',
                html: 'text/html',
                xml: 'application/xml',
              };
              headers['Content-Type'] = rawContentTypes[request.body.rawSubtype || 'json'] || 'application/json';
            }
            break;
          }
          case 'binary': {
            // Pass base64 data to main process for decoding
            if (request.body.data) {
              config.binaryData = request.body.data;
            }
            if (!headers['Content-Type']) {
              headers['Content-Type'] = 'application/octet-stream';
            }
            break;
          }
          case 'x-www-form-urlencoded':
            // Use formData array if available, otherwise fall back to data string
            if (request.body.formData && request.body.formData.length > 0) {
              const params = new URLSearchParams();
              request.body.formData
                .filter(item => item.enabled && item.key)
                .forEach(item => {
                  const value = this.replaceVariables(item.value, environment);
                  params.append(item.key, value);
                  console.log(`[HTTP Service] Form param: ${item.key} = ${value}`);
                });
              // Convert to string for transmission to main process
              config.data = params.toString();
              console.log('[HTTP Service] x-www-form-urlencoded body:', config.data);
            } else if (typeof request.body.data === 'string' && request.body.data) {
              // Legacy support for string data
              config.data = new URLSearchParams(request.body.data).toString();
              console.log('[HTTP Service] x-www-form-urlencoded body (legacy):', config.data);
            }
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            break;
          case 'form-data':
            // Use formData array if available
            if (request.body.formData && request.body.formData.length > 0) {
              const formData = new FormData();
              request.body.formData
                .filter(item => item.enabled && item.key)
                .forEach(item => {
                  const value = this.replaceVariables(item.value, environment);
                  formData.append(item.key, value);
                });
              config.data = formData;
            } else {
              config.data = request.body.data;
            }
            // Don't set Content-Type, let axios handle it for form-data
            delete headers['Content-Type'];
            break;
        }
      }

      // Execute request via main process (Node.js) - NO CORS!
      console.log('[HTTP Service] ========== REQUEST DEBUG ==========');
      console.log('[HTTP Service] Method:', config.method.toUpperCase());
      console.log('[HTTP Service] URL:', config.url);
      console.log('[HTTP Service] Headers:', config.headers);
      console.log('[HTTP Service] Body:', config.data);
      console.log('[HTTP Service] Body type:', typeof config.data);
      console.log('[HTTP Service] =====================================');

      const result = await window.electronAPI.executeHttpRequest(config);

      if (result.success && result.response) {
        console.log('[HTTP Service] Request successful:', result.response.status);
        return result.response;
      } else if (result.error) {
        // Handle network error from main process
        // Re-throw with proper structure for error handling below
        const error: any = new Error(result.error.message);
        error.code = result.error.code;
        error.request = true; // Mark as request error (not response error)
        throw error;
      } else {
        throw new Error('Unknown error from main process');
      }

    } catch (error: any) {
      const endTime = Date.now();
      const requestUrl = this.replaceVariables(request.url, environment);

      if (error.response) {
        // Server responded with error status (4xx, 5xx)
        return {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers as Record<string, string>,
          data: error.response.data,
          time: endTime - startTime,
          size: JSON.stringify(error.response.data || '').length
        };
      } else if (error.request) {
        // Request was made but no response received
        // This covers network errors, timeouts, certificate errors, etc.

        console.error('[HTTP Service] Request error details:', {
          code: error.code,
          message: error.message,
          errno: error.errno,
          syscall: error.syscall,
          fullError: error
        });

        let errorMessage = '';
        let errorTitle = 'Network Error';
        let troubleshooting = '';

        // Certificate errors
        if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
            error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
            error.code === 'CERT_HAS_EXPIRED' ||
            error.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
            error.message?.toLowerCase().includes('certificate') ||
            error.message?.toLowerCase().includes('cert') ||
            error.message?.toLowerCase().includes('ssl') ||
            error.message?.toLowerCase().includes('tls')) {

          errorTitle = 'Certificate Error';
          errorMessage = error.message || 'SSL/TLS certificate validation failed';
          troubleshooting = `
Certificate Issue Detected:

1. The server's certificate is invalid or untrusted
2. This could be because:
   • Self-signed certificate
   • Expired certificate
   • Certificate not issued for this domain
   • Missing intermediate certificates

How to Fix:
→ Click "🔒 Manage Certificates" in the sidebar
→ Add the server's CA certificate
→ Set the host to match your API domain

Technical Details:
Error Code: ${error.code || 'CERT_ERROR'}
${error.message}`;

        } else if (error.code === 'ECONNREFUSED') {
          errorTitle = 'Connection Refused';
          errorMessage = 'The server refused the connection';
          troubleshooting = `
The server is not accepting connections on this port.

Possible causes:
• Server is not running
• Wrong port number
• Firewall blocking the connection
• Server crashed or restarting

URL: ${requestUrl}`;

        } else if (error.code === 'ENOTFOUND') {
          errorTitle = 'Domain Not Found';
          errorMessage = 'Could not resolve the domain name';
          troubleshooting = `
DNS lookup failed - the domain doesn't exist or can't be found.

Check:
• Is the domain spelled correctly?
• Are you connected to the internet?
• Is this an internal domain that requires VPN?

URL: ${requestUrl}`;

        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          errorTitle = 'Request Timeout';
          errorMessage = 'The server took too long to respond (30s timeout)';
          troubleshooting = `
The request timed out after 30 seconds.

Possible causes:
• Server is overloaded or slow
• Network connectivity issues
• API endpoint is stuck processing

URL: ${requestUrl}`;

        } else if (error.code === 'ECONNRESET') {
          errorTitle = 'Connection Reset';
          errorMessage = 'The server closed the connection unexpectedly';
          troubleshooting = `
The connection was reset by the server.

This can happen when:
• Server crashed while processing
• Load balancer or proxy killed the connection
• Network issue between you and server

URL: ${requestUrl}`;

        } else {
          // Generic network error
          errorMessage = error.message || 'Unable to reach the server';
          troubleshooting = `
Full error details:
${error.message}

Error Code: ${error.code || 'UNKNOWN'}
${error.syscall ? `System Call: ${error.syscall}` : ''}
${error.errno ? `Error Number: ${error.errno}` : ''}

URL: ${requestUrl}`;
        }

        return {
          status: 0,
          statusText: errorTitle,
          headers: {},
          data: {
            error: true,
            message: errorMessage,
            troubleshooting: troubleshooting.trim(),
            code: error.code,
            details: error.message,
            url: requestUrl
          },
          time: endTime - startTime,
          size: 0
        };
      } else {
        // Something else went wrong (config error, etc.)
        return {
          status: 0,
          statusText: 'Request Failed',
          headers: {},
          data: {
            error: true,
            message: `Request Error: ${error.message}`,
            details: error.toString()
          },
          time: endTime - startTime,
          size: 0
        };
      }
    }
  }

  static extractTokenFromResponse(response: ApiResponse, path: string): string | null {
    try {
      // Simple path extraction like "data.token" or "access_token"
      const pathParts = path.split('.');
      let value = response.data;

      for (const part of pathParts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          return null;
        }
      }

      return typeof value === 'string' ? value : String(value);
    } catch {
      return null;
    }
  }
}