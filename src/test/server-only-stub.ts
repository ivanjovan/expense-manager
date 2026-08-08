/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package exists to make importing a server module from a client
 * component a *build* error, and it enforces it by throwing on import
 * outside React's `react-server` condition — which a plain Node test runner
 * is. Aliasing it to this empty module lets tests exercise server modules
 * directly; the production guarantee is unaffected, since it is Next's
 * bundler, not the test runner, that the guard is aimed at.
 *
 * Wired up in vitest.config.mts.
 */
export {};
