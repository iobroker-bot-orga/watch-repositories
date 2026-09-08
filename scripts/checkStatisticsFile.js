/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
const { sendTelegramMessage } = require('./sendTelegramMessage.js');

const STATISTICS_URL = 'https://www.iobroker.net/data/statistics.json';

function hhmmStr(min) {
    const hh = Math.floor(min / 60);
    const mm = Math.floor(min - hh * 60);
    return `${`00${hh}`.slice(-2)}:${`00${mm}`.slice(-2)}`;
}

async function exec() {
    const limit = 24 * 60; /* 24h max in minutes */

    const nowTime = Date.now();
    const nowDate = new Date(nowTime);
    console.log(`Statistics file checker at ${nowDate.toString()}`);

    let isError = false;
    let errorReason = '';
    let timestampStr = '';
    let listDate = null;
    let listDiff = null;

    // Read the statistics json file and extract the 'date' key
    try {
        const response = await fetch(STATISTICS_URL);
        if (!response.ok) {
            throw new Error(`HTTP status ${response.status} ${response.statusText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error(`file could not be parsed as JSON: ${error.message}`);
        }

        if (data.date === undefined || data.date === null) {
            throw new Error(`key 'date' could not be retrieved from statistics file`);
        }

        console.log(`retrieved date: ${data.date}`);

        listDate = new Date(data.date);
        if (isNaN(listDate.getTime())) {
            throw new Error(`key 'date' does not contain a valid timestamp (${data.date})`);
        }

        timestampStr = listDate.toISOString();
        listDiff = (nowTime - listDate.getTime()) / 1000 / 60;

        console.log(`retrieved timestamp: ${timestampStr} (${hhmmStr(listDiff)} old)`);

        if (listDiff > limit) {
            isError = true;
            errorReason = `statistics file timestamp is older than 24 hours (${hhmmStr(listDiff)} ago)`;
        }
    } catch (error) {
        isError = true;
        errorReason = `could not read or parse statistics file: ${error.message}`;
        console.error(`ERROR: ${errorReason}`);
    }

    let subject = '';
    let body = '';

    if (isError) {
        subject = `[iob-bot] ERROR - Statistics file outdated or unavailable`;
        body =
            `ioBroker statistics file watchjob detected the following problem:\n\n` +
            `${errorReason}  \n` +
            `file checked: ${STATISTICS_URL}  \n` +
            (listDate ? `retrieved timestamp: ${listDate.toString()}  \n` : `retrieved timestamp: (none)  \n`);
        console.log(`\nERROR: statistics file is stale or unavailable\n`);
    } else {
        subject = `[iob-bot] OK - Statistics file is up to date`;
        body =
            `ioBroker statistics file watchjob result:\n\n` +
            `statistics file was last updated at ${listDate.toString()} (${hhmmStr(listDiff)} ago)  \n` +
            `file checked: ${STATISTICS_URL}  \n`;
        console.log(`\nOK: everything seems to be fine.\n`);
    }

    body = `${body}\n` + `This mail was created by @iobroker-bot`;

    fs.writeFile('.checkStatisticsFile_subject.txt', subject, err => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile('.checkStatisticsFile_body.md', body, err => {
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
                    `🚨 *ioBroker Statistics File Alert*\n\n` +
                    `${errorReason}\n\n` +
                    `📄 File: ${STATISTICS_URL}\n` +
                    (listDate ? `🕒 Retrieved timestamp: ${listDate.toISOString()}\n\n` : `🕒 Retrieved timestamp: (none)\n\n`) +
                    `⚠️ Please check the statistics file update process.\n\n` +
                    `@bluefox37`;

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
