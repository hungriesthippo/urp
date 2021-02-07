class Player {
    constructor(url) {
        this.irBlockUid = baboon.getIrBlock(url);
        // TODO: figure out how to kill the interval when a player is no longer active
        if (this.irBlockUid) window.setInterval(() => this.recordTime(), 5000);
    }

    recordTime() {
        if (!this.getTime() || this.lastTime == this.getTime()) return;
        this.lastTime = this.getTime();
        let text = roamAlphaAPI.q(`
        [:find (pull ?e [:block/string])
        :where [?e :block/uid "${this.irBlockUid}"]]`)[0][0].string;
        const timeMatches = Baboon.matchTimeString(text);
        const timeString = Baboon.getTimeString(this.lastTime);
        if (timeMatches) {
            text = text.replace(timeMatches[0], timeString);
        } else {
            text = `${timeString} ${text}`
        }
        roamAlphaAPI.updateBlock({
            block: {
                uid: this.irBlockUid,
                string: text 
            }
        });
    }

    togglePlay() {
        this.isPlaying() ? this.pause() : this.play();
    }

    adjustTime(deltaSeconds) {
        // TODO: avoid exceeding duration
        const boundedTime = Math.max(0, this.getTime() + deltaSeconds);
        this.setTime(boundedTime);
    }
}

class YouTubePlayer extends Player {
    constructor(elId, videoId, height, width) {
        super(`https://youtube.com/watch?v=${videoId}`);
        this.player = new window.YT.Player(elId, { videoId, height, width });
    }

    getTime() {
        return this.player.getCurrentTime();
    }

    setTime(seconds) {
        this.player.seekTo(seconds, true);
    }

    play() {
        this.player.playVideo();
    }

    pause() {
        this.player.pauseVideo();
    }

    isPlaying() {
        return this.player.getPlayerState() == 1;
    }

    getPlaybackRate() {
        return this.player.getPlaybackRate();
    }

    setPlaybackRate(rate) {
        const boundedRate = Math.min(2, Math.max(0, rate));
        this.player.setPlaybackRate(boundedRate);
    }
}

class AudioPlayer extends Player {
    constructor(el) {
        super(this.el.src);
        this.el = el;
    }

    getTime() {
        return this.el.currentTime;
    }

    setTime(seconds) {
        this.el.currentTime = seconds;
    }

    play() {
        this.el.play();
    }

    pause() {
        this.el.pause();
    }

    isPlaying() {
        return !this.el.paused;
    }

    getPlaybackRate() {
        return this.el.playbackRate;
    }

    setPlaybackRate(rate) {
        const boundedRate = Math.min(2, Math.max(0, rate));
        this.el.playbackRate = boundedRate;
    }
}

class ArticlePlayer extends Player {
    constructor(el, url) {
        super(url);
        this.el = el;
    }

    getTime() {
        return this.el.scrollTop;
    }

    setTime(scrollPos) {
        this.el.scrollTop = scrollPos;
    }

    adjustTime(delta) {
        this.setTime(Math.max(0, this.getTime() + delta * 100));
    }

    isPlaying() {
        return false;
    }

    // noops
    play() { }
    pause() { }
    getPlaybackRate() {
        return null;
    }
    setPlaybackRate(_) { }
}

class Baboon {
    constructor() {
        this.players = new Map();
        // TODO: let user override params
        this.params = {
            //Player
            ////Player Style
            border: '0px',
            borderStyle: 'inset',
            borderRadius: '25px',
            ////Player Size
            vidHeight: 480,
            vidWidth: 720,
            //Shortcuts
            grabTitleKey: 'alt+b t',
            grabTimeKey: 'alt+b n',
            ////Speed Controls
            normalSpeedKey: 'alt+b 0',
            speedUpKey: 'alt+b =',
            speedDownKey: 'alt+b -',
            ////Volume Controls
            muteKey: 'alt+b m',
            volUpKey: 'alt+b i',
            volDownKey: 'alt+b k',
            ////Playback Controls
            playPauseKey: 'alt+b p',
            backwardKey: 'alt+b j',
            forwardKey: 'alt+b l'
        }
        this.irBlocks = this.getIrBlocks();
        this.activateInterval = setInterval(() => this.activate(), 1000);
        //this.bindKeysInterval = setInterval(() => this.bindKeys(), 1000);
        document.addEventListener('keyup', e => this.processKey(e));
    }

