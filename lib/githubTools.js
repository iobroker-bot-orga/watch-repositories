#!/usr/bin/env node

const axios = require('axios');

axios.defaults.headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Authorization': process.env.IOBBOT_GITHUB_TOKEN ? `token ${process.env.IOBBOT_GITHUB_TOKEN}` : 'none',
    'user-agent': 'Action script'
};

const context = {};

async function init(url, branch) {
    console.log(`Init github to use ${url} / branch ${branch}`);
    context.githubUrlOriginal = url
        .replace('http://', 'https://')
        .replace('https://www.github.com', 'https://github.com')
        .replace('https://raw.githubusercontent.com/', 'https://github.com/');
    context.githubUrlApi = context.githubUrlOriginal.replace('https://github.com/', 'https://api.github.com/repos/');
    context.githubBranch = branch || null;

    try {
        const _response = await axios.get(context.githubUrlApi, { cache: false });
        context.githubApiData = _response.data;
        if (!context.githubBranch) {
            context.githubBranch = context.githubApiData.default_branch; // main vs. master
            console.log(`Branch was not defined by user - using branch: ${context.githubBranch}`);
        }

        context.githubUrl = `${context.githubUrlOriginal.replace('https://github.com', 'https://raw.githubusercontent.com')}/${context.githubBranch}`;

        console.log(`Original URL: ${context.githubUrlOriginal}`);
        console.log(`api:          ${context.githubUrlApi}`);
        console.log(`raw:          ${context.githubUrl}`);

        context.init = true;

    } catch (e) {
        console.log(`FATAL: cannot access repository ${context.githubUrlApi}`);
        throw (e);
    }
}

async function downloadFile(path, binary, noError) {
    console.log(`Download ${context.githubUrl}${path || ''}`);

    if (!context.init) throw ('Github tools not yet initialized');

    const options = {};
    if (binary) {
        options.responseType = 'arraybuffer';
    }

    try {
        const response = await axios(context.githubUrl + (path || ''), options);
        return response.data;
    } catch (e) {
        !noError && console.error(`Cannot download ${context.githubUrl}${path || ''}`);
        throw e;
    }
}

async function addComment(prID, body) {
    try {
        const _response = await axios.post(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments`, {body});
        return _response.data;
    } catch (e) {
        console.error(`error adding comment`);
        throw e;
    }
}

function getAllComments(prID) {
    ///repos/:owner/:repo/issues/:issue_number/comments
    return axios(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/${prID}/comments?per_page=100`, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
        .then(response => response.data);
}

function deleteComment(prID, commentID) {
///repos/:owner/:repo/issues/:issue_number/comments
    return axios.delete(`https://api.github.com/repos/ioBroker/ioBroker.repositories/issues/comments/${commentID}`, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        }
    })
        .then(response => response.data);
}

function createIssue(owner, adapter, json) {
    /*
    {
      "title": "Found a bug",
      "body": "I'm having a problem with this.",
      "assignees": [
        "octocat"
      ],
      "milestone": 1,
      "labels": [
        "bug"
      ]
    }
*/
    return axios.post(`https://api.github.com/repos/${owner}/${adapter}/issues`, json, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script'
        },
    })
        .then(response => response.data);
}


exports.downloadFile = downloadFile;
exports.init = init;
exports.addComment = addComment;
exports.deleteComment = deleteComment;
exports.getAllComments = getAllComments;
exports.createIssue = createIssue;

