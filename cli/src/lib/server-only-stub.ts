/**
 * Empty stand-in for the `server-only` package in the CLI bundle and tests.
 *
 * `server-only` is a Next.js bundler guard that throws when imported outside a
 * server component. The CLI is a plain Node process, so the guard has nothing to
 * protect; aliasing it here lets shared frontend modules that carry the guard
 * (for example `auth-config`, read by the project-type resolver) load in the CLI.
 */
export {};
