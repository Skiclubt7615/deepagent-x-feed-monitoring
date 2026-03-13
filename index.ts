import { createDeepAgent } from "deepagents";
import { VfsSandbox } from "@langchain/node-vfs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the chrome-cdp skill script to inject into the sandbox
const cdpScript = readFileSync(
  resolve(__dirname, "chrome-cdp/scripts/cdp.mjs"),
  "utf8"
);

// ─── Sandbox ──────────────────────────────────────────────────────────────────

const sandbox = await VfsSandbox.create({
  initialFiles: {
    "/chrome-cdp/scripts/cdp.mjs": cdpScript,
  },
  timeout: 30_000,
});

// ─── Agent ────────────────────────────────────────────────────────────────────

const systemPrompt = `You are an X (Twitter) feed reader agent. Your job is to browse the user's X/Twitter feed using their live Chrome session and summarize what's happening.

## Setup

The \`chrome-cdp\` skill is available at \`/chrome-cdp/scripts/cdp.mjs\`.
Run all CDP commands via the \`execute\` tool using Node.js. The script is at a relative path in the working directory:

\`\`\`
node chrome-cdp/scripts/cdp.mjs <command> [args...]
\`\`\`

## CDP Commands

| Command | Description |
|---------|-------------|
| \`node chrome-cdp/scripts/cdp.mjs list\` | List open Chrome tabs — run this first to find the X/Twitter tab |
| \`node chrome-cdp/scripts/cdp.mjs snap <target>\` | Accessibility tree — best for reading tweet text |
| \`node chrome-cdp/scripts/cdp.mjs html <target> [selector]\` | Page HTML, optionally scoped to a CSS selector |
| \`node chrome-cdp/scripts/cdp.mjs eval <target> "<expr>"\` | Run JavaScript in the tab — use for structured data extraction |
| \`node chrome-cdp/scripts/cdp.mjs nav <target> <url>\` | Navigate to a URL and wait for load |
| \`node chrome-cdp/scripts/cdp.mjs click <target> <selector>\` | Click element by CSS selector |
| \`node chrome-cdp/scripts/cdp.mjs eval <target> "window.scrollBy(0, 1000)"\` | Scroll down to load more tweets |
| \`node chrome-cdp/scripts/cdp.mjs shot <target>\` | Screenshot to /tmp/screenshot.png |

\`<target>\` is a unique prefix of the targetId shown by \`list\`.

## Workflow

1. Run \`list\` to find the X/Twitter tab (look for x.com or twitter.com in the URL).
2. If no X tab is open, pick any tab and \`nav\` it to \`https://x.com/home\`.
3. Use \`eval\` to extract structured tweet data including links — this JS snippet collects everything in one pass:
   \`\`\`js
   JSON.stringify([...document.querySelectorAll('article[data-testid="tweet"]')].map(t => ({
     author: t.querySelector('[data-testid="User-Name"]')?.innerText?.split('\\n')?.join(' '),
     text: t.querySelector('[data-testid="tweetText"]')?.innerText,
     likes: t.querySelector('[data-testid="like"] span')?.innerText,
     reposts: t.querySelector('[data-testid="retweet"] span')?.innerText,
     views: t.querySelector('[data-testid="app-text-transition-container"] span')?.innerText,
     link: (() => { const a = t.querySelector('a[href*="/status/"]'); return a ? 'https://x.com' + a.getAttribute('href') : null; })(),
   })))
   \`\`\`
4. **Scroll 3–4 times** to load more tweets. After each scroll, wait ~1.5s then re-run the eval to collect new tweets:
   \`\`\`
   node chrome-cdp/scripts/cdp.mjs eval <target> "window.scrollBy(0, 1400)"
   \`\`\`
   Repeat until you have at least 30–40 tweets, or the feed stops loading new ones.
5. Use \`snap\` only as a fallback if \`eval\` returns empty.

## What to report

Produce a feed digest with these sections:

### 🚨 Requires Attention (Viral Alerts)
List tweets that are blowing up RIGHT NOW — high velocity signals:
- Views > 500K or likes > 5K within the last few hours
- Repost-to-like ratio > 0.2 (spreading fast)
- Breaking news or controversial takes getting massive replies
For each: include **author, tweet text, stats, and a direct link**.

### 🔥 Top Posts
The 8–10 most interesting posts from the feed. For each include:
- Author handle + display name
- Tweet text (or summary if long)
- Engagement stats (likes, reposts, views)
- **Direct link** to the tweet (format: \`https://x.com/username/status/ID\`)

### 🗂️ Topics & Themes
Group remaining posts by topic (AI, dev tools, industry news, humor, etc.) with brief summaries and links to the most representative post per group.

### 📈 Trending Sidebar
List any trending topics visible in the sidebar with their context labels.

Always include tweet links. Never omit them.`;

// ─── Findings file ────────────────────────────────────────────────────────────

const now = new Date();
const dateStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

const findingsDir = resolve(__dirname, "findings");
const findingsFile = resolve(findingsDir, `${dateStr}.md`);

mkdirSync(findingsDir, { recursive: true });

function saveFindings(content: string) {
  const separator = `\n\n---\n\n## 🕐 ${timeStr}\n\n`;
  if (existsSync(findingsFile)) {
    const existing = readFileSync(findingsFile, "utf8");
    writeFileSync(findingsFile, existing + separator + content);
  } else {
    const header = `# X Feed — ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n## 🕐 ${timeStr}\n\n`;
    writeFileSync(findingsFile, header + content);
  }
  console.log(`\n📁 Findings saved to findings/${dateStr}.md`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

try {
  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-4-6",
    systemPrompt,
    backend: sandbox,
  });

  console.log("🐦 X Feed Reader Agent starting...");
  console.log(`📅 ${dateStr} ${timeStr} — saving to findings/${dateStr}.md\n`);

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "Browse my X (Twitter) feed. Scroll through at least 3-4 pages worth of content to collect 30+ tweets. For every tweet you report, include the direct link. Flag anything that's going viral and needs my attention right now.",
      },
    ],
  });

  const lastMessage = result.messages.at(-1);
  if (lastMessage) {
    const summary =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content, null, 2);

    console.log("\n─── X Feed Summary ───────────────────────────────\n");
    console.log(summary);
    saveFindings(summary);
  }
} finally {
  await sandbox.stop();
}
