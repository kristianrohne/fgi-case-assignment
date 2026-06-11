# Frontend — FGI Subsidiary Governance

React 19 + TypeScript + Vite + Tailwind v4. See the
[root README](../README.md) for the full project overview and run instructions.

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api -> backend on :8000)
npm run build    # type-check + production build
```

Views: **Dashboard** (digest fetch → summary + findings with workflow status),
**Entities** (filter/sort the register), **Inbox** (board-update matching),
**Letters** (agent-letter reconciliation), **History** (past digest runs).
