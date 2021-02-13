if (!window.baboonCasts) window.baboonCasts = {};

baboonCasts.defaultConfig = {
  feedAttribute: "Podcast"
}

baboonCasts.settings = Object.assign(defaultConfig, window.baboonCastsSettings || {});

/** Adds a feed control button (if needed) to any block containing a feed link. */
baboonCasts.initFeed = () => {
  Array.from(document.getElementsByClassName('rm-attr-ref'))
    .filter(attr => attr.textContent.startsWith(baboonCasts.settings.feedAttribute))
    .forEach(attr => {
      const block = attr.closest('.rm-block__input');
      const bc = block.closest('.roam-block-container');
      if (bc.classList.contains('feed-activated')) return;
      const feedUrl = block.textContent.split(': ')[1];
      if (feedUrl) {
        bc.classList.add('feed-activated');
        baboonCasts.addControlButton(bc, '📂', e => {
          e.preventDefault();
          baboonCasts.showFeedEntries(bc, feedUrl);
        });
      }
    });
}

/** A list of items such as an RSS feed or YouTube channel. */
class Feed {
  constructor(url) {
    const youTubeMatches =
      url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(user|channel)\/(.*)/);
    this.type = !youTubeMatches ? 'podcast' : 'youtube';
    this.url = !youTubeMatches
      ? url
      : 'https://www.youtube.com/feeds/videos.xml?' +
      (youTubeMatches[1] === 'channel' ? 'channel_id=' : 'user=') +
      youTubeMatches[2];
    this.items = [];
    this.hasLoaded = false;
  }

  /** Returns a promise of the feed items, which will be parsed from the feed URL if not yet loaded. */
  load() {
    // TODO: also handle forced reload?
    if (this.hasLoaded) return Promise.resolve(this.items);
    return new Promise(resolve => {
      new RSSParser().parseURL(`https://cors-anywhere.herokuapp.com/${this.url}`)
        .then(e => {
          this.items = e.items;
          this.hasLoaded = true;
          resolve(this.items);
        });
    });
  }
}

baboonCasts.showFeedEntries = async (block, feedUrl) => {
  const feed = new Feed(feedUrl);
  feed.load().then(items => populateFeed(block, items));
}

baboonCasts.populateFeed = (block, items) => {
  const createItem = (text) => {
    const itemEl = document.createElement('div');
    itemEl.classList.add('dont-unfocus-block');
    itemEl.style.padding = '6px';
    const itemText = document.createElement('div');
    itemText.classList.add('bp3-text-overflow-ellipsis');
    itemText.textContent = text;
    itemEl.appendChild(itemText);
    menu.appendChild(itemEl);
    return itemEl;
  };
  const menu = document.createElement('div');
  menu.classList.add('bp3-elevation-3');
  menu.style.height = '250px';
  menu.style.overflowY = 'scroll';
  menu.style.cursor = 'pointer';
  window.onclick = () => menu.remove();
  menu.onclick = e => e.stopPropagation();
  if (!items.length) createItem('No results');
  items.filter(item => !!item.link).forEach(item => {
    createItem(item.title || 'no title').onclick = () => {
      menu.remove();
      baboonCasts.createPage(item);
    };
  });
  block.appendChild(menu);
  menu.children[0].focus();
}

baboonCasts.createPage = async (item) => {
  if (!item.title) return
  const url = item.enclosure?.url || item.link;
  window.roamAlphaAPI.createPage({ page: { title: item.title } })
  await new Promise(r => setTimeout(r, 100)); // sleep for createPage
  const uid = window.roamAlphaAPI.q(`[
		:find (pull ?e [:block/uid])
		:where [?e :node/title \"${item.title}\"]
		]`)[0][0].uid;
  window.roamAlphaAPI.createBlock({
    location: { 'parent-uid': uid, order: 0 },
    block: { string: `{{audio: ${url}}}` }
  });
  // TODO: add block to episode list
  const listener = (e) => {
    e.clipboardData.setData(
      'text/plain', `[[${item.title}]]`);
    e.preventDefault();
  }
  document.addEventListener('copy', listener);
  document.execCommand('copy');
  document.removeEventListener('copy', listener);
}

/** Displays a button with the given label and onClick function. */
baboonCasts.addControlButton = (block, label, fn) => {
  const button = document.createElement('button');
  button.innerText = label;
  button.classList.add('rt-control');
  button.addEventListener('click', fn);
  button.style.marginRight = '8px';
  const parentEl = block.children[0].children[0];
  parentEl.insertBefore(button, parentEl.querySelectorAll('.roam-block')[0]);
}

window.setInterval(() => window.baboonCasts.initFeed(), 1000);