# Local Development with Real CI Results

This guide explains how to work on the Smart Reporter locally and test your changes against **real test results from a `vitruvi-playwright-tests` GitHub Actions run**, without rerunning the 800+ test suite.

The Actions run already saved its results as **blob reports**. You download those into this repo's `ref-data/` folder and **replay** them through your local build of the reporter. Replaying takes seconds and produces a full `smart-report.html` with every test, failure, retry and trace from that run.

> Commands are written for macOS (Terminal / zsh).

---

## How it fits together

| Folder | Role |
|---|---|
| `playwright-smart-reporter/` (this repo) | Where you change the reporter. `npm run build` compiles `src/` into `dist/`. |
| `playwright-smart-reporter/ref-data/` | Local-only folder for downloaded CI results and generated reports. **Ignored by git.** |
| `vitruvi-playwright-tests/` | Our Playwright test project. **Nothing in it is changed.** We only use its installed copy of Playwright, so the replay uses the same Playwright version CI used. |

The loop: **download a CI run → unwrap it into `ref-data/<build number>/blobs` → build the reporter → replay → open the report.**

---

## 1. One-time setup

### Prerequisites

- Git and Node.js installed (`git --version`, `node --version`).
- `vitruvi-playwright-tests` cloned locally, with `npm install` already run in it.
- Access to the **Actions** tab of the `vitruvi-playwright-tests` repo.

The examples below assume both repos are in `~/Documents`. Adjust the paths if yours are elsewhere.

### Clone and build the reporter

```bash
cd ~/Documents
git clone https://github.com/fresnel-software/playwright-smart-reporter.git
cd playwright-smart-reporter
npm install
npm run build
```

`npm run build` prints nothing when it succeeds. It creates `dist/smart-reporter.js`, which is what Playwright loads.

### Make sure `ref-data/` is ignored by git

CI results are large (about 1 GB per run) and contain company test data, screenshots and traces. They must never be committed.

```bash
grep -n "ref-data" .gitignore
```

If nothing is printed, add it:

```bash
echo "ref-data/" >> .gitignore
```

Then check with `git status`. Nothing inside `ref-data/` should be listed.

### Create the replay config

Create `ref-data/merge.config.ts`. It tells Playwright to use your local build of the reporter and to write the report into the folder you run the command from:

```bash
mkdir -p ref-data
cat > ref-data/merge.config.ts << 'EOF'
import path from 'path';

export default {
  reporter: [
    [path.resolve(__dirname, '../dist/smart-reporter.js'), {
      outputFile: 'smart-report.html',
      // Required for replays: without it the reporter tries to write to the
      // CI machine's folder (/__w/...), which doesn't exist locally.
      relativeToCwd: true,
    }],
  ],
};
EOF
```

---

## 2. Add a CI run to `ref-data/`

Repeat this for each Actions run you want to test against.

### Download the blob reports

1. Open the `vitruvi-playwright-tests` repo → **Actions** → the run you want.
2. Scroll down to **Artifacts**.
3. Download every `blob-report-dev-test-…` artifact. There's one per shard (`-1`, `-2`, `-3`).

> **Safari users:** turn off **Safari → Settings → General → "Open 'safe' files after downloading"**, or use Chrome. Safari's auto-unzip breaks the next step.

### Save them under the build number

Use the run's build number as the folder name. The example uses `154`:

```bash
mkdir -p ~/Documents/playwright-smart-reporter/ref-data/154
mv ~/Downloads/blob-report-dev-test-*.zip ~/Documents/playwright-smart-reporter/ref-data/154/
```

### Unwrap them into `blobs/`

Each GitHub download is a wrapper zip. The actual blob report (`report-chromium-N.zip`) is inside it:

```bash
cd ~/Documents/playwright-smart-reporter/ref-data/154
mkdir blobs
for f in blob-report-dev-test-*.zip; do unzip -o "$f" -d blobs; done
ls blobs
```

You should see one `report-chromium-….zip` per shard. **Do not unzip these.** Playwright reads them as zip files.

Resulting layout:

```
ref-data/
  merge.config.ts
  154/
    blob-report-dev-test-1.zip
    blob-report-dev-test-2.zip
    blob-report-dev-test-3.zip
    blobs/
      report-chromium-1.zip
      report-chromium-2.zip
      report-chromium-3.zip
```

---

## 3. Make changes and view them in the report

### Create a branch

```bash
cd ~/Documents/playwright-smart-reporter
git checkout master
git pull
git checkout -b <your-branch-name>
```

### Edit, build, replay, view