    getIrBlock(url) {
        if (this.irBlocks.has(url)) return this.irBlocks.get(url);
        this.irBlocks = this.getIrBlocks();
        return this.irBlocks.get(url);
    }

    getIrBlocks() {
        const irMap = new Map();
        const irResults = roamAlphaAPI.q(`
        [:find (pull ?e [:block/uid :block/refs :block/string])
        :where [?e :block/refs ?ref]
               [?ref :node/title "ir"]]`);
        irResults.map(result => result[0])
            .forEach(block => {
                const contentUrl = this.getRelatedContentUrl(block);
                if (contentUrl) {
                    irMap.set(contentUrl, block.uid);
                }
            });
        return irMap;
    }

    getRelatedContentUrl(block) {
        // Find content URL in direct children of the ir block's reference
        // TODO: all descendants?
        // TODO: cousin of the ir block?
        return roamAlphaAPI.q(`
        [:find (pull ?e [:block/refs :block/string])
            :where [?ref :block/children ?e]
                   [?ir :block/refs ?ref]
                   [?ir :block/uid "${block.uid}"]]`)
            .map(result => this.getContentUrl(result[0]))
            .filter(contentUrl => contentUrl != null)[0];
    }

    getContentUrl(block) {
        const ytMatches = block.string.match(/{{\[?\[?youtube]?]?:\s+(.*)}}/);
        if (ytMatches) return ytMatches[1];
        const audioMatches = block.string.match(/{{\[?\[?audio]?]?:\s+(.*)}}/);
        if (audioMatches) return audioMatches[1];
        const articleMatches = block.string.match(/Read URL::?\s+(.*)/);
        if (articleMatches) return articleMatches[1];
    }

    processKey(e) {
        if (!e.altKey) return;
        const player = this.getActivePlayer();
        if (!player) return;
        if (e.keyCode === 80) // alt-p
            player.togglePlay();
        else if (e.keyCode === 76) // alt-l
            player.adjustTime(10);
        else if (e.keyCode === 74) // alt-j
            player.adjustTime(-10);
        else if (e.keyCode === 189) // alt--
            player.setPlaybackRate(player.getPlaybackRate() - 0.25);
        else if (e.keyCode === 187) // alt-=
            player.setPlaybackRate(player.getPlaybackRate() + 0.25);
        else if (e.keyCode === 78) { // alt-n
            const timeStr = Baboon.getTimeString(player.getTime());
            const oldTxt = document.querySelector("textarea.rm-block-input").value;
            fillTheBlock(`${timeStr} ${oldTxt}`);
        }
    }

