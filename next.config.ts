import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow dev access via tunnel hostname (same idea as Vite `server.allowedHosts`). */
  allowedDevOrigins: ["ctl.tunlarrr.com"],
};

export default nextConfig;
