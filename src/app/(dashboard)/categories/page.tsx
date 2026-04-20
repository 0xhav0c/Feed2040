"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FolderTree,
  Plus,
  Loader2,
  Trash2,
  X,
  GripVertical,
  Rss,
  Bookmark,
  Newspaper,
  Code,
  Bot,
  FlaskConical,
  Palette,
  TrendingUp,
  Gamepad2,
  Heart,
  BookOpen,
  Globe,
  Zap,
  Music,
  Camera,
  Coffee,
  Briefcase,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICON_OPTIONS: { value: string; Icon: LucideIcon }[] = [
  { value: "FolderTree", Icon: FolderTree },
  { value: "Rss", Icon: Rss },
  { value: "Bookmark", Icon: Bookmark },
  { value: "Newspaper", Icon: Newspaper },
  { value: "Code", Icon: Code },
  { value: "Bot", Icon: Bot },
  { value: "FlaskConical", Icon: FlaskConical },
  { value: "Palette", Icon: Palette },
  { value: "TrendingUp", Icon: TrendingUp },
  { value: "Gamepad2", Icon: Gamepad2 },
  { value: "Heart", Icon: Heart },
  { value: "BookOpen", Icon: BookOpen },
  { value: "Globe", Icon: Globe },
  { value: "Zap", Icon: Zap },
  { value: "Music", Icon: Music },
  { value: "Camera", Icon: Camera },
  { value: "Coffee", Icon: Coffee },
  { value: "Briefcase", Icon: Briefcase },
  { value: "GraduationCap", Icon: GraduationCap },
];

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#06b6d4",
  "#a855f7",
];

type CategoryData = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  _count: { feeds: number };
  children?: CategoryData[];
};

function flattenTree(cats: CategoryData[]): CategoryData[] {
  const out: CategoryData[] = [];
  function walk(items: CategoryData[]) {
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const c of items) {
      out.push(c);
      if (c.children?.length) walk(c.children);
    }
  }
  walk(cats);
  return out;
}

