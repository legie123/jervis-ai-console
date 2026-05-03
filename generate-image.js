import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const prompt = process.argv.slice(2).join(" ").trim();

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment.");
  process.exit(1);
}

if (!prompt) {
  console.error('Usage: npm run image -- "your prompt here"');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const outputDir = path.join(process.cwd(), "outputs");
fs.mkdirSync(outputDir, { recursive: true });

const fileName = `gpt-image-2-${Date.now()}.png`;
const filePath = path.join(outputDir, fileName);

const result = await client.images.generate({
  model: "gpt-image-2",
  prompt,
  size: "1024x1024",
  quality: "high"
});

const imageBase64 = result.data?.[0]?.b64_json;

if (!imageBase64) {
  console.error("No image returned from API.");
  process.exit(1);
}

fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));
console.log(`Saved image: ${filePath}`);
