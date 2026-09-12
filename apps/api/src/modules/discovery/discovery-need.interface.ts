import type { Difficulty, Skill } from '../../domain/catalog.schema.js';

export interface DiscoveryNeed {
  skill: Skill;
  skillId: string;
  difficulty: Difficulty;
  fingerprint: string;
  scanId: string;
  offset: number;
  catalogRevision: bigint;
  configVersion: string;
  generation: string;
  userSourceSequence: bigint;
  restartRequired?: boolean;
}
