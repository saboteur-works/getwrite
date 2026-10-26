// Test host: runs a Web Worker script in a node:worker_threads Worker, giving it
// self.postMessage / self.onmessage and a fetch that reads file: URLs (Task 6).
// The browser harness (Task 7) uses real Web Workers and does not use this file.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const hostUrl = import.meta.url;

export function spawnWorker(scriptPath) {
  return new Worker(fileURLToPath(hostUrl), { workerData: { script: pathToFileURL(scriptPath).href } });
}

if (!isMainThread && workerData?.script) {
  const realFetch = globalThis.fetch;
  globalThis.self = globalThis;
  globalThis.postMessage = (msg) => parentPort.postMessage(msg);
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (!href.startsWith("file:")) return realFetch(url, init);
    const body = await readFile(fileURLToPath(href));
    return new Response(body, { status: 200 });
  };
  await import(workerData.script);
  parentPort.on("message", (data) => globalThis.onmessage?.({ data }));
}
