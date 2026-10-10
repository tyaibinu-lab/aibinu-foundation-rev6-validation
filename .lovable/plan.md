# Deliver Rev6 application source ZIP

## Goal
Produce a downloadable ZIP of the full Rev6 application source and save it to Files.

## Steps
1. Stage a clean copy of the project source under `/tmp/rev6-source`, including:
   - `src/`, `public/`, `supabase/` (migrations, tests, config), `docs/`, `drizzle/`
   - Root docs and config: `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `components.json`, `drizzle.config.ts`, `.prettierrc`, `.prettierignore`
   - Gate 0 baseline docs: `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DATABASE.md`, `MODULE_MAP.md`, `LOVABLE_RULES.md`, `README.md`, `roadmap.md`
2. Exclude: `node_modules/`, `.git/`, build output (`dist/`, `.output/`, `.tanstack/`), `.env` and any secret-bearing files, `.lovable/` metadata, log files.
3. List all staged entries recursively (including hidden files) and verify nothing excluded slipped in.
4. Create `rev6-application-source.zip` in `/tmp`, inspect its entries, then copy it to Files (`/mnt/documents`).
5. Present the ZIP as a downloadable artifact in chat.

## Notes
- Read-only with respect to the database: no migrations, no DB access, production untouched.
- `.env` is excluded deliberately so no credentials ship in the archive; the user can recreate it locally from their own Supabase keys.
