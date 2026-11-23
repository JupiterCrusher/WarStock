export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/news.json",
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!response.ok) throw new Error(`News fetch failed (${response.status})`);
    const data = await response.json();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
}
