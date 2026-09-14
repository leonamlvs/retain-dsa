import { Writable } from 'node:stream';
import { createLogger } from '../../../apps/api/src/infrastructure/pino-logger.js';
import { errorDetails } from '../../../apps/api/src/shared/observability/error-details.js';

test('structured logs redact credentials and feedback payloads', () => {
  let output = '';
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger('info', destination);
  logger.event('attempt.saved', {
    attemptId: 'attempt-one',
    password: 'database-secret',
    feedback: { answer: 'private-answer' },
    headers: { authorization: 'Bearer secret-token', cookie: 'session=secret' },
  });
  expect(output).toContain('attempt.saved');
  expect(output).toContain('attempt-one');
  expect(output).not.toContain('database-secret');
  expect(output).not.toContain('private-answer');
  expect(output).not.toContain('secret-token');
  expect(output).not.toContain('session=secret');
});

test('serializes error context with nested causes and bounded unknown values', () => {
  const cause = new Error('provider response was invalid');
  const error = new Error('discovery failed', { cause });
  Object.assign(error, { code: 'PROVIDER_SCHEMA_ERROR' });

  expect(errorDetails(error, false)).toMatchObject({
    name: 'Error',
    message: 'discovery failed',
    code: 'PROVIDER_SCHEMA_ERROR',
    cause: { name: 'Error', message: 'provider response was invalid' },
  });
  expect(errorDetails({ password: 'secret', details: { reason: 'invalid' } }, false)).toEqual({
    name: 'object',
    message: 'Unknown thrown value.',
    cause: { password: '[Redacted]', details: { reason: 'invalid' } },
  });
});

test('logs serialized error messages without exposing nested feedback', () => {
  let output = '';
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger('info', destination);
  logger.error('recommendation.refill_failed', {
    error: errorDetails(new Error('replay failed'), false),
    feedback: { answer: 'private-answer' },
  });

  expect(output).toContain('replay failed');
  expect(output).not.toContain('private-answer');
});
