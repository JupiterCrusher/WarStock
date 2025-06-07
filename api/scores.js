export default async function handler(req, res) {
  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    } else {
      console.warn('GITHUB_TOKEN is not set');
    }
    const response = await fetch(
      'https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json',
      { headers }
    );

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
