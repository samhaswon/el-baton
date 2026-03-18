# AGENTS

## Instructions

Don't forget to type check and run relevant tests from [`package.json`](./package.json) for a given change.

If a change is purely a UI change, just type check. If it's a logic change, especially for markdown rendering, unit test.
You cannot run `npm run test:ui` in your environment, so you should ask the user to run that specific test if it is relevant.
Do not run `npm install` commands in your environment; ask the user to run them instead.

When type checking, do not run `npm exec tsc --noEmit` without `--` because npm may swallow the TypeScript flags and run a plain emit. Use `./node_modules/.bin/tsc --noEmit` or `npm exec -- tsc --noEmit` so generated `.js` files are not written beside the source `.ts` files.

README screenshots are generated with `npm run screenshots:demo -- --compile` for a fresh build or `npm run screenshots:demo` if the app is already built.

## Common Issue Fixes

- If a view body is unexpectedly collapsed to zero height, check whether it uses the global `layout-content` class. That class sets `height: 0` in `src/renderer/template/base/css/global/00-foundation.css`.
- If the view is a custom full-height pane and does not need the shared `layout-content` behavior, remove the `layout-content` class from that node and use a dedicated class instead. This was the correct fix for the settings page (`settings-view-body`).
- If the shared class must remain, explicitly override its height on the specific view, the same way other full-height panes do elsewhere in the app.
