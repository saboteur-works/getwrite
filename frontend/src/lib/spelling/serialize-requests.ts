/**
 * @module serialize-requests
 *
 * A worker receives messages while an earlier one is still awaited, and the
 * client posts `init` and the first `check` back to back. The handler of
 * `worker-protocol.ts` is async, so without this the `check` would reach the
 * engine before `init` had loaded it. This runs requests one at a time, in
 * arrival order.
 */
export function serializeRequests<Reply>(
  handler: (request: unknown) => Promise<Reply>,
): (request: unknown) => Promise<Reply> {
  let tail: Promise<unknown> = Promise.resolve();
  return (request) => {
    const result = tail.then(() => handler(request));
    tail = result.catch(() => undefined);
    return result;
  };
}
