import path from "node:path";

export function getConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || "./data");

  return {
    port: Number(env.PORT || 8787),
    dataDir,
    nodeEnv: env.NODE_ENV || "development",
    whatsapp: {
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      graphVersion: env.WHATSAPP_GRAPH_VERSION || "v25.0",
      appSecret: env.WHATSAPP_APP_SECRET || ""
    }
  };
}
