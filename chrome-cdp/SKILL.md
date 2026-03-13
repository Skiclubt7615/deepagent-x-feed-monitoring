# Chrome CDP Skill

Interact with a live Chrome browser session via the Chrome DevTools Protocol.
Run all commands through the `execute` tool using Node.js:

```
node chrome-cdp/scripts/cdp.mjs <command> [args...]
```

`<target>` is a unique prefix of the targetId shown by `list`.

## Commands

| Command | Description |
|---------|-------------|
| `list` | List open Chrome tabs with targetId and URL |
| `snap <target>` | Accessibility tree — compact, semantic view of the page |
| `html <target> [selector]` | Full page HTML or scoped to a CSS selector |
| `eval <target> "<expr>"` | Evaluate JavaScript in the tab |
| `nav <target> <url>` | Navigate and wait for load |
| `click <target> <selector>` | Click element by CSS selector |
| `shot <target>` | Screenshot → /tmp/screenshot.png |

## Workflow for X/Twitter

1. `list` — find the tab with `x.com` or `twitter.com` in the URL.
2. If no X tab is open, pick any tab and `nav` it to `https://x.com/home`.
3. Extract tweets with this `eval` snippet (collects author, text, stats, and link in one pass):

```js
JSON.stringify([...document.querySelectorAll('article[data-testid="tweet"]')].map(t => ({
  author: t.querySelector('[data-testid="User-Name"]')?.innerText?.split('\n')?.join(' '),
  text: t.querySelector('[data-testid="tweetText"]')?.innerText,
  likes: t.querySelector('[data-testid="like"] span')?.innerText,
  reposts: t.querySelector('[data-testid="retweet"] span')?.innerText,
  views: t.querySelector('[data-testid="app-text-transition-container"] span')?.innerText,
  link: (() => { const a = t.querySelector('a[href*="/status/"]'); return a ? 'https://x.com' + a.getAttribute('href') : null; })(),
})))
```

4. Scroll 3–4 times to load more tweets. After each scroll wait ~1.5s then re-run the eval:

```
node chrome-cdp/scripts/cdp.mjs eval <target> "window.scrollBy(0, 1400)"
```

Repeat until you have 30–40 tweets or the feed stops loading new content.

5. Use `snap` as a fallback if `eval` returns empty.
