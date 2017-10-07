'use babel';

const os = require('os');
const fs = require('fs-extra');

export async function install_script() {
  let homeDir = os.homedir()
  let nighthawkDir = `${homeDir}/.nighthawk`

  let scriptCall = `${os.EOL}# This asks to start nighthawk in current process if not already running${os.EOL}. ${homeDir}/.nighthawk/nighthawk.sh${os.EOL}alias nighthawk=". $HOME/.nighthawk/nighthawk.sh"${os.EOL}`
  try {
    await fs.ensureDir(`${nighthawkDir}/logs`)
    await fs.copy(`${__dirname}/bash-scripts/nighthawk.sh`, `${nighthawkDir}/nighthawk.sh`)
    // create .bashrc file if necessary and add nighthawk.sh script if not already present
    await fs.ensureFile(`${homeDir}/.bashrc`)
    let bashrc = await fs.readFile(`${homeDir}/.bashrc`, {encoding: 'utf8'})
    if (!bashrc.includes("/.nighthawk/nighthawk.sh")) {
      await fs.appendFile(`${homeDir}/.bashrc`, scriptCall)
    }

    // login shells don't call .bashrc by default when opening up a new terminal session but
    // the nighthawk.sh script has to run inside of bashrc. This code creates a
    // bash_profile if necessary and then adds a line to call ./bashrc
    let bashProfile = await fs.pathExists(`${homeDir}/.bash_profile`) ? '.bash_profile' : null
    let bashLogin = await fs.pathExists(`${homeDir}/.bash_login`) ? '.bash_login' : null
    let profile = await fs.pathExists(`${homeDir}/.profile`) ? '.profile' : null

    let profileType = bashProfile || bashLogin || profile || '.bash_profile'

    await fs.ensureFile(`${homeDir}/${profileType}`)
    let systemProfile = await fs.readFile(`${homeDir}/${profileType}`, {encoding: 'utf8'})
    let callBashrc = `${os.EOL}# Nighthawk requires .bashrc to be sourced when auto-starting${os.EOL}[ -s $HOME/.bashrc ] && . $HOME/.bashrc${os.EOL}`

    // sourcing bashrc is common so should be checked for... we don't want to source it twice
    if (!systemProfile.includes(callBashrc) && !systemProfile.includes("/.bashrc")) {
      await fs.appendFile(`${homeDir}/${profileType}`, callBashrc)
    }
    return true
  } catch (e) {
    if (e) {
      console.log(e)
      atom.notifications.addWarning(`🐦 Nighthawk: There was an error setting up Nighthawk scripts on your sytem. This will only prevent Nighthawk from running in your terminal (not save events):${os.EOL}${os.EOL}${e}`,
      {dismissable: true}
      )
      return false
    }
  }
}