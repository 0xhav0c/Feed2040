import { prisma } from "@/lib/prisma";

/**
 * URL-safe slug that keeps non-Latin names distinct: accents are folded
 * ("Ağ" → "ag", "Aş" → "as") and other Unicode letters/digits are kept
 * ("日本" stays "日本") instead of all collapsing to "".
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Find the user's category by name (case-insensitive) or slug, creating it if
 * needed. Upsert keeps concurrent importers from racing into a unique-key
 * error on the same new category.
 */
export async function findOrCreateCategory(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const byName = await prisma.category.findFirst({
    where: { userId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (byName) return byName.id;

  const slug = slugify(trimmed) || "category";
  const record = await prisma.category.upsert({
    where: { slug_userId: { slug, userId } },
    create: { name: trimmed, slug, userId },
    update: {},
    select: { id: true },
  });
  return record.id;
}

/**
 * A parent must be one of the user's own categories and must not be the
 * category itself or one of its descendants (a cycle makes the subtree
 * vanish from the tree view). Returns an error message, or null when valid.
 */
export async function checkParent(
  userId: string,
  categoryId: string | null,
  parentId: string | null | undefined
): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === categoryId) return "A category cannot be its own parent";

  let current: string | null = parentId;
  for (let depth = 0; current && depth < 50; depth++) {
    const row: { id: string; parentId: string | null } | null = await prisma.category.findFirst({
      where: { id: current, userId },
      select: { id: true, parentId: true },
    });
    if (!row) return depth === 0 ? "Parent category not found" : null;
    if (categoryId && row.parentId === categoryId) return "A category cannot be moved under its own subcategory";
    current = row.parentId;
  }
  return null;
}

/** First free slug for `name`: "tech", then "tech-2", "tech-3", … */
export async function uniqueSlug(userId: string, name: string): Promise<string> {
  const base = slugify(name) || "category";
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.category.findUnique({
      where: { slug_userId: { slug, userId } },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}
