"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delay={300}>
        {children}
      </TooltipProvider>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          className: "!bg-card !text-card-foreground !border-border",
        }}
      />
    </SessionProvider>
  );
}
