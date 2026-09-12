import { z } from 'zod';
export const difficultySchema = z.enum(['Easy', 'Medium', 'Hard']);
export type Difficulty = z.infer<typeof difficultySchema>;
export const difficulties: readonly Difficulty[] = ['Easy', 'Medium', 'Hard'];
export const problemSchema = z.object({
  provider: z.literal('leetcode'),
  providerId: z.string().min(1),
  frontendId: z.string(),
  title: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().url(),
  difficulty: difficultySchema,
  paidOnly: z.boolean(),
  available: z.boolean(),
  tags: z.array(z.string()),
});
export type Problem = z.infer<typeof problemSchema>;
export const skillSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()),
  mappingVersion: z.string(),
  active: z.boolean(),
});
export type Skill = z.infer<typeof skillSchema>;
export const curriculumSnapshotSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    skills: z.array(skillSchema).min(1),
    problems: z.array(problemSchema).min(1),
    items: z
      .array(
        z.object({
          skillSlug: z.string().min(1),
          providerId: z.string().min(1),
          position: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  })
  .superRefine((snapshot, context) => {
    const skills = new Set(snapshot.skills.map((skill) => skill.slug));
    const problems = new Set(snapshot.problems.map((problem) => problem.providerId));
    if (skills.size !== snapshot.skills.length)
      context.addIssue({ code: 'custom', message: 'Curriculum skill identities must be unique.' });
    if (problems.size !== snapshot.problems.length)
      context.addIssue({
        code: 'custom',
        message: 'Curriculum problem identities must be unique.',
      });
    const itemKeys = new Set<string>();
    for (const item of snapshot.items) {
      if (!skills.has(item.skillSlug) || !problems.has(item.providerId))
        context.addIssue({
          code: 'custom',
          message: 'Curriculum items must reference this snapshot.',
        });
      const key = `${item.skillSlug}:${item.providerId}`;
      if (itemKeys.has(key))
        context.addIssue({ code: 'custom', message: 'Curriculum items must be unique.' });
      itemKeys.add(key);
    }
  });
export type CurriculumSnapshot = z.infer<typeof curriculumSnapshotSchema>;
export function problemKey(problem: Pick<Problem, 'provider' | 'providerId'>): string {
  return `${problem.provider}:${problem.providerId}`;
}
export function memoryKey(skill: string, difficulty: Difficulty): string {
  return `${skill}:${difficulty}`;
}
