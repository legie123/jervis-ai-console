#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { lookup } from "node:dns/promises";

const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";

function printUsage() {
  console.log(`Usage:
  npm run voice:clone -- --name "Jarvis Private Voice" --files ./samples/a.wav,./samples/b.mp3 --consent

Options:
  --name                    Required. Voice name in ElevenLabs.
  --files                   Required. Comma-separated local audio files.
  --description             Optional. Voice description.
  --labels                  Optional. JSON labels, for example '{"language":"ro","accent":"romanian"}'.
  --remove-background-noise Optional. Use ElevenLabs audio isolation before cloning.
  --consent                 Required. Confirms you own or have explicit permission to clone this voice.
`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);

    const key = arg.slice(2);
    if (["consent", "remove-background-noise", "help"].includes(key)) {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }

  return args;
}

function parseLabels(rawLabels) {
  if (!rawLabels) return null;

  try {
    const labels = JSON.parse(rawLabels);
    if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
      throw new Error("Labels must be a JSON object");
    }
    return labels;
  } catch (error) {
    throw new Error(`Invalid --labels JSON: ${error.message}`);
  }
}

async function fileToBlob(filePath) {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (stat.size === 0) throw new Error(`Empty audio file: ${filePath}`);

  const data = await fs.readFile(absolutePath);
  return {
    blob: new Blob([data]),
    filename: path.basename(absolutePath),
    size: stat.size,
    absolutePath
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY in .env");
  if (!args.consent) throw new Error("Missing --consent. Clone only your own voice or a voice you are authorized to clone.");
  if (!args.name) throw new Error("Missing --name");
  if (!args.files) throw new Error("Missing --files");

  const filePaths = args.files
    .split(",")
    .map((filePath) => filePath.trim())
    .filter(Boolean);

  if (filePaths.length === 0) throw new Error("No audio files provided");

  await lookup("api.elevenlabs.io");

  const form = new FormData();
  form.set("name", args.name);
  form.set("remove_background_noise", args["remove-background-noise"] ? "true" : "false");

  if (args.description) form.set("description", args.description);

  const labels = parseLabels(args.labels);
  if (labels) form.set("labels", JSON.stringify(labels));

  const files = [];
  for (const filePath of filePaths) {
    const file = await fileToBlob(filePath);
    files.push(file);
    form.append("files[]", file.blob, file.filename);
  }

  console.log(`Creating ElevenLabs voice clone "${args.name}" from ${files.length} file(s).`);

  const response = await fetch(ELEVENLABS_ADD_VOICE_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey
    },
    body: form
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.detail?.message || body?.message || `ElevenLabs voice clone failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  console.log(JSON.stringify({
    ok: true,
    voice_id: body.voice_id,
    requires_verification: body.requires_verification,
    next: "Set ELEVENLABS_VOICE_ID or ELEVENLABS_ALT_VOICE_ID to this voice_id, then test TTS."
  }, null, 2));
}

main().catch((error) => {
  console.error(`BROKEN: ${error.message}`);
  process.exitCode = 1;
});
