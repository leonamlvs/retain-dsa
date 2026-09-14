import { request } from 'node:https';
import type {
  HttpTransport,
  JsonResponse,
} from '../../../modules/discovery/http-transport.interface.js';
import { DomainError } from '../../../domain/domain-error.js';
export class NodeHttpTransport implements HttpTransport {
  post(url: string, body: unknown, timeoutMs: number): Promise<JsonResponse> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(data),
            'user-agent': 'RetainDSA/0.1 (local metadata study client)',
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let length = 0;
          response.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > 5_000_000)
              req.destroy(
                new DomainError('PROVIDER_RESPONSE_TOO_LARGE', 'Metadata response exceeds limit.'),
              );
            else chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            try {
              resolve({
                status: response.statusCode ?? 502,
                retryAfter: response.headers['retry-after'] ?? null,
                body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              });
            } catch {
              if (response.statusCode !== 200)
                resolve({
                  status: response.statusCode ?? 502,
                  retryAfter: response.headers['retry-after'] ?? null,
                  body: null,
                });
              else
                reject(new DomainError('PROVIDER_SCHEMA_ERROR', 'Provider returned invalid JSON.'));
            }
          });
        },
      );
      const timer = setTimeout(
        () => req.destroy(new DomainError('PROVIDER_TIMEOUT', 'Provider request timed out.')),
        timeoutMs,
      );
      req.once('close', () => clearTimeout(timer));
      req.once('error', reject);
      req.end(data);
    });
  }
}
