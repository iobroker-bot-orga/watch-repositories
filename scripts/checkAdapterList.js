/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
const { sendTelegramMessage } = require('./sendTelegramMessage.js');

const LIST_URL = 'https://download.iobroker.net/list.html';

function hhmmStr(min) {
    const hh = Math.floor(min / 60);
    const mm = Math.floor(min - hh * 60);
    return `${`00${hh}`.slice(-2)}:${`00${mm}`.slice(-2)}`;
}

async function exec() {
    const limit = 24 * 60; /* 24h max in minutes */

    const nowTime = Date.now();
    const nowDate = new Date(nowTime);
    console.log(`Adapter list checker at ${nowDate.toString()}`);

    let isError = false;
    let errorReason = '';
    let timestampStr = '';
    let listDate = null;
    let listDiff = null;

    // Read the adapter list web page and extract the timestamp
    try {
        const response = await fetch(LIST_URL);
        if (!response.ok) {
            throw new Error(`HTTP status ${response.status} ${response.statusText}`);
        }
        const html = await response.text();

        // The page header contains a generated timestamp like: (28.08 01:57)
        const match = html.match(/\((\d{2})\.(\d{2}) (\d{2}):(\d{2})\)/);
        if (!match) {
            throw new Error('timestamp could not be extracted from page');
        }

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const hour = parseInt(match[3], 10);
        const minute = parseInt(match[4], 10);

        // Construct the complete timestamp by adding the current year to the day.month value
        let year = nowDate.getUTCFullYear();
        listDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

        // Handle a year rollover (e.g. list from Dec 31 while now is Jan 1)
        if (listDate.getTime() - nowTime > 24 * 60 * 60 * 1000) {
            year -= 1;
            listDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
        }

        timestampStr = listDate.toISOString();
        listDiff = (nowTime - listDate.getTime()) / 1000 / 60;

        console.log(`retrieved timestamp: ${timestampStr} (${hhmmStr(listDiff)} old)`);

        if (listDiff > limit) {
            isError = true;
            errorReason = `adapter list timestamp is older than 24 hours (${hhmmStr(listDiff)} ago)`;
        }
    } catch (error) {
        isError = true;
        errorReason = `could not read or parse adapter list: ${error.message}`;
        console.error(`ERROR: ${errorReason}`);
    }

    let subject = '';
    let body = '';

    if (isError) {
        subject = `[iob-bot] ERROR - Adapter list outdated or unavailable`;
        body =
            `ioBroker adapter list watchjob detected the following problem:\n\n` +
            `${errorReason}  \n` +
            `page checked: ${LIST_URL}  \n` +
            (listDate ? `retrieved timestamp: ${listDate.toString()}  \n` : `retrieved timestamp: (none)  \n`);
        console.log(`\nERROR: adapter list is stale or unavailable\n`);
    } else {
        subject = `[iob-bot] OK - Adapter list up to date`;
        body =
            `ioBroker adapter list watchjob result:\n\n` +
            `adapter list was last updated at ${listDate.toString()} (${hhmmStr(listDiff)} ago)  \n` +
            `page checked: ${LIST_URL}  \n`;
        console.log(`\nOK: everything seems to be fine.\n`);
    }

    body = `${body}\n` + `This mail was created by @iobroker-bot`;

    fs.writeFile('.checkAdapterList_subject.txt', subject, err => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile('.checkAdapterList_body.md', body, err => {
        if (err) {
            console.error(err);
        }
    });

    // Send Telegram notification only on error
    if (isError) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId) {
            try {
                // Format message for Telegram
                const telegramMessage =
                    `🚨 *ioBroker Adapter List Alert*\n\n` +
                    `${errorReason}\n\n` +
                    `📄 Page: ${LIST_URL}\n` +
                    (listDate ? `🕒 Retrieved timestamp: ${listDate.toISOString()}\n\n` : `🕒 Retrieved timestamp: (none)\n\n`) +
                    `⚠️ Please check the adapter list update process.`;

                await sendTelegramMessage(botToken, chatId, telegramMessage);
                console.log('Telegram notification sent successfully');
            } catch (error) {
                console.error('Failed to send Telegram notification:', error);
                // Don't fail the workflow if Telegram notification fails
            }
        } else {
            console.log('Telegram credentials not configured, skipping notification');
        }
    }
}
exec();
