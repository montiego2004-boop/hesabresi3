# Static deployment and release gate

**Status:** Netlify configuration and a local deployment-routing test are included. No Netlify site was provisioned in this workspace, and no production URL is represented as verified.

## Publish on Netlify

1. Use an authorized Netlify workspace. Import this repository and select the branch containing the application. Set Node to **22**, build command `npm run build`, publish directory **`dist`**, base directory the repository root. `netlify.toml` supplies those settings. No database URL, identity provider, secrets or serverless functions are needed.
2. Alternatively run `npm ci && npm run package:netlify`. **Extract** `release/daneh-hesab-netlify.zip` and deploy the folder that directly contains `index.html`, `sw.js`, `_headers`, `_redirects`, `manifest.json`, `assets/` and the icons. Do not deploy the source tree or wrap the files in an extra `dist/` directory.
3. Use a **stable HTTPS origin**. Open the exact address Netlify actually gives the deployment. Do not guess a site name. The preview environment and preview deploy subdomains are not substitutes for the production origin of an existing book.
4. Keep Netlify snippet injection, HTML rewriting, third-party analytics, asset rewriting/minification after the build, and form processing off for this app. The generated worker verifies SHA-256 of every build resource before marking the shell available. A rewritten asset deliberately fails verification rather than installing an incomplete book interface.
5. `_redirects` uses the non-forced `/* /index.html 200` fallback: real assets win, while direct browser routes get the shell. The worker has root scope. Hashed chunks can be cached immutably; `sw.js`, `index.html` and the manifest must revalidate. `_headers` applies these policies to Git-based **and manual uploads**.

## Verify the real URL, not just a build log

Set `APP_URL` in your shell to the exact HTTPS site origin, then:

```sh
npm run test:deployed
```

This checks HTTP status and shell content on direct routes, opens the deployed customer route in an isolated Chromium profile, refreshes it, waits for the worker, blocks network access and opens/reloads a nested inventory route. It does not upload a business record. A successful result prints the **actual URL it checked**. Linux/x64 uses the bundled test browser; set `CHROME_PATH` to a compatible local Chromium executable on other platforms.

Also check the real device: install from Android Chrome, open from the launcher rather than a tab, then cold-launch in airplane mode. See [Android checklist](ANDROID.fa.md). With an authorized USB Android test device and the installed app in the foreground, `npm run test:android` verifies standalone display, secure origin, UI and service-worker control. Set `EXPECT_OFFLINE=1` for the offline run. ADB is required for this optional test, not for app use.

## Update and rollback

- Publish `dist/` as an atomic release. Do not upload a new HTML shell while leaving its referenced chunks missing.
- The worker never opens or clears IndexedDB. New resources install in a separate, verified cache. While an old client is active, a waiting worker is promoted by explicit update approval, not an unconditional installation-time `skipWaiting`. Standard worker lifecycle can also promote it after old clients close.
- The previous shell cache is kept for older open tabs. Only this application's namespaced shell caches are pruned. Never use a host `Clear-Site-Data` header, a DB reset, or a different origin as an update mechanism.
- Database schema changes must be forward migrations. Do not attempt a schema downgrade to roll back financial data. Use an encrypted backup, or restore a compatible archive with confirmation. A simple hosting rollback does not reverse already-posted transactions.
