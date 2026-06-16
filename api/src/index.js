import "dotenv/config";
import { API_PORT } from "./config.js";
import { createApp } from "./app.js";
import { ensureUploadsDir } from "./lib/uploads.js";

const app = createApp();

await ensureUploadsDir();
app.listen(API_PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${API_PORT}`);
});
