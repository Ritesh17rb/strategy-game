# Strategy Simulation

A zero-build, static web app to practice high-stakes business decisions. Runs from a single HTML file; no server required. Optional Supabase sign-in for saving sessions. LLM calls use your OpenAI-compatible endpoint directly from the browser.

## Features
- Supabase OAuth (Google) sign-in/sign-out; sessions saved to Supabase
- Demo cards to start scenarios; "Start Fresh" free-form chat without sign-in
- Streaming AI responses via asyncllm with Markdown rendering
- Configure Base URL, API Key, model; settings persisted locally
- Profile modal to list/continue/delete past sessions

## Architecture
- index.html: UI shell (Bootstrap 5, Bootstrap Icons) + import maps
- script.js: single-module app (auth, chat, streaming, storage, UI)
- config.json: app metadata (title/subtitle), demos, defaults, system prompt

### Data Model (Supabase)
- table `game_sessions` (id, user_id, created_at)
- table `chat_messages` (id, session_id, role[user|ai], content, created_at)
- Row Level Security: users can only access their own sessions/messages

## Getting Started
1) Open `index.html` in a modern browser
2) Click "Configure LLM" and set:
   - Base URL: e.g., `https://api.openai.com/v1`
   - API Key: your key
   - Model: e.g., `gpt-4o-mini` (or a model supported by your endpoint)
3) Click a demo card to start, or use "Start Fresh" to chat freely

## Supabase Setup (Optional)
- Create a Supabase project and enable Google OAuth
- Authentication: set Site URL and redirect URLs to your domain/local dev
- SQL schema and RLS policies:

```sql
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
    created_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  role text not null check (role in ('user','ai')),
  content text not null,
  created_at timestamptz default now()
);

alter table public.game_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy if not exists "manage own sessions"
  on public.game_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "manage own messages"
  on public.chat_messages for all
  using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
```

- Update `script.js` with your `supabaseUrl` and `supabaseKey` (anon key)

## Libraries
- bootstrap-llm-provider (v1) — Configure OpenAI-compatible Base URL, API key, and models via UI
- asyncllm (v2) — Streamed Chat Completions for OpenAI-compatible APIs (async iterator over SSE)
- saveform (v2) — Persist form values to localStorage (model/system prompt)
- bootstrap-alert (v1) — Small helper for Bootstrap alert toasts/fallback notifications
- marked (v12) — Client-side Markdown renderer for AI responses
- @supabase/supabase-js (v2) — Supabase auth and database (sessions/messages)
- supabase-oauth-popup (v1) — Helper for OAuth popup flows (Google)
- Bootstrap (v5.3.8) and Bootstrap Icons (v1.13.1)
- @gramex/ui dark-theme (v0.3.1) — Theme helper to respect dark mode

## Configuration
- `config.json`: title/subtitle, demo list, default `model`, `systemPrompt`
- In the app, you can override model/system prompt via the Advanced Settings form
- LLM endpoint and API key are stored in `localStorage` under `bootstrapLLMProvider_openaiConfig`

## Development Notes
- Pure front-end; never store server secrets in the client
- Streaming via asyncllm; UI updates a single bubble as chunks arrive
- Markdown is rendered via `marked`; headings and bold text receive a subtle highlight
- Error handling: alerts are shown via `bootstrap-alert` fallback when network/CDNs fail

## Run & Deploy
- Run: open `index.html` locally or serve via any static server
- Deploy: host the files on any static host (GitHub Pages, Netlify, etc.)

## License
MIT
