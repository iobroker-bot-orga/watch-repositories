/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
//const github = require('../lib/githubTools.js');
const iobroker = require('@iobroker-bot-orga/iobbot-lib');
const { sendTelegramMessage } = require('./sendTelegramMessage.js');

function hhmmStr(min) {
    const hh = Math.floor(min / 60);
    const mm = Math.floor(min - hh * 60);
    return `${`00${hh}`.slice(-2)}:${`00${mm}`.slice(-2)}`;
}

async function exec() {
    const limit = 12 * 60; /* 12h max in minutes */

    const nowTime = Date.now();
    const nowDate = new Date(nowTime);
    console.log(`Stale repository checker at ${nowDate.toString()}`);

    const latestRepo = await iobroker.getLatestRepo();
    const latestTimeStr = latestRepo._repoInfo?.repoTime;
    const latestTime = Date.parse(latestTimeStr);
    const latestDate = new Date(latestTime);
    const latestDiff = (nowTime - latestTime) / 1000 / 60;
    console.log(`latestTime: ${latestDate.toString()} - ${hhmmStr(latestDiff)} old`);

    const stableRepo = await iobroker.getStableRepo();
    const stableTimeStr = stableRepo._repoInfo?.repoTime;
    const stableTime = Date.parse(stableTimeStr);
    const stableDate = new Date(stableTime);
    const stableDiff = (nowTime - stableTime) / 1000 / 60;
    console.log(`stableTime: ${stableDate.toString()} - ${hhmmStr(stableDiff)} old`);

    let subject = '';
    let body = '';
    let isError = false;

    if (latestDiff > limit || stableDiff > limit) {
        isError = true;
        subject = `[iob-bot] ERROR - Repository data outdated`;
        body =
            `ioBroker repository watchjob detected the following problems:\n\n` +
            `last update of LATEST repository was done at ${latestDate.toString()} (${hhmmStr(latestDiff)} ago)  \n` +
            `last update of STABLE repository was done at ${stableDate.toString()} (${hhmmStr(stableDiff)} ago)  \n`;
        console.log(`\nERROR: repository data is stale\n`);
    } else {
        subject = `[iob-bot] OK - Repository data up to date`;
        body =
            `ioBroker repository watchjob result:\n\n` +
            `last update of LATEST repository was done at ${latestDate.toString()} (${hhmmStr(latestDiff)} ago)  \n` +
            `last update of STABLE repository was done at ${stableDate.toString()} (${hhmmStr(stableDiff)} ago)  \n`;
        console.log(`\nOK: everything seems to be fine.\n`);
    }

    body = `${body}\n` + `This mail was created by @iobroker-bot`;

    fs.writeFile('.checkStaleRepofiles_subject.txt', subject, err => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile('.checkStaleRepofiles_body.md', body, err => {
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
                    `🚨 *ioBroker Repository Alert*\n\n` +
                    `Repository data is outdated!\n\n` +
                    `📦 *LATEST Repository:*\n` +
                    `Last update: ${latestDate.toISOString()}\n` +
                    `Age: ${hhmmStr(latestDiff)}\n\n` +
                    `📦 *STABLE Repository:*\n` +
                    `Last update: ${stableDate.toISOString()}\n` +
                    `Age: ${hhmmStr(stableDiff)}\n\n` +
                    `⚠️ Please check the repository update process.`;

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
