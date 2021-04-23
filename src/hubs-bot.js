const {URL} = require('url')
const {BrowserLauncher} = require('./browser-launcher.js')
const {InBrowserBot} = require('./in-browser-bot.js')
const {InBrowserBotBuilder} = require('./in-browser-bot-builder.js')
const querystring = require("query-string");

class PageUtils {
  constructor({page, autoLog = true}) {
    this.page = page
    this.autoLog = autoLog
  }
  async clickSelectorClassRegex(selector, classRegex) {
    if (this.autoLog) console.log(`Clicking for a ${selector} matching ${classRegex}`)

    await this.page.evaluate((selector, classRegex) => {
      classRegex = new RegExp(classRegex)
      let buttons = Array.from(document.querySelectorAll(selector))
      let enterButton = buttons.find(button => Array.from(button.classList).some(c => classRegex.test(c)))
      enterButton.click()
    }, selector, classRegex.toString().slice(1,-1))
  }
}

class El {
  constructor(id) {

  }
}

/**
 * Main class for creating a HubsBot. Dynamically adds all methods from
 * InBrowserBot, which can be called directly from a HubsBot instance.
 * @example
   var bot = new HubsBot();
   bot.goTo(0, 1, 0) // goTo is a InBrowserBot method, but can be called directly on the HubsBot
 * @param {Object} opt See below
 * @param {boolean} opt.headless Set this to false to have puppeteer spawn Chromium window.
 * @param {string} opt.userDataDir Path to the Chromium user profile.
 * @param {string} opt.name Name for the bot to appear as ({@link setName})
 * @see InBrowserBot
*/
class HubsBot {
  constructor({
    headless = true,
    userDataDir = "",
    name = "HubsBot",
    autoLog = true
  } = {} ) {
    this.headless = headless
    this.userDataDir = userDataDir
    this.browserLaunched = this.launchBrowser()
    this.name = name
    this.autoLog = autoLog

    for (let method of Object.getOwnPropertyNames(InBrowserBot.prototype))
    {
      if (method in this) continue

      this[method] = (...args) => this.evaluate(InBrowserBot.prototype[method], ...args)
    }
  }

  /** Runs a function and takes a screenshot if it fails
   * @param {Function} fn Function to execut _in the node context._
  */
  async catchAndScreenShot(fn, path="botError.png") {
    try {
      await fn()
    }
    catch (e) {
      if (this.page)
      {
        console.warn("Caught error. Trying to screenshot")
        this.page.screenshot({path})
      }
      throw e
    }
  }

  /**
   * Runs a funciton in the browser context
   * @param {Function} fn Function to evaluate in the browser context
   * @param args The arguments to be passed to fn. These will be serailized when passed through puppeteer
  */
  async evaluate(fn, ...args) {
    await this.browserLaunched
    return await this.page.evaluate(fn, ...args)
  }

  /**
   * A main-program type wrapper. Runs a function and quits the bot with a
   * screenshot if the function throws an exception
   * @param {Function} fn Function to evaluate in the node context
  */
  exec(fn) {
    this.catchAndScreenShot(() => fn(this)).catch((e) => {
      console.error("Failed to run. Check botError.png if it exists. Error:", e)
      process.exit(-1)
    })
  }

  /** Launches the puppeteer browser instance. It is not necessary to call this
   *  directly in most cases. It will be done automatically when needed.
  */
  async launchBrowser () {
    this.browser = await BrowserLauncher.browser({headless: this.headless, userDataDir: this.userDataDir});
    this.page = await this.browser.newPage();

    if (this.autoLog)
    {
      this.page.on('console', consoleObj => console.log(">> ", consoleObj.text()));
    }

  }

  /** Enters the room specified, enabling the first microphone and speaker found
   * @param {string} roomUrl The url of the room to join
   * @param {Object} opts
   * @param {string} opts.name Name to set as the bot name when joining the room
   * @param {string} opts.spawnPoint Name of the spawn point
  */
  async enterRoom(roomUrl, {name, spawnPoint=null, audioVolume=null } = {}) {
    await this.browserLaunched

    var params = {
      bot: true,
      allow_multi: true
    };
    if (audioVolume) {
      params.audio_volume = audioVolume;
    }

    let parsedUrl = new URL(roomUrl)
		let url = `${roomUrl}?${querystring.stringify(params)}`;
    if (spawnPoint) {
      url += `#${spawnPoint}`;
    }
    console.log("Entering room:", url);

    await this.page.goto(url, {waitUntil: 'domcontentloaded'})

    this.checkSanity();

    // if (name) {
    //   this.name = name
    // } else {
    //   name = this.name
    // }
    // await this.setName(name)
  }

  async changeName(name) {
    await this.setName(name);
    this.name = await this.getName();
  }

  onMessage(callback) {
    window.APP.hubChannel.channel.on('message', callback)
  }

  async playFile(filePath) {
    let retryCount = 5;
    let backoff = 1000;
		try {
			// Interact with the page so that audio can play.
			await this.page.mouse.click(100, 100);
      // check if the file is mp3 or json
      let selector = null;
      if (filePath.indexOf(".mp3") == filePath.length - 4) {
        selector = "#bot-audio-input";
      } else if (filePath.indexOf(".json") == filePath.length - 5) {
        selector = "#bot-data-input";
      } else {
        return;
      }
      const inputField = await this.page.waitForSelector(selector);
      inputField.uploadFile(filePath);
      console.log("file to play : %s", filePath);
		} catch (e) {
      console.log("Interaction error", e.message)
			if (retryCount-- < 0) {
				// If retries failed, throw and restart navigation.
				throw new Error("Retries failed");
			}
			console.log("Retrying...", e.message);
			backoff *= 2;
			// Retry interaction to start audio playback
			setTimeout(playFile.speak(filePath), backoff);
		}
	}

  async jumpTo(spawnPoint) {
    let source_url = this.page.url();
    let url_as_array = source_url.split("#");
    let destination_url = url_as_array[0] + "#" + spawnPoint;
		await this.page.goto(destination_url);
  }

  /**
   * Creates an {@link InBrowserBotBuilder} to allow building a bot for use in the
   * developer console.
   * @return {InBrowserBotBuilder} An InBrowserBotBuilder which can be used to
   * create client-side code to execute `fn`. This code can then be copied and
   * pasted into the developer console
   * @param {Function} fn The function to execute in the browser context. The
            `this` passed to fn will be an InBrowserBot version of this bot. If
            this bot is a subclass of HubsBot, the subclassed definitions will
            be injected into the built [InBrowserBot](#inbrowserbot) code.
   * @param args Arguments to be serialized and passed to fn
  */
  asBrowserBot(fn, ...args) {
    return new InBrowserBotBuilder(this, fn, ...args)
  }

  /**
   * Leaves the room and closes the browser instance without exiting node
  */
  quit() {
    this.page.close()
    this.browser.close()
  }
}

module.exports = {HubsBot}
