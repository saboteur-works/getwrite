/**
 * @module readiness-http
 *
 * The Node `http` sender for the readiness poll (`server-readiness.ts`). It
 * sends no headers of its own beyond those Node adds, follows no redirect and
 * reads at most {@link MAX_READINESS_BODY_BYTES} of a body, so a foreign peer
 * can neither receive a secret nor make the main process buffer without bound.
 */
import http from "node:http";
import type { ReadinessGet } from "./server-readiness";

/** The proof body is about 80 bytes; anything longer is not the server. */
export const MAX_READINESS_BODY_BYTES = 4096;

/** One GET with an abort signal; rejects on a connection error or abort. */
export const httpReadinessGet: ReadinessGet = (url, signal) =>
  new Promise((resolve, reject) => {
    const request = http.get(url, { signal }, (res) => {
      const chunks: Buffer[] = [];
      let length = 0;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        const body = Buffer.concat(chunks)
          .subarray(0, MAX_READINESS_BODY_BYTES)
          .toString("utf8");
        resolve({ statusCode: res.statusCode, body });
      };
      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        length += chunk.length;
        if (length > MAX_READINESS_BODY_BYTES) {
          finish();
          res.destroy();
        }
      });
      res.on("end", finish);
      res.on("error", (error) => (done ? undefined : reject(error)));
      res.on("close", finish);
    });
    request.on("error", reject);
  });
