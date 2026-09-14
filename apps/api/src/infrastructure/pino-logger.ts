import pino from 'pino';
import type { Logger } from '../shared/observability/logger.interface.js';
export function createLogger(level = 'info', destination?: pino.DestinationStream): Logger {
  const logger = pino(
    {
      level,
      redact: [
        'databaseUrl',
        'password',
        'credentials',
        'feedback',
        'headers.authorization',
        'headers.cookie',
      ],
    },
    destination,
  );
  return {
    event: (event, fields = {}) => logger.info({ ...fields, event }),
    error: (event, fields = {}) => logger.error({ ...fields, event }),
  };
}
