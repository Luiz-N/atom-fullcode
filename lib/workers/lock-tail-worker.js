'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const lockFile = require('proper-lockfile');
const Tail = require('tail').Tail;
const rotator = require('logrotator').rotator;
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const remoteOrigin = require('remote-origin-url');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const os = require('os')
const path = require('path');

const home = os.homedir()
const lockPath = home + '/.fullcode/logs/fullcode'
const logFilePath = home + '/.fullcode/logs/session.log'
var tail = null
var lines = []
var clientInfo = null
var sendMessage = null
var lockFileHandler = null

var fileSizeLimit = { type: 'integer', default: 262144 }


const sendLogs = debounce( () => {
  sendMessage('parsing logs')
  // sendMessage(payload)
  let trackedProjects = clientInfo.authData.trackedProjects
  let payload = { projects: {} };
  let payloadProjects = payload.projects;
  let logPathGroups = {};
  // sendMessage(lines)
  // group lines by logPath
  // for each logpath
    // if logpath is project
    //    create/add projectPayload with lines

  lines.forEach(line => {
    let logPath = line.split('|//*//|')[0] || "";
    logPathGroups[logPath] = logPathGroups[logPath] || {path: logPath, lines: [] }
    logPathGroups[logPath].lines.push(line)
  })
  // sendMessage(logPathGroups)
  Object.keys(logPathGroups).forEach(logPath => {
    let logPathGroup = logPathGroups[logPath]
    let repoInfo = getRepoInfo(logPathGroup.path)
    // repoInfo.remoteOrigin = remoteOrigin.sync(`${repoInfo.root}/.git/config`)
    let localRepoName = repoInfo.root ? repoInfo.root.split('/').pop() : ""
    // sendMessage({repoInfo})
    let trackedProject = Object.entries(trackedProjects).find(proj => proj[1] === localRepoName.toLowerCase())
    // sendMessage({trackedProject})
    // above line will return an array of ['key', 'val'] if a match was found
    // https://stackoverflow.com/a/36705765/2221361

    // this "second check" is to priortize repos and avoid edge case where a filepath
    // might coincidently have a different project name in it's path

    // add check for .gitignore?
    trackedProject = trackedProject || Object.entries(trackedProjects).find(trackedProject => {
      return logPathGroup.path.includes(`${path.sep}${trackedProject[1]}${path.sep}`)
    })
    trackedProject = trackedProject ? {id: trackedProject[0], searchableName: trackedProject[1]} : null
    let isSleeping = clientInfo.authData.ignoreEventsUntil >= Date.now()
    if (trackedProject && !isSleeping) {
      // sendMessage('found trackedProject')
      let projectName = trackedProject.searchableName
      let payloadProject = payloadProjects[projectName]
      payloadProject = payloadProject || { projectID: trackedProject.id, name: projectName, lines: [], path: logPathGroup.path }
      let privateProjects = clientInfo.authData.projectIndexes.private || {}
      payloadProject.isPrivate = !!privateProjects[trackedProject.id]
      payloadProject.lines.push(...logPathGroup.lines)
      repoInfo.remoteOrigin = remoteOrigin.sync(`${repoInfo.root}/.git/config`)
      payloadProject = Object.assign(payloadProject, { repoInfo }, { clientInfo })
      payloadProjects[projectName] = payloadProject
    }
  })
  sendMessage(payloadProjects)
  if (Object.keys(payloadProjects).length) {
    // sendMessage(`projects: ${Object.keys(payloadProjects).length} lines: ${lines.length}`)
    // sendMessage(payloadProjects)
    // fetch(`http://localhost:8010/nighthawk-1/us-central1/auth/log-event`,
    fetch(`https://us-central1-nighthawk-1.cloudfunctions.net/auth/log-event`,
    { method: 'POST',
      headers:
      {
        'Authorization': `Bearer ${clientInfo.token}`,
        'Content-Type': 'text/plain',
        'Refresh-Token': `${clientInfo.refreshToken}`
      },
      body: pako.gzip(JSON.stringify(payload), { to: 'string' })
    }).then(async resp => sendMessage(await resp.json()))
    .catch(err => sendMessage({err}))
  }
  startTime = null;
  lines.length = 0;
}, 5000)


const lockTail = (input, messageHandler, progress) => {
  sendMessage = messageHandler
  if (input.clientInfo) {
    clientInfo = input.clientInfo
    sendMessage('lock-tail running');
  }

  lockFileHandler = lockFileHandler || setInterval(() => {
    // sendMessage('attempting lockFile.lock')
    // creates or checks lockfile every 5 seconds... if stale attempts to takes over
    lockFile.lock(lockPath, { stale: 5000, realpath: false, updateDelay: 1000 }, (err) => {
      if (err) {
        if (err.code !== 'ELOCKED' && tail ) {
          // this means lockfile was compromised either by being
          // touched, removed or went stale and another client took over
          tail.unwatch();
          tail = null;
        }
        sendMessage({err})
        return
      }
      tailLogFile();
      sendMessage('Took over lock file');
    });
  }, 5000);
}

const tailLogFile = () => {
  tail = new Tail(logFilePath);
  tail.on('line', (line) => {
    lines.push(line)
    // arbitrary flush threshold
    if (lines.length >= 50000) {
      sendLogs.flush()
    }
    else {
      sendLogs()
    }
  });
  // checks every 5 mins if log file is >= 5mb... if so gzips & rotates
  rotator.register(logFilePath,
    { size: '5m', count: 3 }
  );

  tail.on('error', (err) => {
    sendMessage({err});
  });
}

module.exports = lockTail;
