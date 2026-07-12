import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const localScoresPath = resolve(currentDir, "../backend/scores.json");

export default defineConfig({
  plugins: [
    {
      name: "warstock-local-scores-api",
      configureServer(server) {
        server.middlewares.use("/api/scores", async (req, res, next) => {
          if (req.method !== "GET") {
            next();
            return;
          }

          try {
            const scores = await readFile(localScoresPath, "utf8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(scores);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      },
    },
  ],
});
