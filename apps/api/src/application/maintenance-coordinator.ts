import { randomUUID } from 'node:crypto';
import type { StudyConfig } from '../config/study-config.schema.js';
import type { Clock } from '../domain/clock.interface.js';
import type { DiscoveryNeed } from '../modules/discovery/discovery-need.interface.js';
import type { DiscoveryPage } from '../modules/discovery/problem-provider.interface.js';
import type { ProblemProvider } from '../modules/discovery/problem-provider.interface.js';
import type { Logger } from '../shared/observability/logger.interface.js';
import { errorDetails } from '../shared/observability/error-details.js';

export class MaintenanceCoordinator {
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly study: MaintenanceStudyService,
    private readonly provider: ProblemProvider | ((config: StudyConfig) => ProblemProvider),
    private readonly clock: Clock,
    private readonly config: StudyConfig,
    private readonly logger: Logger,
    private readonly reportProviderHealth: (status: 'available' | 'degraded') => void = () =>
      undefined,
  ) {}

  run(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.execute().finally(() => (this.running = null));
    return this.running;
  }

  private async execute(): Promise<void> {
    const operationId = randomUUID();
    const config = (await this.study.activeConfiguration?.()) ?? this.config;
    if (
      this.study.claimMaintenance &&
      !(await this.study.claimMaintenance(operationId, config.version))
    )
      return;
    try {
      await this.process(operationId, config);
    } finally {
      await this.study.releaseMaintenance?.(operationId);
    }
  }

  private async process(operationId: string, config: StudyConfig): Promise<void> {
    const provider = typeof this.provider === 'function' ? this.provider(config) : this.provider;
    const operationDeadline = new Date(this.clock.now().getTime() + config.discovery.totalBudgetMs);
    const needs = await this.study.discoveryNeeds(config.version);
    let failed = false;
    for (const original of needs) {
      if (this.clock.now() >= operationDeadline) break;
      let need = { ...original, catalogRevision: await this.study.currentCatalogRevision() };
      let conflicts = 0;
      const needDeadline = new Date(
        Math.min(
          operationDeadline.getTime(),
          this.clock.now().getTime() + config.discovery.perNeedBudgetMs,
        ),
      );
      for (let page = 0; page < config.discovery.maximumPages; page++) {
        const deadline = needDeadline;
        if (this.clock.now() >= deadline) break;
        try {
          this.logger.event('discovery.started', {
            operationId,
            skill: need.skill.slug,
            difficulty: need.difficulty,
            fingerprint: need.fingerprint,
            scanId: need.scanId,
            offset: need.offset,
            catalogRevision: need.catalogRevision.toString(),
          });
          const result = await provider.discover(
            {
              skill: need.skill,
              difficulty: need.difficulty,
              offset: need.offset,
              limit: config.discovery.pageSize,
              freeOnly: true,
            },
            deadline,
          );
          need = await this.study.acceptDiscoveryPage(need, result);
          if (need.restartRequired) {
            this.logger.event('discovery.cursor_restarted', {
              operationId,
              skill: need.skill.slug,
              difficulty: need.difficulty,
              fingerprint: need.fingerprint,
              scanId: need.scanId,
            });
            need = { ...need, restartRequired: false };
            page -= 1;
            continue;
          }
          this.logger.event('discovery.completed', {
            operationId,
            skill: need.skill.slug,
            difficulty: need.difficulty,
            fingerprint: need.fingerprint,
            scanId: need.scanId,
            count: result.problems.length,
            exhausted: result.exhausted,
          });
          if (
            result.exhausted ||
            (await this.study.cachedSupply(need)) >= config.discovery.targetPool
          )
            break;
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'STALE_CATALOG_REVISION' &&
            conflicts < config.discovery.retries &&
            this.clock.now() < operationDeadline
          ) {
            conflicts += 1;
            need = { ...need, catalogRevision: await this.study.currentCatalogRevision() };
            page -= 1;
            this.logger.event('discovery.revision_conflict', {
              skill: need.skill.slug,
              difficulty: need.difficulty,
              conflicts,
            });
            continue;
          }
          this.logger.error('discovery.provider_failed', {
            operationId,
            error: errorDetails(error),
            skill: need.skill.slug,
            difficulty: need.difficulty,
            fingerprint: need.fingerprint,
            scanId: need.scanId,
            offset: need.offset,
            catalogRevision: need.catalogRevision.toString(),
            code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
          });
          this.reportProviderHealth('degraded');
          failed = true;
          break;
        }
      }
    }
    if (needs.length) this.reportProviderHealth(failed ? 'degraded' : 'available');
    await this.study.replenish(
      config.version,
      this.study.claimMaintenance ? operationId : undefined,
    );
  }

  async drain(): Promise<void> {
    this.stopping = true;
    await this.running;
  }
}

export interface MaintenanceStudyService {
  claimMaintenance?(operationId: string, configVersion: string): Promise<boolean>;
  releaseMaintenance?(operationId: string): Promise<void>;
  activeConfiguration?(): Promise<StudyConfig>;
  discoveryNeeds(configVersion?: string): Promise<DiscoveryNeed[]>;
  currentCatalogRevision(): Promise<bigint>;
  cachedSupply(need: DiscoveryNeed): Promise<number>;
  acceptDiscoveryPage(need: DiscoveryNeed, page: DiscoveryPage): Promise<DiscoveryNeed>;
  replenish(configVersion?: string, operationId?: string): Promise<void>;
}
