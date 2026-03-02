# AGENTS

## Common Issue Fixes

- If a view body is unexpectedly collapsed to zero height, check whether it uses the global `layout-content` class. That class sets `height: 0` in `src/renderer/template/src/core/layout/layout.after.scss`.
- If the view is a custom full-height pane and does not need the shared `layout-content` behavior, remove the `layout-content` class from that node and use a dedicated class instead. This was the correct fix for the settings page (`settings-view-body`).
- If the shared class must remain, explicitly override its height on the specific view, the same way other full-height panes do elsewhere in the app.
