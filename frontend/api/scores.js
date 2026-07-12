export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/JupiterCrusher/WarStock/main/backend/scores.json',
      { headers: { Accept: 'application/json' } }
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
