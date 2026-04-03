import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Allow dev HMR / dev resources when opening the app from non-localhost origins
   * (tunnel hostname, LAN IP, etc.).
   */
  allowedDevOrigins: ["ctl.tunlarrr.com", "10.69.1.135"],
};

export default nextConfig;
