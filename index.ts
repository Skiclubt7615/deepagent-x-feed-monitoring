import { createDeepAgent } from "deepagents";
import { VfsSandbox } from "@langchain/node-vfs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load files to inject into VFS ───────────────────────────────────────────

const cdpScript = readFileSync(resolve(__dirname, "chrome-cdp/scripts/cdp.mjs"), "utf8");
const cdpSkill  = readFileSync(resolve(__dirname, "chrome-cdp/SKILL.md"), "utf8");

// ─── Findings file ────────────────────────────────────────────────────────────

const now = new Date();
const dateStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

const findingsDir  = resolve(__dirname, "findings");
const findingsFile = resolve(findingsDir, `${dateStr}.md`);

mkdirSync(findingsDir, { recursive: true });

const previousFindings = existsSync(findingsFile)
  ? readFileSync(findingsFile, "utf8")
  : null;

function saveFindings(content: string) {
  const separator = `\n\n---\n\n## 🕐 ${timeStr}\n\n`;
  if (existsSync(findingsFile)) {
    writeFileSync(findingsFile, readFileSync(findingsFile, "utf8") + separator + content);
  } else {
    const header = `# X Feed — ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n## 🕐 ${timeStr}\n\n`;
    writeFileSync(findingsFile, header + content);
  }
  console.log(`\n📁 Findings saved to findings/${dateStr}.md`);
}

// ─── Sandbox ──────────────────────────────────────────────────────────────────

const vfsFiles: Record<string, string> = {
  "chrome-cdp/scripts/cdp.mjs": cdpScript,
  "chrome-cdp/SKILL.md": cdpSkill,
};

if (previousFindings) {
  vfsFiles[`findings/${dateStr}.md`] = previousFindings;
}

const sandbox = await VfsSandbox.create({
  initialFiles: vfsFiles,
  timeout: 30_000,
});

// ─── Agent ────────────────────────────────────────────────────────────────────

const hasPreviousFindings = previousFindings !== null;

const systemPrompt = `You are an X (Twitter) feed reader agent. Your job is to browse the user's live X/Twitter feed and produce a curated digest.

## On startup — read your context files

Before doing anything else, read these two files using \`read_file\`:

1. \`chrome-cdp/SKILL.md\` — tells you how to use the Chrome CDP tools to browse the web
2. ${hasPreviousFindings ? `\`findings/${dateStr}.md\` — today's findings so far; use this to avoid repeating content and to spot engagement changes` : "(no previous findings today — this is the first run)"}

## What to report

${hasPreviousFindings ? `You have previous findings for today. Use them to:
- **Skip** tweets already reported unless engagement has significantly jumped (2×+ views, or crossed a viral threshold)
- **⬆️ Update** previously listed tweets whose stats changed notably — show the delta ("was 2.3K likes → now 8.1K")
- **Escalate** posts from Top Posts that have since gone viral into 🚨 Requires Attention
- **Focus** on content not yet covered` : "This is the first run of the day — produce a full digest."}

Produce a digest with these sections:

### 🚨 Requires Attention (Viral Alerts)
Tweets blowing up right now — new viral posts AND escalations from previous findings:
- Views > 500K or likes > 5K in the last few hours
- Repost-to-like ratio > 0.2 (spreading fast)
- Breaking news or controversial takes with massive replies
- ⬆️ Previously reported posts that have since crossed a viral threshold
For each: **author, tweet text, stats, direct link**, and if escalated: delta from last report.

### 🔥 Top Posts (New Since Last Check)
The 8–10 most interesting posts not already in previous findings (or with substantially updated stats).
For each: author handle, tweet text, engagement stats, **direct link**.

### 🗂️ Topics & Themes
New topics or themes not in previous findings. Skip already-covered themes unless there's meaningful new activity.

### 📈 Trending Sidebar
Trending topics visible in the sidebar — only new or changed ones.

### 📊 Stats Updates
Previously reported tweets with meaningfully changed engagement — before/after stats and link.

Always include tweet links. Never omit them.`;

// ─── Run ──────────────────────────────────────────────────────────────────────

try {
  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-4-6",
    systemPrompt,
    backend: sandbox,
  });

  console.log("🐦 X Feed Reader Agent starting...");
  console.log(`📅 ${dateStr} ${timeStr} — saving to findings/${dateStr}.md`);
  console.log(hasPreviousFindings ? `📖 Loaded previous findings from findings/${dateStr}.md\n` : "🆕 First run of the day\n");

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "Read your context files first, then browse my X feed. Scroll through at least 3–4 pages to collect 30+ tweets. For every tweet you report include a direct link. Focus on what's new or changed since the previous findings, and flag anything going viral that needs my attention.",
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
