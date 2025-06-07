module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      'https://api.github.com/repos/JupiterCrusher/WarStock/contents/backend/scores.json?ref=main',
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3.raw',
        },
      }
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
