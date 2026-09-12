import type {
  CurriculumSnapshot,
  Difficulty,
  Problem,
  Skill,
} from '../../domain/catalog.schema.js';
export interface DiscoveryCriteria {
  skill: Skill;
  difficulty: Difficulty;
  offset: number;
  limit: number;
  freeOnly: true;
}
export interface DiscoveryPage {
  // Raw metadata from the provider scan. Skill eligibility and structural proof
  // apply all required tags locally; offsets/counts include nonmatching metadata.
  problems: Problem[];
  offset: number;
  nextOffset: number;
  total: number;
  exhausted: boolean;
}
export interface ProblemProvider {
  curriculum(deadline: Date): Promise<CurriculumSnapshot>;
  discover(criteria: DiscoveryCriteria, deadline: Date): Promise<DiscoveryPage>;
}
export interface SupplySnapshot {
  skillSlug: string;
  difficulty: Difficulty;
  fingerprint: string;
  catalogRevision: number;
  complete: boolean;
  providerIds: readonly string[];
  observedAt: string;
  validUntil: string;
}
