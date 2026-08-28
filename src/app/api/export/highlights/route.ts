import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/export/highlights — all highlights as Obsidian-friendly Markdown,
// grouped by article.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const highlights = await prisma.highlight.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            url: true,
            author: true,
            feed: { select: { title: true } },
          },
        },
      },
    });

    // Group by article, preserving first-seen order.
    const groups = new Map<
      string,
      { title: string; url: string; author: string | null; feed: string | null; items: { text: string; note: string | null }[] }
    >();
    for (const h of highlights) {
      const a = h.article;
      if (!groups.has(a.id)) {
        groups.set(a.id, {
          title: a.title,
          url: a.url,
          author: a.author,
          feed: a.feed?.title ?? null,
          items: [],
        });
      }
      groups.get(a.id)!.items.push({ text: h.text, note: h.note });
    }

    const lines: string[] = ["# Highlights", ""];
    lines.push(`> Exported from Feed2040 on ${new Date().toISOString().slice(0, 10)}`, "");

    for (const g of groups.values()) {
      lines.push(`## ${g.title}`);
      const meta: string[] = [];
      if (g.feed) meta.push(`Source: ${g.feed}`);
      if (g.author) meta.push(`Author: ${g.author}`);
      if (meta.length) lines.push(`*${meta.join(" · ")}*`);
      if (g.url) lines.push(`[${g.url}](${g.url})`);
      lines.push("");
      for (const item of g.items) {
        // Blockquote each highlight line-by-line (Obsidian renders multi-line quotes).
        for (const ln of item.text.split("\n")) lines.push(`> ${ln}`);
        if (item.note) lines.push("", `**Note:** ${item.note}`);
        lines.push("");
      }
    }

    const md = lines.join("\n");
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="feed2040-highlights-${new Date().toISOString().slice(0, 10)}.md"`,
      },
    });
  } catch (error) {
    console.error("Export highlights error:", error);
    return NextResponse.json({ error: "Failed to export highlights" }, { status: 500 });
  }
}
