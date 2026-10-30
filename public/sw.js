// Static build assets (immutable, hashed) and visited pages live in separate
// caches: pages hold per-user content, so they are capped and wiped on logout.
const STATIC_CACHE = "feed2040-static-v5";
const PAGES_CACHE = "feed2040-pages-v5";
const MAX_PAGES = 30;

self.addEventListener("install", () => {
  // No precache: /feeds etc. need a session, so precaching while logged out
  // would store the login redirect and serve it as the offline page.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// The app posts this on sign-out so the next user can't read cached pages.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-user-cache") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

async function trimPages() {
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Only handle same-origin http(s) requests. Browser extensions issue
  // chrome-extension:// requests that the Cache API cannot store, and
  // cross-origin responses are left to the browser to handle.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;

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
            if (response.ok && !response.redirected) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Only full page navigations get the offline treatment; RSC payloads
  // (?_rsc=), /_next/image and other fetches go straight to the network.
  if (request.mode !== "navigate") return;

  // Pages: network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // A redirected response (e.g. to /login) can't be replayed for a
        // navigation, and must never stand in for the real page.
        if (response.ok && !response.redirected) {
          const clone = response.clone();
          caches
            .open(PAGES_CACHE)
            .then((cache) => cache.put(request, clone))
            .then(trimPages)
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { cacheName: PAGES_CACHE }).then(
          (cached) =>
            cached ||
            caches.match("/feeds", { cacheName: PAGES_CACHE }).then(
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
