import fs from "node:fs/promises";
import path from "node:path";
import { dataPath } from "../../../packages/core/src/data-paths.js";

const seedProfile = process.env.JARVIS_SEED_PROFILE || "seed";

const seedFiles = [
  {
    filePath: dataPath("memory/local-memory.json", { profile: seedProfile }),
    content: `${JSON.stringify({ facts: [], updatedAt: null }, null, 2)}\n`
  },
  {
    filePath: dataPath("memory/missions.json", { profile: seedProfile }),
    content: "[]\n"
  },
  {
    filePath: dataPath("memory/whatsapp-inbox.json", { profile: seedProfile }),
    content: "[]\n"
  },
  {
    filePath: dataPath("drafts/whatsapp-drafts.json", { profile: seedProfile }),
    content: "[]\n"
  },
  {
    filePath: dataPath("drafts/scheduled-jobs.json", { profile: seedProfile }),
    content: "[]\n"
  },
  {
    filePath: dataPath("logs/audit.jsonl", { profile: seedProfile }),
    content: ""
  },
  {
    filePath: dataPath("exports/graphify-map.json", { profile: seedProfile }),
    content: `${JSON.stringify(
      {
        schema: "jarvis.graphify.operational_map.v1",
        generatedAt: null,
        status: "SEED",
        counts: { missions: 0, tools: 0, drafts: 0, inbox: 0, jobs: 0, audit: 0, nodes: 0, edges: 0 },
        nodes: [],
        edges: []
      },
      null,
      2
    )}\n`
  }
];

for (const file of seedFiles) {
  await fs.mkdir(path.dirname(file.filePath), { recursive: true });
  await fs.writeFile(file.filePath, file.content, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      profile: seedProfile,
      resetFiles: seedFiles.map((file) => file.filePath)
    },
    null,
    2
  )
);
