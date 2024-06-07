/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
//const github = require('../lib/githubTools.js');
const iobroker = require('@iobroker-bot-orga/iobroker-lib');

function hhmmStr( min ) {

    const hh = Math.floor( min/60 );
    const mm = Math.floor( min - hh*60 );
    return ('00' + hh).slice(-2) + ':' + ('00' + mm).slice(-2);
}

async function exec() {
    const limit = 12 * 60; /* 12h max in minutes */

    const nowTime = Date.now();
    const nowDate = new Date(nowTime);
    console.log (`Stale repository checker at ${nowDate.toString()}`);

    const latestRepo = await iobroker.getLatestRepoLive();
    const latestTimeStr = latestRepo._repoInfo?.repoTime;
    const latestTime = Date.parse(latestTimeStr);
    const latestDate = new Date(latestTime);
    const latestDiff = (nowTime-latestTime) / 1000 / 60;
    console.log (`latestTime: ${latestDate.toString()} - ${hhmmStr(latestDiff)} old`);

    const stableRepo = await iobroker.getStableRepoLive();
    const stableTimeStr = stableRepo._repoInfo?.repoTime;
    const stableTime = Date.parse(stableTimeStr);
    const stableDate = new Date(stableTime);
    const stableDiff = (nowTime-stableTime) / 1000 / 60;
    console.log (`stableTime: ${stableDate.toString()} - ${hhmmStr(stableDiff)} old`);

    let subject = '';
    let body = '';

    if ((latestDiff > limit) || (stableDiff > limit)) {
        subject = `[iob-bot] ERROR - Repository data outdated`;
        body = `ioBroker repository watchjob detected the following problems:\n\n` +
            `last update of LATEST repository was done at ${latestDate.toString()} (${hhmmStr(latestDiff)} ago)  \n` +
            `last update of STABLE repository was done at ${stableDate.toString()} (${hhmmStr(stableDiff)} ago)  \n`;
        console.log (`\nERROR: repository data is stale\n`);
    } else{
        subject = `[iob-bot] OK - Repository data up to date`;
        body = `ioBroker repository watchjob result:\n\n` +
            `last update of LATEST repository was done at ${latestDate.toString()} (${hhmmStr(latestDiff)} ago)  \n` +
            `last update of STABLE repository was done at ${stableDate.toString()} (${hhmmStr(stableDiff)} ago)  \n`;
        console.log (`\nOK: everything seems to be fine.\n`);
    }

    body = body +
        `\n`+
        `This mail was created by @iobroker-bot`;

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

}
exec();