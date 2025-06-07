export default function handler(req, res) {
  const tokenPresent = Boolean(process.env.GITHUB_TOKEN);
  res.status(200).json({ tokenPresent });
}
