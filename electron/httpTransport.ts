import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';

// Shared by the Electron 'execute-http-request' IPC handler and the headless
// CLI runner — the actual axios call has no Electron dependency, only Node's.

export interface HttpTransportRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: any;
  binaryData?: string;
  timeout?: number;
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface HttpTransportResult {
  success: boolean;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    time: number;
    size: number;
  };
  error?: { code?: string; message: string; time: number };
}

export async function executeHttpConfig(requestConfig: HttpTransportRequest): Promise<HttpTransportResult> {
  const startTime = Date.now();

  try {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: requestConfig.rejectUnauthorized !== false,
      ca: requestConfig.ca,
      cert: requestConfig.cert,
      key: requestConfig.key,
    });

    let requestData = requestConfig.data;
    if (requestConfig.binaryData) {
      requestData = Buffer.from(requestConfig.binaryData, 'base64');
    }

    const config: AxiosRequestConfig = {
      method: requestConfig.method,
      url: requestConfig.url,
      headers: requestConfig.headers || {},
      data: requestData,
      timeout: requestConfig.timeout || 30000,
      httpsAgent,
      maxRedirects: 5,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    };

    const response = await axios(config);
    const endTime = Date.now();

    const contentTypeRaw = response.headers['content-type'];
    const contentType: string = (Array.isArray(contentTypeRaw) ? contentTypeRaw[0] : (contentTypeRaw || '')).toString().toLowerCase();
    const rawBuffer: Buffer = Buffer.from(response.data);
    const byteSize = rawBuffer.length;

    let responseData: any;
    if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      responseData = rawBuffer.toString('base64');
    } else {
      const text = rawBuffer.toString('utf8');
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        try { responseData = JSON.parse(text); } catch { responseData = text; }
      } else {
        responseData = text;
      }
    }

    return {
      success: true,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as any,
        data: responseData,
        time: endTime - startTime,
        size: byteSize,
      },
    };
  } catch (error: any) {
    const endTime = Date.now();

    if (error.response) {
      return {
        success: true,
        response: {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
          time: endTime - startTime,
          size: JSON.stringify(error.response.data || '').length,
        },
      };
    }

    return {
      success: false,
      error: { code: error.code, message: error.message, time: endTime - startTime },
    };
  }
}
