import { SerialPrismaPg } from './serial-prisma-pg.js';
import { PrismaClient } from '../../generated/prisma/client.js';

export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
  const adapter = new SerialPrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
