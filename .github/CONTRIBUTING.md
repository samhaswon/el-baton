# Contributing

Please note that this project is released with a [Code of Conduct](../CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## How can I contribute?

### Submit an issue

Submitting an issue, be it a bug report or a feature request, is one of the best ways to contribute to this project. Checking if everything works in your system and if the [latest commits](https://github.com/samhaswon/el-baton/commits/master) work properly for you are both good ways to find bugs.

Please search existing issues to avoid creating duplicates, we'd rather work on improving El Baton than deal with duplicates.

### Improve issues

Some issues are created with missing information ([`needs more info`](https://github.com/samhaswon/el-baton/issues?q=is%3Aissue+is%3Aopen+label%3A%22needs+more+info%22)), are not reproducible, or are plain duplicates. Help us finding reproducible steps and closing duplicates.

### Comment on issues

We are always looking for more opinions, leaving a comment in the issue tracker is a good opportunity to influence the future direction of El Baton.

We also consider the number of ":+1:" an issue has when deciding what to prioritize next, so be sure to add your ":+1:" to the issues you're most interested in.

### Submit a pull request

Pull requests are especially welcome for issues labeled as [`bug`](https://github.com/samhaswon/el-baton/issues?q=is%3Aissue+is%3Aopen+label%3Abug) or [`help wanted`](https://github.com/samhaswon/el-baton/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22). Pull requests for other issues can be considered too but before working on them you should let us know that you'd like to submit one, so that we can tell you if a pull request can be considered for that particular issue, what the pull request should actually implement and how.

# Local Development Setup

Follow these steps in order to get El Baton ready for development:

```bash
git clone https://github.com/samhaswon/el-baton.git
cd el-baton
npm install
npm run monaco
npm run icon:build
npm run icon:font
npm run template:seed
npm run template:scss
npm run template:css
npm run dev # Terminal 1
```

## Onboarding test note

When testing first-run onboarding behavior (for example, opening Cheatsheets on first empty data directory), use an isolated `HOME` so persistent editor/window state does not interfere:

```bash
mkdir -p /tmp/elbaton-onboarding-test/home
mkdir -p /tmp/elbaton-onboarding-test/data-empty
HOME=/tmp/elbaton-onboarding-test/home npm run dev
```

Then select `/tmp/elbaton-onboarding-test/data-empty` as the data directory.

## Screenshots

Screenshots are automated with Playwright. To capture screenshots:

```bash
npm run screenshots:demo -- --compile
```
