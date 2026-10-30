import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Feed2040",
    short_name: "Feed2040",
    description: "AI-powered RSS reader with daily briefings",
    start_url: "/feeds",
    display: "standalone",
    background_color: "#09090F",
    theme_color: "#09090F",
    orientation: "any",
    icons: [
      {
        src: "/icons/icon-192x192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
