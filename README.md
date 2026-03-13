# X Feed Reader — Deep Agent with Chrome CDP

A [Deep Agent](https://docs.langchain.com/oss/javascript/deepagents/overview) that reads your live X (Twitter) feed by connecting directly to your running Chrome session via the [chrome-cdp](https://github.com/pasky/chrome-cdp-skill) skill.

No separate browser, no re-login — it uses the Chrome tab you already have open.

## Prerequisites

1. **Anthropic API key** (or swap the model for another provider)
2. **Chrome** with remote debugging enabled:
   - Open `chrome://inspect/#remote-debugging` in Chrome
   - Toggle the **"Discover network targets"** switch on

## Setup

```bash
bun install
```

Create a `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
bun index.ts
```

The agent will:
1. Find your X/Twitter tab in Chrome (or navigate to `x.com/home`)
2. Read your feed using Chrome's DevTools Protocol
3. Summarize trending topics, interesting posts, and breaking news

## How it works

- **`deepagents`** — [LangChain's Deep Agent SDK](https://docs.langchain.com/oss/javascript/deepagents/overview) for planning, subagents, and file system tools
- **`chrome-cdp`** — Lightweight Chrome DevTools Protocol CLI that holds a persistent session per tab
- **CDP tools exposed to the agent**: `cdp_list`, `cdp_snap`, `cdp_html`, `cdp_eval`, `cdp_nav`, `cdp_click`, `cdp_scroll`, `cdp_screenshot`

## Customizing

Change the model in `index.ts`:

```ts
const agent = createDeepAgent({
  model: "openai:gpt-5.4",   // or "google_genai:gemini-3.1-pro-preview"
  ...
});
```

Change the task by editing the `content` in the final `agent.invoke()` call.
