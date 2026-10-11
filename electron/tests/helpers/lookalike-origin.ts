/**
 * A valid origin that differs from the trusted one only by port, for sender
 * checks. Derived arithmetically from the input port: appending a digit to a
 * port string is not valid for every port (7340 becomes 73401, which `new URL`
 * rejects), so a refusal of such a string says nothing about the origin
 * comparison.
 */

/** A valid port, one away from `port`, never equal to it. */
function lookalikePort(port: number): number {
  return port < 65535 ? port + 1 : port - 1;
}

/** `http://localhost:<lookalikePort(port)>/`. */
export function lookalikeOriginUrl(port: number): string {
  return `http://localhost:${lookalikePort(port)}/`;
}
