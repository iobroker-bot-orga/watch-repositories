/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
const { sendTelegramMessage } = require('./sendTelegramMessage.js');

const STABLE_REPO_URL =
    'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json';

// Adapters whose stable dist-tag should match the version in sources-dist-stable.json
const ADAPTERS_TO_CHECK = ['admin', 'discovery', 'js-controller', 'backitup'];

async function getNpmDistTags(adapter) {
    const response = await fetch(`https://registry.npmjs.org/iobroker.${adapter}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const meta = await response.json();
    return meta['dist-tags'] || {};
}

async function exec() {
    const nowDate = new Date();
    console.log(`Stable tags checker at ${nowDate.toString()}`);

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
            `This mail was created by @iobroker-bot`;
        fs.writeFileSync('.checkStaleStableTags_subject.txt', subject);
        fs.writeFileSync('.checkStaleStableTags_body.md', body);
        fs.writeFileSync('.checkStaleStableTags_needs_update', '1');
        console.error(`ERROR: ${error.message}`);
        return;
    }

    const updates = [];
    const errors = [];

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
                updates.push({ adapter, repoVersion, npmStable: npmStable || '(none)' });
            }
        } catch (error) {
            console.error(`  ERROR: iobroker.${adapter}: ${error.message}`);
            errors.push({ adapter, error: error.message });
        }
    }

    const hasIssues = updates.length > 0 || errors.length > 0;

    let subject;
    let body;

    if (!hasIssues) {
        subject = `[iob-bot] OK - All stable dist-tags are up to date`;
        body =
            `ioBroker stable tags watchjob result:\n\n` +
            `All checked adapters have the correct stable dist-tag on npm.\n\n` +
            `Checked: ${ADAPTERS_TO_CHECK.join(', ')}  \n\n` +
            `This mail was created by @iobroker-bot`;
        console.log(`\nOK: all stable dist-tags are correct.\n`);
    } else {
        subject = `[iob-bot] ACTION REQUIRED - Stable dist-tags need updating`;

        const bodyLines = [`ioBroker stable tags watchjob found adapters that need dist-tag updates:\n`];

        if (updates.length > 0) {
            bodyLines.push(`## Adapters needing stable dist-tag update\n`);
            for (const { adapter, repoVersion, npmStable } of updates) {
                bodyLines.push(`### \`iobroker.${adapter}\``);
                bodyLines.push(`- Stable repo version: \`${repoVersion}\``);
                bodyLines.push(`- Current npm stable dist-tag: \`${npmStable}\``);
                bodyLines.push(`- **Command to run:**`);
                bodyLines.push(`\`\`\``);
                bodyLines.push(`npm dist-tag add iobroker.${adapter}@${repoVersion} stable`);
                bodyLines.push(`\`\`\``);
                bodyLines.push('');
            }
        }

        if (errors.length > 0) {
            bodyLines.push(`## Errors fetching npm metadata\n`);
            for (const { adapter, error } of errors) {
                bodyLines.push(`- \`iobroker.${adapter}\`: ${error}`);
            }
        }

        bodyLines.push(`\nThis mail was created by @iobroker-bot`);
        body = bodyLines.join('\n');

        console.log(`\nACTION REQUIRED: ${updates.length} adapter(s) need a stable dist-tag update.\n`);
    }

    fs.writeFileSync('.checkStaleStableTags_subject.txt', subject);
    fs.writeFileSync('.checkStaleStableTags_body.md', body);
    if (hasIssues) {
        fs.writeFileSync('.checkStaleStableTags_needs_update', '1');
    }

    if (hasIssues) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId) {
            try {
                const telegramLines = [`⚠️ *ioBroker Stable Tags Alert*\n`];

                if (updates.length > 0) {
                    telegramLines.push(`The following adapters need a stable dist\\-tag update:\n`);
                    for (const { adapter, repoVersion, npmStable } of updates) {
                        telegramLines.push(`📦 *iobroker\\.${adapter}*`);
                        telegramLines.push(`repo: \`${repoVersion}\` → npm stable: \`${npmStable}\``);
                        telegramLines.push(`Command:`);
                        telegramLines.push(`\`npm dist\\-tag add iobroker\\.${adapter}@${repoVersion} stable\``);
                        telegramLines.push('');
                    }
                }

                if (errors.length > 0) {
                    telegramLines.push(`Errors:`);
                    for (const { adapter, error } of errors) {
                        telegramLines.push(`❌ iobroker\\.${adapter}: ${error}`);
                    }
                }

                telegramLines.push(`@bluefox27`);

                await sendTelegramMessage(botToken, chatId, telegramLines.join('\n'));
                console.log('Telegram notification sent successfully');
            } catch (error) {
                console.error('Failed to send Telegram notification:', error);
            }
        } else {
            console.log('Telegram credentials not configured, skipping notification');
        }
    }
}

exec();
