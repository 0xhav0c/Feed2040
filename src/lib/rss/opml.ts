import { parseStringPromise, Builder } from "xml2js";

type OpmlOutline = {
  $?: {
    text?: string;
    title?: string;
    type?: string;
    xmlUrl?: string;
    htmlUrl?: string;
  };
  outline?: OpmlOutline[];
};

type FlatFeed = {
  title: string;
  url: string;
  siteUrl: string | null;
  category: string;
};

export async function parseOpml(xmlContent: string) {
  const sanitized = xmlContent.replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<!ENTITY[^>]*>/gi, "");
  const result = await parseStringPromise(sanitized, {
    strict: true,
    trim: true,
    explicitArray: true,
  });
  const body = result?.opml?.body?.[0];
  const outlines: OpmlOutline[] = body?.outline || [];

  return { outlines };
}

export function flattenOpmlFeeds(outlines: OpmlOutline[]): FlatFeed[] {
  const feeds: FlatFeed[] = [];

  function walk(items: OpmlOutline[], category: string) {
    for (const item of items) {
      const attrs = item.$ || {};
      if (attrs.xmlUrl) {
        feeds.push({
          title: attrs.title || attrs.text || attrs.xmlUrl,
          url: attrs.xmlUrl,
          siteUrl: attrs.htmlUrl || null,
          category,
        });
      } else if (item.outline) {
        walk(item.outline, attrs.text || attrs.title || "Uncategorized");
      }
    }
  }

  walk(outlines, "Uncategorized");
  return feeds;
}

export function generateOpml(data: {
  title: string;
  outlines: Array<{
    text: string;
    title: string;
    children: Array<{
      text: string;
      title: string;
      type: string;
      xmlUrl: string;
      htmlUrl?: string;
    }>;
  }>;
}): string {
  const builder = new Builder({ headless: false });

  const opml = {
    opml: {
      $: { version: "2.0" },
      head: [{ title: [data.title] }],
      body: [
        {
          outline: data.outlines.map((cat) => ({
            $: { text: cat.text, title: cat.title },
            outline: cat.children.map((feed) => ({
              $: {
                text: feed.text,
                title: feed.title,
                type: feed.type,
                xmlUrl: feed.xmlUrl,
                ...(feed.htmlUrl ? { htmlUrl: feed.htmlUrl } : {}),
              },
            })),
          })),
        },
      ],
    },
  };

  return builder.buildObject(opml);
}
