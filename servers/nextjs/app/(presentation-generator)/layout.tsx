import React from "react";

import { requireAppSession } from "@/utils/serverAuth";
import { ConfigurationInitializer } from "../ConfigurationInitializer";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // The Web server supplies the public editor shell only. Kit's browser
  // AccessGate and the PC Integration provider authorize every business request.
  if (!process.env.NEXT_PUBLIC_NIMI_WEB_CONFIG) await requireAppSession();
  return (
    <div>
      <ConfigurationInitializer>{children}</ConfigurationInitializer>
    </div>
  );
}
