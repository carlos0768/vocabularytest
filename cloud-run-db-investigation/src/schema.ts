import { z } from 'zod';

export const changedFileSchema = z.object({
  path: z.string().min(1),
  changeType: z.enum(['added', 'modified', 'removed', 'renamed']).optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  patch: z.string().optional(),
});

export const investigationRequestSchema = z.object({
  repository: z.string().min(1),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().optional(),
  commitSha: z.string().optional(),
  actor: z.string().optional(),
  triggeredAt: z.string().datetime().optional(),
  source: z.enum(['github-webhook', 'github-actions', 'manual']).optional(),
  changedFiles: z.array(changedFileSchema).min(1).max(500),
});
