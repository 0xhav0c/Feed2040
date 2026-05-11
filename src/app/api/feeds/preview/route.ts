import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewFeed, discoverFeedUrls } from "@/lib/rss/parser";
import { validateFeedUrl } from "@/lib/utils/url-validator";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`feeds:preview:${session.user.id}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const validation = validateFeedUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error ?? "Invalid URL" }, { status: 400 });
    }

    let preview;
    try {
      preview = await previewFeed(url);
    } catch (parseError) {
      // Feed parsing failed — try autodiscovery
      try {
        const feedUrls = await discoverFeedUrls(url);
        if (feedUrls.length > 0) {
          return NextResponse.json({
            data: { discovered: true, feedUrls },
          });
        }
      } catch {
        // Autodiscovery also failed, fall through to original error
      }

      console.error("Feed preview failed:", parseError);
      return NextResponse.json(
        { error: "Could not parse feed. Make sure the URL points to a valid RSS, Atom, or JSON feed." },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: preview });
  } catch (error) {
    console.error("Feed preview failed:", error);
    return NextResponse.json(
      { error: "Could not parse feed. Make sure the URL points to a valid RSS, Atom, or JSON feed." },
      { status: 422 }
    );
  }
}
