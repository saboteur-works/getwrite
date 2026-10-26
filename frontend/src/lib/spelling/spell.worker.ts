/**
 * @module spell.worker
 *
 * Entry of the classic Web Worker that hosts the spell-check engine (FR-21,
 * FR-23, FR-24). It applies the protocol of `worker-protocol.ts` to the nspell
 * adapter. Each `new URL(literal, import.meta.url)` is an asset reference the
 * bundler follows, so the two dictionary files are served from the app's own
 * `/_next/static/media/` path without being copied into the tracked tree.
 */
import { createFetchAssetLoader, createNspellEngine } from "./engine-nspell";
import { serializeRequests } from "./serialize-requests";
import { createWorkerHandler, type WorkerReply } from "./worker-protocol";

interface WorkerScope {
  location: { origin: string };
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: WorkerReply): void;
}

const scope = self as unknown as WorkerScope;

const handle = serializeRequests(
  createWorkerHandler(
    createNspellEngine({
      loadAssets: createFetchAssetLoader({
        affUrl: new URL(
          "../../../node_modules/dictionary-en/index.aff",
          import.meta.url,
        ).href,
        dicUrl: new URL(
          "../../../node_modules/dictionary-en/index.dic",
          import.meta.url,
        ).href,
        origin: scope.location.origin,
      }),
    }),
  ),
);

scope.onmessage = (event) => {
  void handle(event.data).then((reply) => scope.postMessage(reply));
};
