/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { sendTelegramMessage } = require('./sendTelegramMessage.js');

const STABLE_REPO_URL =
    'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json';

// Adapters whose stable dist-tag should match the version in sources-dist-stable.json
const ADAPTERS_TO_CHECK = ['admin', 'discovery', 'js-controller', 'backitup'];

const RECHECK_WAIT_MS = 2 * 60 * 1000; // 2 minutes

async function getNpmDistTags(adapter) {
    const response = await fetch(`https://registry.npmjs.org/iobroker.${adapter}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const meta = await response.json();
    return meta['dist-tags'] || {};
}

function runNpmDistTag(adapter, version) {
    const cmd = `npm dist-tag add iobroker.${adapter}@${version} stable`;
    console.log(`  running: ${cmd}`);
    try {
        const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
        console.log(`  npm output: ${output.trim()}`);
        return { success: true };
    } catch (error) {
        const msg = ((error.stderr || '') + (error.stdout || '') || error.message || '').trim();
        console.error(`  npm error: ${msg}`);
        return { success: false, message: msg };
    }
}

async function exec() {
    const nowDate = new Date();
    console.log(`Stable tags checker at ${nowDate.toString()}`);

    const workflowUrl =
        process.env.WORKFLOW_URL ||
        'https://github.com/iobroker-bot-orga/watch-repositories/actions/workflows/checkStaleStableTags.yml';

    // Fetch stable repo
    let stable;
    try {
        const response = await fetch(STABLE_REPO_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        stable = await response.json();
    } catch (error) {
        const subject = `[iob-bot] ERROR - Could not fetch stable repository`;
        const body =
            `ioBroker stable tags watchjob could not fetch the stable repository:\n\n` +
            `${error.message}  \n` +
            `URL: ${STABLE_REPO_URL}  \n\n` +
            `Workflow: ${workflowUrl}  \n\n` +
            `This mail was created by @iobroker-bot`;
        fs.writeFileSync('.checkStaleStableTags_subject.txt', subject);
        fs.writeFileSync('.checkStaleStableTags_body.md', body);
        fs.writeFileSync('.checkStaleStableTags_needs_update', '1');
        console.error(`ERROR: ${error.message}`);
        return;
    }

    // Phase 1: initial check — find adapters that need updating
    const needsUpdate = []; // { adapter, repoVersion, oldNpmStable }
    const fetchErrors = []; // { adapter, error }

    for (const adapter of ADAPTERS_TO_CHECK) {
        if (!stable[adapter]) {
            console.log(`${adapter}: not found in stable repo, skipping`);
            continue;
        }
        const repoVersion = stable[adapter].version;
        console.log(`checking ${adapter} (repo version: ${repoVersion}) ...`);

        try {
            const distTags = await getNpmDistTags(adapter);
            const npmStable = distTags.stable;
            if (repoVersion === npmStable) {
                console.log(`  OK: iobroker.${adapter}@${repoVersion} is correctly tagged as stable`);
            } else {
                console.log(
                    `  NEEDS UPDATE: iobroker.${adapter} repo=${repoVersion}, npm stable tag=${npmStable || '(none)'}`,
                );
                needsUpdate.push({ adapter, repoVersion, oldNpmStable: npmStable || '(none)' });
            }
        } catch (error) {
            console.error(`  ERROR: iobroker.${adapter}: ${error.message}`);
            fetchErrors.push({ adapter, error: error.message });
        }
    }

    if (needsUpdate.length === 0 && fetchErrors.length === 0) {
        const subject = `[iob-bot] OK - All stable dist-tags are up to date`;
        const body =
            `ioBroker stable tags watchjob result:\n\n` +
            `All checked adapters have the correct stable dist-tag on npm.\n\n` +
            `Checked: ${ADAPTERS_TO_CHECK.join(', ')}  \n\n` +
            `Workflow: ${workflowUrl}  \n\n` +
            `This mail was created by @iobroker-bot`;
        fs.writeFileSync('.checkStaleStableTags_subject.txt', subject);
        fs.writeFileSync('.checkStaleStableTags_body.md', body);
        console.log(`\nOK: all stable dist-tags are correct.\n`);
        return;
    }

    // Phase 2: run npm dist-tag for all adapters that need updating
    const npmResults = []; // { ...needsUpdate item, npmSuccess, npmError? }
    for (const item of needsUpdate) {
        const result = runNpmDistTag(item.adapter, item.repoVersion);
        npmResults.push({ ...item, npmSuccess: result.success, npmError: result.message });
    }

    // Phase 3: wait 2 minutes then recheck adapters whose npm command succeeded
    const commandSucceeded = npmResults.filter(r => r.npmSuccess);
    const commandFailed = npmResults.filter(r => !r.npmSuccess);

    const finalResults = [];

    for (const { adapter, error } of fetchErrors) {
        finalResults.push({ adapter, status: 'fetch_error', error });
    }
    for (const r of commandFailed) {
        finalResults.push({
            adapter: r.adapter,
            repoVersion: r.repoVersion,
            oldNpmStable: r.oldNpmStable,
            status: 'command_failed',
            error: r.npmError,
        });
    }

    if (commandSucceeded.length > 0) {
        console.log(`\nWaiting 2 minutes before rechecking ${commandSucceeded.length} adapter(s)...\n`);
        await new Promise(resolve => setTimeout(resolve, RECHECK_WAIT_MS));

        for (const r of commandSucceeded) {
            try {
                const recheckTags = await getNpmDistTags(r.adapter);
                if (recheckTags.stable === r.repoVersion) {
                    console.log(`  recheck OK: iobroker.${r.adapter}@${r.repoVersion} is now tagged stable`);
                    finalResults.push({
                        adapter: r.adapter,
                        repoVersion: r.repoVersion,
                        oldNpmStable: r.oldNpmStable,
                        status: 'success',
                    });
                } else {
                    const current = recheckTags.stable || '(none)';
                    console.log(
                        `  recheck FAILED: iobroker.${r.adapter} still shows ${current} instead of ${r.repoVersion}`,
                    );
                    finalResults.push({
                        adapter: r.adapter,
                        repoVersion: r.repoVersion,
                        oldNpmStable: r.oldNpmStable,
                        status: 'recheck_failed',
                        currentNpmStable: current,
                    });
                }
            } catch (error) {
                console.error(`  recheck ERROR: iobroker.${r.adapter}: ${error.message}`);
                finalResults.push({
                    adapter: r.adapter,
                    repoVersion: r.repoVersion,
                    oldNpmStable: r.oldNpmStable,
                    status: 'recheck_error',
                    error: error.message,
                });
            }
        }
    }

    // Phase 4: build subject
    const hasFailure = finalResults.some(r => r.status !== 'success');
    const hasSuccess = finalResults.some(r => r.status === 'success');

    let subject;
    if (hasFailure && hasSuccess) {
        subject = `[iob-bot] PARTIAL - Some stable dist-tag updates failed`;
    } else if (hasFailure) {
        subject = `[iob-bot] ERROR - Stable dist-tag update failed`;
    } else {
        subject = `[iob-bot] OK - Stable dist-tags updated successfully`;
    }

    // Phase 5: build mail body
    const bodyLines = [`ioBroker stable tags watchjob result:\n`];

    const successItems = finalResults.filter(r => r.status === 'success');
    if (successItems.length > 0) {
        bodyLines.push(`## Successfully updated\n`);
        for (const { adapter, oldNpmStable, repoVersion } of successItems) {
            bodyLines.push(`### \`iobroker.${adapter}\``);
            bodyLines.push(`- Previous stable dist-tag: \`${oldNpmStable}\``);
            bodyLines.push(`- New stable dist-tag: \`${repoVersion}\``);
            bodyLines.push('');
        }
    }

    const commandFailedItems = finalResults.filter(r => r.status === 'command_failed');
    if (commandFailedItems.length > 0) {
        bodyLines.push(`## npm command failed — manual action required\n`);
        for (const { adapter, repoVersion, oldNpmStable, error } of commandFailedItems) {
            bodyLines.push(`### \`iobroker.${adapter}\``);
            bodyLines.push(`- Stable repo version: \`${repoVersion}\``);
            bodyLines.push(`- Current npm stable dist-tag: \`${oldNpmStable}\``);
            bodyLines.push(`- Error: ${error}`);
            bodyLines.push(`- **Manual command to run:**`);
            bodyLines.push(`\`\`\``);
            bodyLines.push(`npm dist-tag add iobroker.${adapter}@${repoVersion} stable`);
            bodyLines.push(`\`\`\``);
            bodyLines.push('');
        }
    }

    const recheckFailedItems = finalResults.filter(r => r.status === 'recheck_failed' || r.status === 'recheck_error');
    if (recheckFailedItems.length > 0) {
        bodyLines.push(`## Still incorrect after update (recheck failed)\n`);
        for (const r of recheckFailedItems) {
            bodyLines.push(`### \`iobroker.${r.adapter}\``);
            bodyLines.push(`- Expected stable dist-tag: \`${r.repoVersion}\``);
            if (r.status === 'recheck_failed') {
                bodyLines.push(`- Actual npm stable dist-tag 2 min after update: \`${r.currentNpmStable}\``);
            } else {
                bodyLines.push(`- Could not recheck: ${r.error}`);
            }
            bodyLines.push('');
        }
    }

    const fetchErrorItems = finalResults.filter(r => r.status === 'fetch_error');
    if (fetchErrorItems.length > 0) {
        bodyLines.push(`## Errors fetching npm metadata\n`);
        for (const { adapter, error } of fetchErrorItems) {
            bodyLines.push(`- \`iobroker.${adapter}\`: ${error}`);
        }
        bodyLines.push('');
    }

    bodyLines.push(`Workflow: ${workflowUrl}  `);
    bodyLines.push(`\nThis mail was created by @iobroker-bot`);
    const body = bodyLines.join('\n');

    fs.writeFileSync('.checkStaleStableTags_subject.txt', subject);
    fs.writeFileSync('.checkStaleStableTags_body.md', body);
    fs.writeFileSync('.checkStaleStableTags_needs_update', '1');

    console.log(`\n${subject}\n`);

    // Phase 6: send Telegram notification
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
        try {
            const telegramLines = [
                hasFailure ? `⚠️ *ioBroker Stable Tags Alert*\n` : `✅ *ioBroker Stable Tags Updated*\n`,
            ];

            if (successItems.length > 0) {
                telegramLines.push(`Successfully updated:`);
                for (const { adapter, oldNpmStable, repoVersion } of successItems) {
                    telegramLines.push(`✅ *iobroker.${adapter}*: \`${oldNpmStable}\` → \`${repoVersion}\``);
                }
                telegramLines.push('');
            }

            if (commandFailedItems.length > 0) {
                telegramLines.push(`npm command failed (manual action required):`);
                for (const { adapter, repoVersion, oldNpmStable } of commandFailedItems) {
                    telegramLines.push(
                        `❌ *iobroker.${adapter}*: repo=\`${repoVersion}\`, npm stable=\`${oldNpmStable}\``,
                    );
                    telegramLines.push(`Manual: \`npm dist-tag add iobroker.${adapter}@${repoVersion} stable\``);
                }
                telegramLines.push('');
            }

            if (recheckFailedItems.length > 0) {
                telegramLines.push(`Still incorrect after update:`);
                for (const r of recheckFailedItems) {
                    if (r.status === 'recheck_failed') {
                        telegramLines.push(
                            `⚠️ *iobroker.${r.adapter}*: expected \`${r.repoVersion}\`, still shows \`${r.currentNpmStable}\` after 2 min`,
                        );
                    } else {
                        telegramLines.push(`⚠️ *iobroker.${r.adapter}*: recheck failed: ${r.error}`);
                    }
                }
                telegramLines.push('');
            }

            if (fetchErrorItems.length > 0) {
                telegramLines.push(`Fetch errors:`);
                for (const { adapter, error } of fetchErrorItems) {
                    telegramLines.push(`❌ iobroker.${adapter}: ${error}`);
                }
            }

            await sendTelegramMessage(botToken, chatId, telegramLines.join('\n'));
            console.log('Telegram notification sent successfully');
        } catch (error) {
            console.error('Failed to send Telegram notification:', error);
        }
    } else {
        console.log('Telegram credentials not configured, skipping notification');
    }
}

exec();
