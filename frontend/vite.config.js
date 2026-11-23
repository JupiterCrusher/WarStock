import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const localScoresPath = resolve(currentDir, "../backend/scores.json");
const localNewsPath = resolve(currentDir, "../backend/news.json");

export default defineConfig({
  plugins: [
    {
      name: "warstock-local-scores-api",
      configureServer(server) {
        for (const [route, filePath] of [["/api/scores", localScoresPath], ["/api/news", localNewsPath]]) {
          server.middlewares.use(route, async (req, res, next) => {
            if (req.method !== "GET") {
              next();
              return;
            }

            try {
              const payload = await readFile(filePath, "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
              res.end(payload);
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        }
      },
    },
  ],
});
