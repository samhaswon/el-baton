# Demo Data

This directory contains deterministic seed data for automated README demo screenshots.

## Structure

- `seed/`: version-controlled fixture notes and attachments.
- `workspace/`: generated at runtime by screenshot scripts (git-ignored).
- `.home/`: generated HOME directory for injected app state during captures (git-ignored).

## Usage

Run:

```bash
npm run screenshots:demo
```

Optional: force a fresh compile first:

```bash
npm run screenshots:demo -- --compile
```

This uses a **production** bundle (`compile:release`) so Electron routes to local built files instead of a webpack dev server.

The capture script copies `seed/` into `workspace/`, injects deterministic settings into `.home/.el-baton.json`, and writes screenshots to `resources/demo/`.
