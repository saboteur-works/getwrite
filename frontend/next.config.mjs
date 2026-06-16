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
  // The app doesn't use next/image, so disable image optimization. This stops
  // Next from ever loading the native `sharp` binary at runtime — it's required
  // only lazily by the image optimizer, which is now never invoked. That matters
  // for the x64 desktop build: the standalone bundle still carries a single
  // arch-specific sharp binary (darwin-arm64, since it's built on Apple Silicon),
  // and disabling optimization guarantees that wrong-arch binary is never loaded
  // on Intel. (Next pulls sharp into its global server trace regardless of config,
  // so it can't be excluded from the bundle here — but it's now dead, unused weight.)
  images: { unoptimized: true },
  // Inlined into the client bundle at build time so the UI can display the
  // running version. Desktop and web builds share this synced version number.
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
