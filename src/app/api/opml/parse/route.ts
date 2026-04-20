import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseOpml, flattenOpmlFeeds } from "@/lib/rss/opml";
import { validateFeedUrl } from "@/lib/utils/url-validator";

// POST /api/opml/parse - Parse OPML file or URL and return feed list
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let xmlContent: string;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const url = body.url as string;
      if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
      }
      const urlCheck = validateFeedUrl(url);
      if (!urlCheck.valid) {
        return NextResponse.json({ error: urlCheck.error }, { status: 400 });
      }
      const response = await fetch(url, {
        headers: { "User-Agent": "Feed2040/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return NextResponse.json({ error: `Failed to fetch OPML: HTTP ${response.status}` }, { status: 400 });
      }
      xmlContent = await response.text();
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "OPML file is required" }, { status: 400 });
      }
      xmlContent = await file.text();
    }
    const opmlDoc = await parseOpml(xmlContent);
    const feeds = flattenOpmlFeeds(opmlDoc.outlines);

    if (feeds.length === 0) {
      return NextResponse.json(
        { error: "No feeds found in this OPML file" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        feeds: feeds.map((f, i) => ({
          id: i,
          title: f.title,
          url: f.url,
          siteUrl: f.siteUrl,
          category: f.category,
        })),
        total: feeds.length,
      },
    });
  } catch (error) {
    console.error("OPML parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse OPML file. Make sure it's a valid OPML/XML file." },
      { status: 400 }
    );
  }
}
