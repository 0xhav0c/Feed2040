"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type FeedContextMenuProps = {
  feedId: string;
  feedTitle: string;
  onEdit: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
};

export function FeedContextMenu({ feedId, feedTitle, onEdit, onDelete }: FeedContextMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-[140px] rounded-xl border border-border bg-card p-1 shadow-xl">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onEdit(feedId, feedTitle);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete(feedId, feedTitle);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
