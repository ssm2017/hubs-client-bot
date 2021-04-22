/**
 * Functionality that executes in the context of the browser.
*/
class InBrowserBot {
  /** Placeholder to not break scripts. InBrowserBots cannot enter or switch rooms */
  enterRoom(room) {
    console.warn("Cannot enter room different room from InBrowserBot")
  }

  /** Runs code in the context of the browser
    * @param {Function} fn The function to run
    * @param args The arguments to pass to the function
  */
  async evaluate(fn, ...args) {
    await fn(...args)
  }

  /** Sets an attribute on the avatar rig */
  async setAttribute(attr, val) {
    document.querySelector('#avatar-rig').setAttribute(attr, val)
  }

  async checkSanity() {
    // Do a periodic sanity check of the state of the bot.
    setInterval(async function() {
      let avatarCounts;
      try {
        avatarCounts = {
          connectionCount: Object.keys(NAF.connection.adapter.occupants).length,
          avatarCount: document.querySelectorAll("[networked-avatar]").length - 1
        };
        console.log(JSON.stringify(avatarCounts));

      } catch (e) {
        // Ignore errors. This usually happens when the page is shutting down.
      }
      // Check for more than two connections to allow for a margin where we have a connection but the a-frame
      // entity has not initialized yet.
      if (avatarCounts && avatarCounts.connectionCount > 2 && avatarCounts.avatarCount === 0) {
        // It seems the bots have dog-piled on to a restarting server, so we're going to shut things down and
        // let the hubs-ops bash script restart us.
        console.log("Detected avatar dog-pile. Restarting.");
        process.exit(1);
      }
    }, 60 * 1000);
  }

  /** Creates an interactive object, similar to the user's magic wand
      functionality.
      @param {Object} opts
      @param {string} opts.url The url to the media (e.g., a .glb or png file)
      @param {string|Object|THREE.Vector3} opts.scale The x,y,z scale of the object
             once it's created
      @param {string|Object|THREE.Vector3} opts.position Where to place the object
      @param {string|Object|THREE.Euler3} opts.rotation The orientation in which to
             place the object
      @param {boolean} opts.dynamic If true, the objet will be subject to
             physics while owned by the bot (it will not be subject to physics
             if grabbed by a user)
      @param {Number} opts.autoDropTimeout If greater than zero, the amount of
             time to wait after an object has stopped moving before the bot will
             seize ownership and reapply physics. This helps work around the
             fact that dynamic state doesn't propogate to other users.
      @param {boolean} opts.fitToBox Whether the spawned object should be fit
             into a box (like with the magic wand). When false, it will use the
             object's native size.
      @param {boolean} opts.pinned Whether this object should be pinned to the
             room. **Note:** since bot authentication is currently unsupported,
             pinned objects will disappear once the bot disconnects.
  */
  async spawnObject(opts = {}) {
    let {
      url,
      scale = '1 1 1',
      position = '0 0 0',
      rotation = '0 0 0',
      dynamic = false,
      gravity = { x: 0, y: -9.8, z: 0 },
      autoDropTimeout,
      fitToBox = true,
      pinned = false,
      projection = null
    } = opts
    let el = document.createElement("a-entity")

    let loaded = new Promise((r, e) => { el.addEventListener('loaded', r, {once: true})})

    el.setAttribute('scale', scale)
    el.setAttribute('position', position)
    el.setAttribute('rotation', rotation)
    el.setAttribute('media-loader', {src: url, resolve: true, fitToBox})
    el.setAttribute('networked', {template: '#interactable-media'})
    if (projection) {
      el.setAttribute('media-loader', {mediaOptions: {projection: projection}});
      dynamic = false;
    }
    document.querySelector('a-scene').append(el)

    await loaded
    let netEl = await NAF.utils.getNetworkedEntity(el)

    if (dynamic)
    {
      await new Promise((r,e) => window.setTimeout(r, 200))
      async function drop() {
        console.log("Dropping!")

        if (!NAF.utils.isMine(netEl)) await NAF.utils.takeOwnership(netEl)

        netEl.setAttribute('floaty-object', {
          autoLockOnLoad: false,
          gravitySpeedLimit: 0,
          modifyGravityOnRelease: false
        })

        const DEFAULT_INTERACTABLE = 1 | 2 | 4 | 8
        netEl.setAttribute("body-helper", {
          type: 'dynamic',
          gravity: gravity,
          angularDamping: 0.01,
          linearDamping: 0.01,
          linearSleepingThreshold: 1.6,
          angularSleepingThreshold: 2.5,
          collisionFilterMask: DEFAULT_INTERACTABLE
        });

        const physicsSystem = document.querySelector('a-scene').systems["hubs-systems"].physicsSystem;
        if (netEl.components["body-helper"].uuid) {
          physicsSystem.activateBody(netEl.components["body-helper"].uuid);
        }
      }

      await drop()

      if (autoDropTimeout)
      {
        let dropTimer
        let lastPosition = new THREE.Vector3()
        lastPosition.copy(el.object3D.position)

        window.setInterval(async () => {
          let netEl = await NAF.utils.getNetworkedEntity(el)
          if (NAF.utils.isMine(netEl)) return

          if (lastPosition.distanceTo(el.object3D.position) > 0.01)
          {
            console.log("Moved Resetting")
            if (typeof dropTimer !== 'undefined') {
              window.clearTimeout(dropTimer)
              dropTimer = undefined
            }
          }
          else if (typeof dropTimer === 'undefined')
          {
            dropTimer = window.setTimeout(drop, autoDropTimeout)
          }

          lastPosition.copy(el.object3D.position)
        }, 100)
      }
    }

    if (pinned) {
      await new Promise((r,e) => window.setTimeout(r, 2000))
      netEl.setAttribute('pinnable', {pinned: pinned})
    }

    return netEl.id
  }

