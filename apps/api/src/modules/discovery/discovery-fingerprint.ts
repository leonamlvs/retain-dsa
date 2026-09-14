import { createHash } from 'node:crypto';
import type { Skill, Difficulty } from '../../domain/catalog.schema.js';
import type { StudyConfig } from '../../config/study-config.schema.js';

export function discoveryFingerprint(
  skill: Skill,
  difficulty: Difficulty,
  config: StudyConfig,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: 'leetcode',
        queryVersion: config.discovery.queryVersion,
        filterProtocol: 'single-topic-local-conjunction-v2',
        mappingVersion: skill.mappingVersion,
        tags: skill.tags,
        skill: skill.slug,
        difficulty,
        freeOnly: true,
        ordering: 'provider-default-v1',
        pageSize: config.discovery.pageSize,
        maximumPages: config.discovery.maximumPages,
      }),
    )
    .digest('hex');
}
