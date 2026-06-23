# AGENTS

## Instructions

Don't forget to type check and run relevant tests from [`package.json`](./package.json) for a given change.

If a change is purely a UI change, just type check. If it's a logic change, especially for markdown rendering, unit test.
You cannot run `npm run test:ui` in your environment, so you should ask the user to run that specific test if it is relevant.
Do not run `npm install` commands in your environment; ask the user to run them instead.

When type checking, do not run `npm exec tsc --noEmit` without `--` because npm may swallow the TypeScript flags and run a plain emit. Use `./node_modules/.bin/tsc --noEmit` or `npm exec -- tsc --noEmit` so generated `.js` files are not written beside the source `.ts` files.

README screenshots are generated with `npm run screenshots:demo -- --compile` for a fresh build or `npm run screenshots:demo` if the app is already built.

## Code Style

Write secure code. 
Beautiful is better than ugly.
Explicit is better than implicit.
Simple is better than complex.
Complex is better than complicated.
Flat is better than nested.
Sparse is better than dense.
Readability counts.
Special cases aren't special enough to break the rules.
Although practicality beats purity.
Errors should never pass silently.
Unless explicitly silenced.
In the face of ambiguity, refuse the temptation to guess.
There should be one, and preferably only one, obvious way to do it.
