import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf8"),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Inlined into the client bundle at build time so the UI can display the
  // running version. Desktop and web builds share this synced version number.
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
