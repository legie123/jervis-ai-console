import { createHttpServer } from "./http.js";
import { SchedulerLoop } from "./scheduler-loop.js";

const port = Number(process.env.PORT || 4317);
const host = process.env.JARVIS_HTTP_HOST || "127.0.0.1";
const server = createHttpServer();
const schedulerLoop = new SchedulerLoop();
schedulerLoop.start();

server.listen(port, host, () => {
  console.log(`JARVIS Command Center listening at http://${host}:${port}`);
  const status = schedulerLoop.status();
  console.log(`Scheduler loop enabled=${status.enabled} intervalMs=${status.intervalMs} autoSend=false`);
});
