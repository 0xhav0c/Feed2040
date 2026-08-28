const CACHE_NAME = "feed2040-v3";
const STATIC_ASSETS = ["/feeds", "/bookmarks", "/briefing", "/settings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // API requests: network-only, no caching
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|svg|png|jpg|ico)$/) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Pages: network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match("/feeds").then(
              (fallback) =>
                fallback ||
                new Response(
                  "<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Feed2040 - Offline</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0b;color:#e5e5e5}div{text-align:center}h1{color:#22d3ee}</style></head><body><div><h1>You're offline</h1><p>Feed2040 requires an internet connection. Please check your network and try again.</p></div></body></html>",
                  { headers: { "Content-Type": "text/html" } }
                )
            )
        )
      )
  );
});

// ─── Web push ───
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Feed2040";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192x192.svg",
    badge: "/icons/icon-192x192.svg",
    data: { url: data.url || "/feeds" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/feeds";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Prefer a tab already on the target path — don't yank an unrelated one.
        for (const client of clients) {
          try {
            if (new URL(client.url).pathname === new URL(url, client.url).pathname && "focus" in client) {
              return client.focus();
            }
          } catch {
            /* ignore malformed client URL */
          }
        }
        // Otherwise reuse any open tab, navigating it to the target.
        for (const client of clients) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
