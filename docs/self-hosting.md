# Run your own copy

BetterGarmin is a static site, so anyone can host their own copy for free on
GitHub Pages. You need your own copy if you want **cloud sync**: it runs a
scheduled job with *your* Garmin login, which has to live in *your* GitHub
account.

If you only want to drop GarminDB files in by hand, you don't need a copy at
all. Use any deployed BetterGarmin; your files never leave your browser.

## 1. Fork the repo

1. Sign in to GitHub and open this repository.
2. Click **Fork** → **Create fork**. You can keep the name `BetterGarmin` or
   rename it. The site's address follows the repo name.
3. In your fork, open the **Actions** tab and click **I understand my
   workflows, go ahead and enable them**. Forks start with Actions turned off.

## 2. Turn on GitHub Pages

1. In your fork: **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to **Actions → Deploy to GitHub Pages → Run workflow**. Later pushes
   deploy automatically.
4. After a minute or two your site is live at
   `https://<your-username>.github.io/<repo-name>/`.

> The deploy workflow runs on pushes to `main` and to
> `claude/bettergarmin-web-app-vdfhxe`. If your fork's default branch has
> another name, add it to `branches:` in `.github/workflows/deploy.yml`.

## 3. Install it on your phone

- **iPhone (Safari):** open your site → Share → **Add to Home Screen**.
- **Android (Chrome):** open your site → ⋮ → **Install app**.

It opens full screen like a normal app and works offline with the data it
last loaded.

## 4. Load your data

Choose one:

- **By hand (fully private):** run GarminDB on your computer and drop the
  `.db` files in. See [Getting your data](../README.md#getting-your-data).
- **Automatically (cloud sync):** follow [cloud-sync.md](cloud-sync.md). It
  takes about 20 minutes and uses free Cloudflare and GitHub accounts.
- **Just looking:** tap **Try demo mode** on the welcome screen.

## 5. Optional extras

| Feature | Where | What you need |
| --- | --- | --- |
| **Sync now** button | Today, More → Cloud sync | Cloud sync plus a GitHub token on the Worker ([steps](cloud-sync.md#sync-now-button-optional-recommended)) |
| Live heart rate | Today | Chrome/Edge on desktop or Android, or [Bluefy](https://apps.apple.com/search?term=bluefy) on iPhone; **Broadcast Heart Rate** turned on on the watch |
| Strength workouts from Element 26 | Training → Strength Training → Import | An Element 26 JSON export |
| AI assistant (Gemini) | Insights → Ask | Your own Gemini API key from Google AI Studio. It's stored only in your browser. |

## Keeping your copy up to date

On your fork's GitHub page, click **Sync fork → Update branch** whenever you
want the latest changes. Pages redeploys automatically.

## Something not working?

See [troubleshooting.md](troubleshooting.md).
