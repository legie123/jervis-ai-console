import { getConfig } from "./config.js";
import { createApp } from "./server.js";

const config = getConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Jarvis WhatsApp bridge listening on ${config.port}`);
});
