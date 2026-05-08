import fs from "node:fs";

export function loadToolRegistry(registryPath = "./config/tools.registry.json") {
  const raw = fs.readFileSync(registryPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.tools || [];
}

export function findTool(tools, id) {
  return tools.find((tool) => tool.id === id) || null;
}
