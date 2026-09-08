# watch-repositories

Monitoring workflows that watch the central [ioBroker](https://www.iobroker.net/) repository infrastructure and alert the maintainers whenever a published data source stops being updated.

## Purpose

ioBroker relies on several regularly regenerated data sources (the adapter repository files, the public adapter list, and the usage statistics file). If the process that regenerates one of these breaks, the files silently become stale and users receive outdated information without anyone noticing.

This repository contains a set of scheduled GitHub Actions "watch jobs" that periodically fetch these data sources, check how old they are, and raise an alert — by email and (on errors) via Telegram — as soon as a source is out of date or unreachable. The checks run entirely in GitHub Actions; no server or hosting is required.

The check logic lives in small Node.js scripts under [`scripts/`](scripts/), and each script is driven by its own workflow under [`.github/workflows/`](.github/workflows/).

## Watch workflows

| Workflow | Script | Data source checked | Schedule (UTC) | Staleness limit |
| --- | --- | --- | --- | --- |
| Check Stale Repository-Files | [`checkStaleRepofiles.js`](scripts/checkStaleRepofiles.js) | `latest` and `stable` ioBroker repositories (via `@iobroker-bot-orga/iobbot-lib`) | `0 3,15 * * *` (twice daily) | 12 hours |
| Check Stale Adapter List | [`checkStaleAdapterList.js`](scripts/checkStaleAdapterList.js) | [download.iobroker.net/list.html](https://download.iobroker.net/list.html) | `15 3 * * *` (daily) | 24 hours |
| Check Statistics File | [`checkStatisticsFile.js`](scripts/checkStatisticsFile.js) | [iobroker.net/data/statistics.json](https://www.iobroker.net/data/statistics.json) | `45 3 * * *` (daily) | 24 hours |

### How a watch job works

Each watch job follows the same pattern:

1. **Fetch** the data source and extract its generation timestamp (from the repository metadata, the timestamp in the list HTML header, or the `date` key of the statistics JSON).
2. **Compare** the timestamp against "now". If the data is older than the workflow's staleness limit — or if the source cannot be fetched or parsed — the run is flagged as an error.
3. **Write** a subject file (`.check…_subject.txt`) and a Markdown body file (`.check…_body.md`) describing the result.
4. **Notify:**
   - An **email** is always sent to `iobroker-bot@gmx.at` (via GMX SMTP) with the OK or ERROR status.
   - A **Telegram message** is sent **only on error**, so a silent inbox means everything is healthy.

The shared helper [`sendTelegramMessage.js`](scripts/sendTelegramMessage.js) posts the alert to the configured Telegram chat.

## Supporting workflow

| Workflow | Purpose |
| --- | --- |
| [`keepAlive.yml`](.github/workflows/keepAlive.yml) | GitHub suspends scheduled workflows in repositories with no activity for 60 days. This job pushes an empty "keep-alive" commit on the 5th and 20th of each month so the scheduled watch jobs keep running. |

## Usage

### Running a check manually

Every watch workflow supports `workflow_dispatch`, so it can be triggered on demand from the repository's **Actions** tab: open the workflow and click **Run workflow**. This is the recommended way to verify the setup after changing secrets.

### Running a check locally

The scripts are plain Node.js (requires **Node.js ≥ 22**):

```bash
npm install
node scripts/checkStaleRepofiles.js
```

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the environment first if you also want to test the Telegram notification path.

### Required secrets

Configure these under **Settings → Secrets and variables → Actions**:

| Secret | Used for |
| --- | --- |
| `IOBBOT_GMXMAIL` | Password for the GMX account that sends the notification emails. |
| `TELEGRAM_BOT_TOKEN` | Token of the Telegram bot that posts error alerts. |
| `TELEGRAM_CHAT_ID` | ID of the Telegram group/chat that receives the alerts. |
| `IOBBOT_GITHUB_TOKEN` | Token used by the keep-alive workflow to push commits. |

### Setting up Telegram notifications

Each watch workflow file contains detailed step-by-step Telegram setup instructions in its header comment. In short:

1. Create a bot via [@BotFather](https://t.me/BotFather) and note the bot token.
2. Add the bot to a Telegram group.
3. Obtain the group's chat ID (e.g. temporarily via `@RawDataBot`, or via `https://api.telegram.org/bot<token>/getUpdates`).
4. Store the token and chat ID as the `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets.
5. Trigger a workflow manually to confirm alerts arrive.

Telegram messages are sent **only** on error conditions; no message is sent while a data source is up to date.

## License

[MIT](LICENSE)
