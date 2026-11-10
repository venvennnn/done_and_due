import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  serverExternalPackages: ["sharp", "@google/genai"],
  poweredByHeader: false,
};

export default nextConfig;
