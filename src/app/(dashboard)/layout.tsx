"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:flex md:flex-col">
        <Sidebar />
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden fixed top-4 left-4 z-30"
              aria-label="Open menu"
            />
          }
        >
          <Menu size={18} className="text-foreground" />
        </SheetTrigger>
        <SheetContent className="p-0 w-[280px] sm:max-w-[280px]" side="left" showCloseButton={false}>
          <Sidebar onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex flex-1 flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
