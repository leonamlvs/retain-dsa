import { createHash, randomUUID } from 'node:crypto';
import type { ConfigurationRepository } from '../../application/configuration-repository.interface.js';
import { studyConfigSchema, type StudyConfig } from '../../config/study-config.schema.js';
import type { Clock } from '../../domain/clock.interface.js';
import { DomainError } from '../../domain/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaTransactions } from './prisma-transactions.js';

export class PrismaConfigurationRepository implements ConfigurationRepository {
  constructor(private readonly transactions: PrismaTransactions) {}

  async activate(config: StudyConfig, clock: Clock): Promise<void> {
    await this.transactions.write(async ({ db }) => {
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const now = clock.now();
      if (state.lastBusinessAt && now < state.lastBusinessAt)
        throw new DomainError(
          'CLOCK_REGRESSION',
          'Configuration activation precedes accepted business time.',
        );
      const existing = await db.configuration.findUnique({ where: { version: config.version } });
      const serialized = JSON.stringify(studyConfigSchema.parse(config));
      if (existing && JSON.stringify(studyConfigSchema.parse(existing.parameters)) !== serialized)
        throw new DomainError(
          'CONFIGURATION_VERSION_CONFLICT',
          'A configuration version cannot be changed.',
        );
      if (existing && state.activeConfig === config.version) return;
      if (!existing)
        await db.configuration.create({
          data: {
            version: config.version,
            parameters: config as Prisma.InputJsonValue,
            contentHash: createHash('sha256').update(serialized).digest('hex'),
          },
        });
      await db.configurationActivation.create({
        data: {
          id: randomUUID(),
          sequence: state.sourceSequence + 1n,
          activatedAt: now,
          version: config.version,
        },
      });
      await db.applicationState.update({
        where: { id: 1 },
        data: {
          activeConfig: config.version,
          sourceSequence: { increment: 1n },
          stateRevision: { increment: 1n },
          lastBusinessAt: now,
        },
      });
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      await db.workRequest.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          generation: user.generation,
          kind: 'REFILL',
          status: 'PENDING',
          requestedAt: now,
          nextRunAt: now,
          details: { reason: 'CONFIGURATION_ACTIVATED', version: config.version },
        },
      });
    });
  }
}
