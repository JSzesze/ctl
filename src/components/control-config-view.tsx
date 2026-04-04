"use client";

import { GatewayConfigDashboard } from "@/components/config/gateway-config-dashboard";
import { GatewayConnectionCard } from "@/components/config/gateway-connection-card";

/**
 * Config hub: compact gateway connection card + full <code>config.get</code> / <code>config.set</code> tree.
 */
export function ControlConfigView() {
  return (
    <div className="space-y-8">
      <GatewayConnectionCard />
      <GatewayConfigDashboard />
    </div>
  );
}