function getIconComponent(icon: string | null): LucideIcon {
  if (!icon) return FolderTree;
  const found = ICON_OPTIONS.find((o) => o.value === icon);
  return found?.Icon ?? FolderTree;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("FolderTree");
  const [color, setColor] = useState("#3b82f6");
  const [creating, setCreating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string } | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      if (res.ok) setCategories(data.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          icon,
          color,
          parentId: parentIdForNew,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`"${name}" created`);
        setName("");
        setParentIdForNew(null);
        setShowForm(false);
        fetchCategories();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("Failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingCat) return;
    try {
      await fetch(`/api/categories/${deletingCat.id}`, { method: "DELETE" });
      setCategories((prev) => prev.filter((c) => c.id !== deletingCat.id));
      toast.success("Category deleted");
    } catch {
      toast.error("Failed");
    } finally {
      setDeletingCat(null);
    }
  }

  async function handlePatch(
    id: string,
    updates: { name?: string; icon?: string; color?: string }
  ) {
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        fetchCategories();
        toast.success("Updated");
      } else {
        const d = await res.json();
        toast.error(d.error);
      }
    } catch {
      toast.error("Failed");
    }
  }

  async function handleReorder(newOrder: CategoryData[]) {
    const items = newOrder.map((c, i) => ({ id: c.id, sortOrder: i }));
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        fetchCategories();
        toast.success("Reordered");
      } else {
        const d = await res.json();
        toast.error(d.error);
      }
    } catch {
      toast.error("Failed");
    }
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(id);
  }

  function onDragLeave() {
    setDragOverId(null);
  }

  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDraggedId(null);
    setDragOverId(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || id === targetId) return;

    const flat = flattenTree(categories);
    const fromIdx = flat.findIndex((c) => c.id === id);
    const toIdx = flat.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...flat];
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);
    handleReorder(reordered);
  }

  function onDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  const flat = flattenTree(categories);

  return (
    <>
      <Header title="Categories" subtitle="Organize your feeds" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {flat.length} categories
          </p>
          <Button
            onClick={() => {
              setParentIdForNew(null);
              setShowForm(true);
            }}
          >
            <Plus size={16} /> New Category
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6 rounded-2xl border border-border bg-card">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {parentIdForNew ? "New Subcategory" : "New Category"}
                </h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowForm(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </Button>
              </div>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-xl px-4 py-2.5 text-sm"
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Icon
                </p>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map(({ value, Icon }) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIcon(value)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition-all",
                        icon === value
                          ? "border-primary bg-primary/10 scale-110"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <Icon size={16} />
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Color
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-full p-0 min-w-0 transition-all",
                        color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={() => handleCreate()}
                disabled={creating || !name.trim()}
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}{" "}
                Create
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : flat.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center gap-4 pt-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FolderTree className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">No categories yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create categories to organize your feeds
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {flat.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                isParent={!cat.parentId}
                onDelete={(id) => {
                  const cat = flat.find((c) => c.id === id);
                  setDeletingCat({ id, name: cat?.name || "Category" });
                }}
                onPatch={handlePatch}
                iconOptions={ICON_OPTIONS}
                colors={COLORS}
                onAddSubcategory={() => {
                  setParentIdForNew(cat.id);
                  setName("");
                  setShowForm(true);
                }}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                draggedId={draggedId}
                dragOverId={dragOverId}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingCat}
        title="Delete Category"
        description={`"${deletingCat?.name}" will be permanently deleted. Feeds in this category will become uncategorized.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCat(null)}
      />
    </>
  );
}

type CategoryRowProps = {
  category: CategoryData;
  isParent: boolean;
  onDelete: (id: string) => void;
  onPatch: (
    id: string,
    u: { name?: string; icon?: string; color?: string }
  ) => void;
  iconOptions: { value: string; Icon: LucideIcon }[];
  colors: string[];
  onAddSubcategory: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  draggedId: string | null;
  dragOverId: string | null;
};

function CategoryRow({
  category,
  isParent,
  onDelete,
  onPatch,
  iconOptions,
  colors,
  onAddSubcategory,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  draggedId,
  dragOverId,
}: CategoryRowProps) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editingIcon, setEditingIcon] = useState(false);
  const [editingColor, setEditingColor] = useState(false);

  const IconComp = getIconComponent(category.icon);
  const color = category.color || "#3b82f6";

  const saveName = () => {
    setEditingName(false);
    if (editName.trim() && editName !== category.name) {
      onPatch(category.id, { name: editName.trim() });
    } else {
      setEditName(category.name);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, category.id)}
      onDragOver={(e) => onDragOver(e, category.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, category.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all",
        draggedId === category.id && "opacity-50",
        dragOverId === category.id && "ring-2 ring-primary"
      )}
    >
      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </div>

      <div className="relative flex-shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditingIcon(!editingIcon)}
          className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:ring-2 hover:ring-primary/30"
          style={{ backgroundColor: color + "20" }}
        >
          <IconComp size={18} style={{ color }} />
        </Button>
        {editingIcon && (
          <div className="absolute left-0 top-12 z-10 grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
            {iconOptions.map(({ value, Icon }) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  onPatch(category.id, { icon: value });
                  setEditingIcon(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
              >
                <Icon size={16} />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingIcon(false)}
              className="col-span-5 flex items-center justify-center gap-1 rounded-lg py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <X size={12} /> Close
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editingName ? (
          <Input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            autoFocus
            className="w-full rounded-lg border-primary px-2 py-1 text-sm"
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-left font-medium text-foreground hover:text-primary truncate block w-full"
            onClick={() => {
              setEditName(category.name);
              setEditingName(true);
            }}
          >
            {category.name}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{category._count.feeds} feeds</p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="relative flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditingColor(!editingColor)}
            className="h-6 w-6 rounded-full p-0 min-w-0 border-2 border-border hover:border-foreground transition-colors"
            style={{ backgroundColor: color }}
            title="Change color"
          />
          {editingColor && (
            <div className="absolute right-0 top-8 z-10 flex flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
              {colors.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    onPatch(category.id, { color: c });
                    setEditingColor(false);
                  }}
                  className="h-6 w-6 rounded-full p-0 min-w-0 border-2 border-transparent hover:border-foreground transition-colors"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        {isParent && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddSubcategory}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Add subcategory"
          >
            <Plus size={12} />
            Sub
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onDelete(category.id)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
          title="Delete"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
