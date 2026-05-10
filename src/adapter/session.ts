import type { Request } from 'express';
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { ValidationIssue } from '../errors/http-error.js';
import { renderPath } from './validation.js';

export type SessionDeclaration = true | StandardSchemaV1;

export interface SessionArmResult {
  value?: unknown;
  issues?: ValidationIssue[];
}

/**
 * Resolve the session slot (D-02).
 *
 * IMPORTANT: This module NEVER imports express-session. It reads req.session only —
 * the consumer is responsible for wiring express-session (or compatible session middleware).
 */
export async function resolveSessionArm(
  req: Request,
  declaration: SessionDeclaration | undefined,
): Promise<SessionArmResult> {
  if (declaration === undefined) return { value: undefined };
  const session = (req as Request & { session?: unknown }).session;
  if (declaration === true) return { value: session };
  const result = await Promise.resolve(declaration['~standard'].validate(session));
  if (result.issues && result.issues.length > 0) {
    return {
      issues: result.issues.map((iss) => ({
        slot: 'session' as const,
        path: iss.path && iss.path.length > 0 ? renderPath(iss.path) : '',
        message: iss.message ?? String(iss),
      } satisfies ValidationIssue)),
    };
  }
  return { value: 'value' in result ? result.value : undefined };
}
