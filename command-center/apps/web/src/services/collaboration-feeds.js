const DEFAULT_ENDPOINTS = Object.freeze({
  obsidian: "/api/obsidian/feed",
  ruflo: "/api/ruflo/feed",
  hermes: "/api/hermes/feed",
  good_mood: "/api/good-mood/feed"
});

const ADAPTER_CACHE_TTL_MS = 30_000;

let adapterRegistryCache = {
  fetchedAt: 0,
  adapters: []
};

function normalizeAdapterKey(adapterId) {
  return String(adapterId || "")
    .trim()
    .replace(/-/g, "_")
    .toLowerCase();
}

async function loadAdapterRegistry(apiOptional, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - adapterRegistryCache.fetchedAt < ADAPTER_CACHE_TTL_MS) {
    return adapterRegistryCache.adapters;
  }

  const payload = await apiOptional("/api/adapters");
  const adapters = Array.isArray(payload?.adapters) ? payload.adapters : [];
  adapterRegistryCache = {
    fetchedAt: now,
    adapters
  };
  return adapters;
}

export async function loadCollaborationFeeds({
  apiOptional,
  fallbackEndpoints = DEFAULT_ENDPOINTS,
  force = false
}) {
  const adapters = await loadAdapterRegistry(apiOptional, { force });
  const feeds = {};
  const targets =
    adapters.length > 0
      ? adapters
          .filter((adapter) => adapter?.enabled && adapter?.feedPath)
          .map((adapter) => [normalizeAdapterKey(adapter.id), adapter.feedPath])
      : Object.entries(fallbackEndpoints);

  await Promise.all(
    targets.map(async ([key, endpoint]) => {
      const payload = await apiOptional(endpoint);
      const rows = payload?.entries || payload?.items || payload?.messages || payload?.events || payload?.feed || [];
      if (Array.isArray(rows) && rows.length) feeds[key] = rows;
    })
  );

  return feeds;
}

export function resetCollaborationFeedCache() {
  adapterRegistryCache = {
    fetchedAt: 0,
    adapters: []
  };
}