  /** Moves the bot instantly
      @name goTo()
      @memberof InBrowserBot
      @instance
      @param {Number} x X Position of destination in world coordinates
      @param {Number} y Y Position of destination in world coordinates
      @param {Number} z Z Position of destination in world coordinates
  */
  goTo(x,y,z) {} // Documentation Placeholder
  /** Moves the bot instantly
      @name goTo()
      @memberof InBrowserBot
      @instance
      @param {Object|THREE.Vector3} position Position of destination in world
             coordinates. If an object, needs to have x, y, and z keys.
  */
  goTo(position) {}// Documentation Placeholder
  async goTo(positionOrX, optsOrY, z, opts)
  {
    let x,y
    if (typeof z === 'undefined') {
      x = positionOrX.x
      y = positionOrX.y
      z = positionOrX.z
      opts = optsOrY
    } else {
      x = positionOrX
      y = optsOrY
    }

    document.querySelector('#avatar-rig').setAttribute('position', {x,y,z})
  }

  async getPosition() {
    let position = await document.querySelector('#avatar-rig').getAttribute('position');
    return position;
  }
  /** Sets the name of the bot. **NOTE** in order to help prevent abuse, the
      name will be previxed with "bot - "
      @param name Name that will be displayed in the room over the bot's head
  */
  async setName(name) {
    // check pattern
    if (!name.match("^[A-Za-z0-9 -]{0,26}$")) {
      throw("Name pattern not valid.");
    }
    // Prepend (bot) to the name so other users know it's a bot
    if (!name.match("^bot - ")) {
      name = 'bot - ' + name
    }
    await window.APP.store.update({
      activity: {
        hasChangedName: true,
        hasAcceptedProfile: true
      },
      profile: {
        displayName: name
    }})
  }

  async getName() {
    let name = await window.APP.store.state.profile.displayName;
    return name;
  }

  async getAudioContext() {
    const audioContext = {
      "state": await THREE.AudioContext.getContext().state,
      "audioname": await THREE.Audio.name
    };
    return audioContext;
  }

  async getWaypoints() {
    let wps = document.querySelectorAll('[waypoint]');
    let result = [];
    if (wps.length) {
      for (var i=0; i < wps.length; i++) {
        result.push({
          name: wps[i].object3D.name,
          position: wps[i].object3D.position,
          data: wps[i].components.waypoint.data
        });
      }
    }
    return result;
  }

  /** Posts a message to the chat */
  async say(message) {
    window.APP.hubChannel.sendMessage(message)
  }

