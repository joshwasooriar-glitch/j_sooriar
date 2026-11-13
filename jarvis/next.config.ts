import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This app lives in a subfolder of a repo with its own lockfile. Pin the root here.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // /api/health compares the database's applied migrations with the ones shipped here.
  outputFileTracingIncludes: { "/api/health": ["./supabase/migrations/*.sql"] },
};

export default nextConfig;
