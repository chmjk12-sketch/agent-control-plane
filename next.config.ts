import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*"],
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