  /** Changes the room's scene if permitted
      @param {string} url URL of the hubs scene to change to
  */
  async changeScene(url) {
    this.props.hubChannel.updateScene(url);
  }

  /** Makes the bots hands visible and controllable
      @see setAvatarLocations
  */
  async controlHands() {
    if (this.handsControlled) return
    document.querySelectorAll('.left-controller,.right-controller').forEach(controller => {
      const controlsBlacklist = [
        "tracked-controls",
        "hand-controls2",
        "vive-controls",
        "oculus-touch-controls",
        "windows-motion-controls",
        "daydream-controls",
        "gearvr-controls"
      ];
      controlsBlacklist.forEach(controlsComponent => controller.removeAttribute(controlsComponent));
      controller.removeAttribute('visibility-by-path')
      controller.setAttribute("visible", true);
    })
    this.handsControlled = true
  }

  /** Sets the transformations of various avatar components. Currently, all
      parameters must be specified.
      @param opts
      @param opts.leftHand
      @param {Object|THREE.Vector3} opts.leftHand.position Position of the left hand
      @param {Object|THREE.Euler} opts.leftHand.rotation Rotation of the left hand
      @param opts.rightHand
      @param {Object|THREE.Vector3} opts.rightHand.position Position of the right hand
      @param {Object|THREE.Euler} opts.rightHand.rotation Rotation of the right hand
      @param opts.head
      @param {Object|THREE.Vector3} opts.head.position Position of the head
      @param {Object|THREE.Euler} opts.head.rotation Rotation of the head
  */
  async setAvatarLocations({leftHand, rightHand, head})
  {
    // await this.controlHands()
    if (leftHand) {
      document.querySelector('.left-controller').setAttribute('position', leftHand.position)
      document.querySelector('.left-controller').setAttribute('rotation', leftHand.rotation)
    }

    if (rightHand) {
      document.querySelector('.right-controller').setAttribute('position', rightHand.position)
      document.querySelector('.right-controller').setAttribute('rotation', rightHand.rotation)
    }

    if (head) {
      document.querySelector('#avatar-pov-node').setAttribute('rotation', head.rotation)
      document.querySelector('#avatar-pov-node').setAttribute('position', head.position)
    }
  }

  async getAllObjects() {
    try {
      var myObjects = []
      var medias = document.querySelectorAll("[media-loader][id^=naf]");
      console.log("medias.count", medias.length);
      // console.log("medias", JSON.stringify(medias));
      if (medias.length) {
        for (var media of medias){
          let netEl = await NAF.utils.getNetworkedEntity(media);
          if (!NAF.utils.isMine(netEl)) await NAF.utils.takeOwnership(netEl)
          // if (media.components.pinnable && media.components.pinnable.attrValue.pinned)
            myObjects.push({
              id:       media.id,
              src:      media.components['media-loader'].attrValue.src,
              // type:     media.components['gltf-mode-plus'].attrValue.contentType,
              position: media.getAttribute('position'),
              rotation: media.getAttribute('rotation'),
              scale:    media.getAttribute('scale'),
              // pinned:   media.components.pinnable.attrValue.pinned
            })
        }
      }
      return myObjects
    } catch (e) {
      console.error("Error getting objects : ", e.message);
    }
  }

  async deleteAllObjects() {
    try {
      /*let images = document.querySelectorAll("[media-image][networked]");
      let models = document.querySelectorAll("[gltf-model-plus][networked]");
      let all = [];
      all.push.apply(all, images);
      all.push.apply(all, models);
      console.log("images to delete:", images.length);
      console.log("models to delete:", models.length);*/
      let all = document.querySelectorAll("[media-loader]");
      console.log("all:", all.length);
      for (item of all) {
        console.log("deleting");
        let netEl = await NAF.utils.getNetworkedEntity(item);
        if (!NAF.utils.isMine(netEl)) await NAF.utils.takeOwnership(netEl)
        await netEl.setAttribute("pinnable", "pinned", false);
        await new Promise((r,e) => window.setTimeout(r, 1000))
        netEl.remove();
      }
    } catch (e) {
      console.error("Error deleting object : ", e);
    }
  }
}

module.exports = {InBrowserBot}