    activate() {
        if (typeof(YT) == 'undefined' || typeof(YT.Player) == 'undefined') {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        // TODO: combine common code from audio/yt activations
        Array.from(document.getElementsByTagName('audio'))
            .forEach(el => {
                // ignore breadcrumbs and page log 
                if (el.closest('.rm-zoom-item') !== null) return;
                if (!this.players.has(el.id)) {
                    const player = new AudioPlayer(el);
                    this.players.set(el.id, player);
                }
                Baboon.addTimestampControls(el.closest('.roam-block-container'), this.players.get(el.id));
            })

        Array.from(document.getElementsByTagName('iframe'))
            .filter(iframe => iframe.src.includes('youtube.com'))
            .forEach(el => {
                if (typeof(YT) == 'undefined') return;
                // ignore breadcrumbs and page log 
                if (el.closest('.rm-zoom-item') !== null) return
                let frameId;
                if (el.src.indexOf("enablejsapi") === -1) {
                    var ytId = Baboon.extractVideoId(el.src);
                    frameId = "yt-" + el.closest('.roam-block').id;
                    el.parentElement.id = frameId;
                    el.parentElement.classList.remove("rm-video-player__container", "hoverparent");
                    el.remove();
                    this.players.set(
                        frameId,
                        new YouTubePlayer(frameId, ytId, this.params.vidHeight, this.params.vidWidth));
                    Baboon.wrapIframe(frameId);
                } else {
                    frameId = el.id;
                }
                Baboon.addTimestampControls(el.closest('.roam-block-container'), this.players.get(frameId));
                var sideBarOpen = document.getElementById("right-sidebar").childElementCount - 1;
                //Make iframes flexible
                this.adjustIframe(frameId, sideBarOpen);
            });

        Array.from(document.getElementsByClassName('rm-attr-ref'))
            .filter(attr => attr.textContent.startsWith('Read URL'))
            .forEach(el => {
                if (el.closest('.rm-zoom-item') !== null) return;
                const block = el.closest('.roam-block-container');
                if (block.classList.contains('baboon-activated')) return;
                block.classList.add('baboon-activated');
                const url = block.querySelector('.rm-block__input').textContent.split(': ')[1];
                const div = document.createElement('div');
                div.id = `article-${new Date().getTime()}`;
                div.style.overflow = 'scroll';
                div.style.height = '600px';
                div.style['border-radius'] = '12px';
                div.style['box-shadow'] = 'inset 0px 3px 10px rgba(0, 0, 0, 0.1)';
                div.style.background = 'white';
                div.style.margin = '8px';
                div.style.padding = '40px';
                const iframe = document.createElement('iframe');
                iframe.style.height = '10000%';
                iframe.style.width = '100%';
                iframe.src = `https://us-central1-roam-page.cloudfunctions.net/app?url=${encodeURI(url)}`;
                div.appendChild(iframe);
                block.appendChild(div);
                this.players.set(div.id, new ArticlePlayer(div, url));
            })
    }

    static wrapIframe(id) {
        var child = document.getElementById(id);
        var par = document.createElement('div');
        child.parentNode.insertBefore(par, child);
        par.appendChild(child);
        child.style.position = 'absolute';
        child.style.margin = '0px';
        child.style.border = '0px';
        child.style.width = '100%';
        child.style.height = '100%';
        par.style.position = 'relative';
        par.style.paddingBottom = '56.25%';
        par.style.height = '0px';
    }

    adjustIframe(id, isSidebarOpen) {
        var child = document.getElementById(id); //Iframe
        var par = child.parentElement;
        if (isSidebarOpen) {
            child.style.position = 'absolute';
            child.style.width = '100%';
            child.style.height = '100%';
            par.style.position = 'relative';
            par.style.paddingBottom = '56.25%';
            par.style.height = '0px';
        } else {
            child.style.position = null;
            child.style.width = this.params.vidWidth + 'px';
            child.style.height = this.params.vidHeight + 'px';
            par.style.position = null;
            par.style.paddingBottom = '0px';
            par.style.height = this.params.vidHeight + 20 + 'px';
        }
        child.style.margin = '0px';
        child.style.border = this.params.border; //'0px';
        child.style.borderStyle = this.params.borderStyle; //'inset';
        child.style.borderRadius = this.params.borderRadius; //'25px';
    }

    bindKeys() {
        if (typeof (Mousetrap) == 'undefined') return;
        //Title
        Mousetrap.bind(this.params.grabTitleKey, e => {
            e.preventDefault()
            if (e.srcElement.localName == "textarea") {
                var container = e.srcElement.closest('.roam-block-container');
                var parContainer = container.parentElement.closest('.roam-block-container');
                var myIframe = parContainer.querySelector("iframe");
                if (myIframe === null) return false;
                var oldTxt = document.querySelector("textarea.rm-block-input").value;
                // TODO
                // var newValue = players.get(myIframe.id).getVideoData().title + " " + oldTxt;
                // fillTheBlock(newValue);
            }
            return false;
        });
        //TimeStamp
        Mousetrap.bind(this.params.grabTimeKey, e => {
            e.preventDefault()
            const player = this.getActivePlayer();
            if (!player) return;
            const timeStr = new Date(playing.getTime() * 1000).toISOString().substr(11, 8)
            const oldTxt = document.querySelector("textarea.rm-block-input").value;
            fillTheBlock(`${timeStr} ${oldTxt}`);
            return false
        });
        //Play-Pause
        Mousetrap.bind(this.params.playPauseKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.togglePlay();
            return false;
        });
        // TODO
        /*
        //Mute
        Mousetrap.bind(ytParams.muteKey, async function(e) {   
          e.preventDefault();
          var playing = targetPlayer();      
          //
          if(playing !== null){
              if(playing.isMuted()){
                playing.unMute();
              } else {
                playing.mute();
              }
              return false;  
          }
          return false;
        });	
        //Volume Up
        Mousetrap.bind(ytParams.volUpKey, async function(e) {   
          e.preventDefault();
          var playing = targetPlayer();
          if(playing !== null){      	
              playing.setVolume(Math.min(playing.getVolume() + 10, 100))
              return false;  
          }
          return false;
        });
        //Volume Down
        Mousetrap.bind(ytParams.volDownKey, async function(e) {   
          e.preventDefault();
          var playing = targetPlayer();
          if(playing !== null){      	
              playing.setVolume(Math.max(playing.getVolume() - 10, 0))
              return false;  
          }
          return false;
        });  
        */
        // Speed Up
        Mousetrap.bind(this.params.speedUpKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.setPlaybackRate(player.getPlaybackRate() + 0.25);
            return false;
        });
        // Speed Down
        Mousetrap.bind(this.params.speedDownKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.setPlaybackRate(player.getPlaybackRate() - 0.25);
            return false;
        });
        // Normal Speed
        Mousetrap.bind(this.params.normalSpeedKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.setPlaybackRate(1);
            return false;
        });
        //Move Forward
        Mousetrap.bind(this.params.forwardKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.adjustTime(10);
            return false;
        });
        //Move Backward
        Mousetrap.bind(this.params.backwardKey, e => {
            e.preventDefault();
            const player = this.getActivePlayer();
            if (player) player.adjustTime(-10);
            return false;
        });
        clearInterval(this.bindKeysInterval);
    }

    getActivePlayer() {
        const allPlayers = Array.from(this.players.values())
        return allPlayers.find(p => p.isPlaying()) || allPlayers[0];
    }

    static extractVideoId(url) {
        var regExp = /^(https?:\/\/)?((www\.)?(youtube(-nocookie)?|youtube.googleapis)\.com.*(v\/|v=|vi=|vi\/|e\/|embed\/\/?|user\/.*\/u\/\d+\/)|youtu\.be\/)([_0-9a-z-]+)/i;
        var match = url.match(regExp);
        if (match && match[7].length == 11) {
            return match[7];
        } else {
            return null;
        }
    }

    static addTimestampControls(block, player) {
        if (block.children.length < 2) return
        const childBlocks = Array.from(block.children[1].querySelectorAll('.rm-block__input'));
        childBlocks.forEach(child => {
            const timestamp = this.getTimestamp(child);
            const buttonIfPresent = this.getControlButton(child);
            const timestampChanged = buttonIfPresent !== null && timestamp != buttonIfPresent.dataset.timestamp;
            if (buttonIfPresent !== null && (timestamp === null || timestampChanged)) {
                buttonIfPresent.remove();
            }
            if (timestamp !== null && (buttonIfPresent === null || timestampChanged)) {
                this.addControlButton(child, timestamp, () => {
                    player.setTime(timestamp); player.play()
                })
            }
        });
    }

    static getControlButton(block) {
        return block.parentElement.querySelector('.timestamp-control');
    }

    static addControlButton(block, timestamp, fn) {
        const button = document.createElement('button');
        button.innerText = '►';
        button.classList.add('timestamp-control');
        button.dataset.timestamp = timestamp;
        button.style.borderRadius = '50%';
        button.addEventListener('click', fn);
        block.parentElement.insertBefore(button, block);
    }

    static getTimestamp(block) {
        const blockText = block.querySelector('span').textContent;
        const matches = this.matchTimeString(blockText);
        if (!matches) return null;
        const timeParts = matches[0].split(':').map(part => parseInt(part));
        if (timeParts.length == 3) return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        else if (timeParts.length == 2) return timeParts[0] * 60 + timeParts[1];
        else return null;
    }

    static matchTimeString(text) {
        return text.match(/(?:\d+:)?\d+:\d\d/); // m:ss or h:mm:ss
    }

    static getTimeString(time) {
        return new Date(time * 1000).toISOString().substr(11, 8);
    }

    static fillTheBlock(text) {
        const setValue = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value').set;
        const textarea = document.querySelector("textarea.rm-block-input");
        setValue.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

const baboon = new Baboon(); 
