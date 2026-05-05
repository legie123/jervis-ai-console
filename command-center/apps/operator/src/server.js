import { createHttpServer } from "./http.js";
import { SchedulerLoop } from "./scheduler-loop.js";

const port = Number(process.env.PORT || 4317);
const server = createHttpServer();
const schedulerLoop = new SchedulerLoop();
schedulerLoop.start();

server.listen(port, "127.0.0.1", () => {
  console.log(`JARVIS Command Center listening at http://127.0.0.1:${port}`);
  const status = schedulerLoop.status();
  console.log(`Scheduler loop enabled=${status.enabled} intervalMs=${status.intervalMs} autoSend=false`);
});
