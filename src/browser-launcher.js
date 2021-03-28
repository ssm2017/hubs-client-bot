const puppeteer = require('puppeteer')
const fs = require('fs')

class BrowserLauncher_ {
  constructor() {}

  async browser(options) {
    if (this._browser) return await this._browser

    options.ignoreHTTPSErrors = true;
    options.args = ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-gpu-blacklist", "--ignore-certificate-errors"];

    if (fs.existsSync("/.dockerenv"))
    {
      options.args = (options.args || []).concat(['--no-sandbox', '--disable-setuid-sandbox'])
    }

    this._browser = puppeteer.launch(options);
    return await this._browser
  }
}

const BrowserLauncher = new BrowserLauncher_()

module.exports = {BrowserLauncher}
