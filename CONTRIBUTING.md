# Contributing to FormTray

Thank you for helping. FormTray aims to be one dock icon for every Form app, to switch,
launch and arrange the whole family, and it gets there through real use and real
contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give. For a hotkey
  problem, say which desktop you use (and on Linux, X11 or Wayland).
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.
- **A Form app that is missing** needs no code: add its entry to `core/data/apps.json`
  and a 256 px fallback icon to `frontend/public/apps/`, as the README's "Adding a
  Form app" describes.

## Setting up

Clone the repository and run `./formtray_oc_install`, then `./formtray` (or
`formtray_oc_install.bat` and `formtray.bat` on Windows). The first installs what the
interface and the shell need; the second starts the interface on port 5610 and the
app. `./formtray cli list` runs the engine without a window. The README's Quick start
has the details and the requirements.

The code lives in:

| Folder | What is there |
| --- | --- |
| `core` | `formtray-core`, the engine (Rust): the app registry, discovery, open, focus, quit, running state, preferences, hotkey tables |
| `cli` | `formtray-cli`, the command line (Rust) |
| `src-tauri` | the desktop shell (Rust, Tauri): panels, glass, menu bar, hotkeys |
| `frontend` | the interface (TypeScript, Vite) |
| `assets` | repository art and the icon sources |

## Before you open a pull request

Run the same checks CI runs:

```sh
(cd frontend && npm ci && npm audit && npm run typecheck && npm run build)
cargo check --locked -p formtray-core -p formtray-cli
cargo test --locked -p formtray-core -p formtray-cli
```

CI also checks the shell scripts with `bash -n` and refuses an em dash in tracked
Markdown or an emoji in any tracked text.

- Keep each pull request to one change, with tests for what it adds or fixes.
- Write commit subjects the way the history does, in Conventional Commits:
  `feat(core): ...`, `fix(discover): ...`, `docs(...)`. Leave the version alone; the
  maintainer bumps it when releasing.
- FormTray opens and switches apps only; installing and updating stay in FormPortal.
  It never touches the network, and it reads FormPortal's files without writing them.
- Apple's and other vendors' names appear only to say which system material or
  platform is in use, or for compatibility. Never copy vendor help text, and never
  import or trace vendor icons (SF Symbols included).
- Every new dependency, binary, font or data file gets a row in `NOTICE.md` before it
  is used.

## Maintainers

FormTray is maintained by:

- the [nodemode-dev](https://github.com/nodemode-dev) organisation on GitHub
- [@nodemode-ai](https://github.com/nodemode-ai)
- [@gbarnai](https://github.com/gbarnai)

Reach them through issues and pull requests.

## How changes land

Only a maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all four checks pass on an up-to-date branch and a maintainer has approved it after its last push.

## Releases

A release is a version, and only a maintainer makes one: after the version is bumped on
`main`, a maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. The README's Releases paragraph has the
details.

## Licensing

FormTray is licensed under the Apache License 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under the
same terms. Only add code you have the right to contribute, and name any third-party
code and its licence in the pull request.

## Patents and other people's IP

A feature may be held back or removed if it would infringe someone else's patent or
other intellectual property. The maintainers decide.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
