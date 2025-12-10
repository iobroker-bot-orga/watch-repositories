/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const https = require('node:https');

/**
 * Sends a message to a Telegram chat using the Telegram Bot API
 *
 * @param {string} botToken - The Telegram Bot token
 * @param {string} chatId - The Telegram chat ID (can be a group or user)
 * @param {string} message - The message text to send
 * @returns {Promise<void>}
 */
async function sendTelegramMessage(botToken, chatId, message) {
    if (!botToken || !chatId || !message) {
        console.error('Missing required parameters for Telegram notification');
        return;
    }

    const data = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let responseData = '';

            res.on('data', chunk => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('Telegram message sent successfully');
                    resolve();
                } else {
                    console.error(`Failed to send Telegram message. Status: ${res.statusCode}`);
                    console.error(`Response: ${responseData}`);
                    reject(new Error(`Telegram API returned status ${res.statusCode}`));
                }
            });
        });

        req.on('error', error => {
            console.error('Error sending Telegram message:', error);
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// If called directly from command line
if (require.main === module) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const message = process.argv[2] || process.env.TELEGRAM_MESSAGE;

    if (!botToken || !chatId || !message) {
        console.error('Usage: node sendTelegramMessage.js <message>');
        console.error('Required environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID');
        process.exit(1);
    }

    sendTelegramMessage(botToken, chatId, message)
        .then(() => {
            console.log('Done');
            process.exit(0);
        })
        .catch(error => {
            console.error('Failed:', error);
            process.exit(1);
        });
}

module.exports = { sendTelegramMessage };
