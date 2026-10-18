# android/ (getwrite-android)

Paths relative to `android/` unless prefixed `frontend/`. Capacitor Android shell, sibling to `electron/`; design in `docs/architecture/ADRs/adr-021-native-android-via-capacitor-in-process.md`.

- `capacitor.config.ts` `webDir` is `../frontend/out`, the frontend static export.
- `pnpm --filter getwrite-android build` is a placeholder (logs a message); there is no Gradle build. CI `.github/workflows/build-android.yml` runs only that placeholder, not `build:native`.
- The app build is on the frontend: `pnpm build:native` (`GETWRITE_BUILD_TARGET=native`, `frontend/scripts/build-native-static.mjs`) copies `app/` minus `app/api/**` and the hosted-auth pages into `frontend/.native-build/` (never mutating `app/`), runs `next build` there with `output: "export"` (`frontend/next.config.mjs`), and emits `frontend/out/`. `app/(app)/layout.tsx` skips the auth redirect on native; `.browserslistrc` pins Chrome >= 67. Pages excluded from native are listed in `EXCLUDED_APP_SUBPATHS`.
- `frontend/getwrite-config` is a generated, gitignored link (symlink, or junction on Windows) to repo-root `getwrite-config/`, created by `frontend/scripts/ensure-config-link.mjs` (postinstall, prebuild, pretypecheck, native build).
- Runtime: `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`; root-layout `NativeBootstrap` calls `native-bootstrap.ts`; every `lib/api/*` and `store/` transport resolves in-process through `createTransport` with `native-*-backend.ts` (+ `.web-stub.ts`). See `frontend/CLAUDE.md`.
