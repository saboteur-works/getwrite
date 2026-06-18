import { afterEach } from "vitest";
import { __resetIndexerForTests } from "../../frontend/src/lib/models/indexer-queue";

// CLI commands write resources/sidecars through @gw/core, which lazily starts a
// recursive `fs.watch` backlinks watcher (indexer-queue.ts). When a test then
// deletes its temp project dir while that watcher is live, Node's internal
// recursive-watch walk throws an uncaught ENOENT on Linux and fails the run.
//
// Closing any active watcher after each test averts the crash: the inotify
// change event that triggers the bad walk is a macrotask, while this afterEach
// runs on the microtask continuation right after the test's `fs.rm`, so
// `watcher.close()` lands before the event is processed. The import resolves to
// the same indexer-queue singleton the `@gw/core` barrel uses.
afterEach(() => {
  __resetIndexerForTests();
});
