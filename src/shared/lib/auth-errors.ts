/**
 * Auth failure types, kept in a module of their own so that anything needing
 * to *recognise* one — Server Actions, Route Handlers — doesn't have to
 * import `session.ts` and drag Auth.js and Prisma along with it.
 */

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}
