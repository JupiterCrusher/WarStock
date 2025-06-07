# WarStock

This project uses a Vercel serverless function to fetch `scores.json` from a
private GitHub repository. Set `GITHUB_TOKEN` in your Vercel project settings so
`/api/scores` can authenticate to GitHub and return the latest scores to the
frontend.
