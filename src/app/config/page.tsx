import type { Metadata } from "next";
import { ControlConfigView } from "@/components/control-config-view";

export const metadata: Metadata = {
  title: "Config",
};

export default function ConfigPage() {
  return <ControlConfigView />;
}
