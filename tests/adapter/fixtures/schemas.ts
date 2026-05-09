import { z } from 'zod';
import * as v from 'valibot';
import { type } from 'arktype';

// Zod v4 — implements Standard Schema natively
export const zodUserBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const zodIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

// Valibot v1 — implements Standard Schema natively
export const valibotUserBody = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.pipe(v.string(), v.minLength(1)),
});

// ArkType v2 — implements Standard Schema natively
export const arktypeUserBody = type({
  email: 'string.email',
  name: 'string > 0',
});