1. **Edit** files in `src/`. Never edit `dist/`, because it's overwritten on every build.

2. **Build:**
   ```bash
   cd ~/Documents/playwright-smart-reporter
   npm run build
   ```
   Tip: run `npx tsc --watch` in a second Terminal window to rebuild automatically on every save.

3. **Replay the CI run** from inside `ref-data/`:
   ```bash
   cd ~/Documents/playwright-smart-reporter/ref-data
   rm -f test-history.json
   ~/Documents/vitruvi-playwright-tests/node_modules/.bin/playwright merge-reports --config merge.config.ts 154/blobs
   ```
   Replace `154` with the build folder you want to use.

4. **Open the report:**
   ```bash
   open smart-report.html
   ```
   If it's already open, refresh the browser tab.

Repeat steps 1–4 for each change.

#### Why the full path to Playwright?

Running `npx playwright` from `ref-data/` doesn't find our test project's Playwright, so npx tries to download the newest version, which may need a different Node.js version and won't match what CI used. Using the copy in `vitruvi-playwright-tests/node_modules/.bin/` avoids both problems.

#### Why delete `test-history.json`?

Every replay adds the run to the reporter's history. Replaying the same build repeatedly would count it several times and distort flakiness and trend data. Deleting the history first gives a clean report each time.

To test **history-based features** (flakiness, performance trends), download several builds into their own folders and replay them **oldest first** without deleting the history in between:

```bash
rm -f test-history.json
for build in 150 152 154; do
  ~/Documents/vitruvi-playwright-tests/node_modules/.bin/playwright merge-reports --config merge.config.ts $build/blobs
done
open smart-report.html
```

### Run the unit tests

Before pushing, make sure the reporter's own tests still pass:

```bash
cd ~/Documents/playwright-smart-reporter
npm test
```

---

## 4. Submit your changes

1. Commit and push your branch:
   ```bash
   git status            # ref-data/ must not appear here
   git add .
   git commit -m "[VIT-XXXXX] Describe the change"
   git push -u origin <your-branch-name>
   ```

2. Open a pull request:
   `https://github.com/fresnel-software/playwright-smart-reporter/compare/master...<your-branch-name>`

   Both **base repository** and **head repository** must be `fresnel-software/playwright-smart-reporter`, with **base** set to `master`. GitHub may default the base to the original upstream repo (`qa-gary-parker/playwright-smart-reporter`). Change it, or you'll be proposing the change to the upstream author.

### Pulling in updates from the original project

This repo is based on [qa-gary-parker/playwright-smart-reporter](https://github.com/qa-gary-parker/playwright-smart-reporter) (default branch `master`):

```bash
git remote add upstream https://github.com/qa-gary-parker/playwright-smart-reporter.git   # first time only
git fetch upstream
git checkout -b sync-upstream
git merge upstream/master
npm install
npm run build
npm test
```

Then push `sync-upstream` and open a pull request as above.

---

## 5. Troubleshooting

| Error / symptom | Cause | Fix |
|---|---|---|
| `Error: No configure events found` | Playwright was pointed at the GitHub wrapper zips instead of the inner blob reports. | Unwrap into `blobs/` (section 2) and pass `<build>/blobs` to `merge-reports`. |
| `Need to install the following packages: playwright@…` or `Playwright requires Node.js 20 or higher` | `npx` couldn't find our project's Playwright and tried to download the latest. | Answer **n**. Use the full path `~/Documents/vitruvi-playwright-tests/node_modules/.bin/playwright`. |
| `ENOENT: no such file or directory, mkdir '/__w/...'` | The reporter tried to write to the CI machine's folder path. | Run with `--config merge.config.ts` and check that it contains `relativeToCwd: true`. |
| Dozens of `Vitest cannot be imported…` errors | `npx playwright test` was run inside this repo, so it picked up the reporter's own unit tests. | Don't run `playwright test` here. Use `merge-reports` (section 3), or `npm test` for unit tests. |
| Report doesn't reflect your change | `dist/` wasn't rebuilt, or the browser shows the old file. | Run `npm run build`, replay again, and refresh the browser. |
| `npm run build` prints nothing | Normal: it's silent on success. | Check that `dist/smart-reporter.js` exists. |
| `ref-data/` files appear in `git status` | `ref-data/` isn't ignored. | Add `ref-data/` to `.gitignore` (section 1). If already staged, run `git rm -r --cached ref-data` (local files are kept). |
| Pull request page says "Choose different branches or forks above" | The head repository doesn't contain your branch. | Set both base and head repository to `fresnel-software/playwright-smart-reporter`. |
