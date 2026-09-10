import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo intentionally has no AGENTS.md/CLAUDE.md; don't auto-generate them.
  agentRules: false,
  serverExternalPackages: ["sqlite"],
};

export default nextConfig;
