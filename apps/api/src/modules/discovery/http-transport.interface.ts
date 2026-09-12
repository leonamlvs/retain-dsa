export interface JsonResponse {
  status: number;
  retryAfter: string | null;
  body: unknown;
}
export interface HttpTransport {
  post(url: string, body: unknown, timeoutMs: number): Promise<JsonResponse>;
}
