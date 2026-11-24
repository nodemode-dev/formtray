# Testing FormTray

FormTray's tests run the app and check what a user or a calling program would notice. This page says how to run them, where they live and what a test must do to be accepted.

## Running the tests

```sh
./formtray test                      # every layer
./formtray test unit                 # one layer: unit or native
./formtray test unit tests/unit/ui   # the rest of the line goes to the runner
./formtray test native -- --ignored  # here the runner is cargo test
```

On Windows use `formtray.bat test`. Run `./formtray_oc_install` first: the unit layer needs `frontend/node_modules` and the native layer needs Rust. An unknown layer name exits 2 with a sentence. The tests need no window, no network and no installed Form app.

## The layers

| Layer | Tool | Where | What it runs against |
| --- | --- | --- | --- |
| unit | vitest, happy-dom | `frontend/tests/unit/` | exported interface functions and the views they build, no browser and no shell |
| native | cargo test | `core/tests/`, `cli/tests/` | the `formtray-core` engine through its public API and the built `formtray-cli` program, with temporary folders for settings and apps |

The unit layer is `npx vitest run` in `frontend`; the native layer is `cargo test --locked -p formtray-core -p formtray-cli`. The desktop shell in `src-tauri` has no tests of its own: what it does is tested through the engine it calls and the interface it shows.

## Where a lane's tests live

The unit tests are grouped by area, one folder for each: `frontend/tests/unit/<lane>/*.test.ts`. They import the real modules from `frontend/src` and stand in only for the outer boundary a module needs (the Tauri `invoke`, `fetch`, timers), never for the module under test. `frontend/vitest.config.ts` picks up every `tests/unit/**/*.test.ts` file and gives each one a happy-dom document.

The native tests are integration test files in the crate's own `tests/` folder, `core/tests/*.rs` and `cli/tests/*.rs`, with a file name that starts with the area it covers. Each file is its own test program, so it sees the crate only through what the crate exports, and `cli/tests` runs the command line the way a person or a script does. Some files are for one platform only and say so with a `cfg` line at the top.

## The five rules

1. The test runs the app through a public surface: an HTTP route, a command through the command runner, an MCP tool, a worker request, an exported interface function, or the visible interface in a browser.
2. It checks a result a user or a calling program would notice: geometry, a number, a saved or exported file, a refusal, an undo, something on screen.
3. Its expected value comes from outside the code under test: mathematics, the rules of a file format checked by an independent reader, the manual and the format documents in `docs/`, an invariant (undo then redo, save then open, export then import), two independent paths that must agree, or a fixture that states its own content.
4. It can fail. Change the expected value once, see the test fail, and change it back.
5. Its name says the behaviour in plain words.

The rules are the Form family's and are written for every app in it. In FormTray the public surfaces are the exported functions of `formtray-core`, the `formtray-cli` command line and its output, the exported interface functions in `frontend/src`, and the settings and registry files the engine reads and writes.

Not accepted:

- reading source files to check text, spelling, comments or formatting;
- checks that a file, function, class or route merely exists;
- a check of the status code alone, with nothing checked in the answer;
- snapshot files made by running the code and saving what came out;
- replacing the thing under test with a stand-in and testing the stand-in;
- a skip or an expected failure without a written reason.

## When a test shows the app is wrong

Do not bend the test. Keep it and mark it as a strict expected failure with a reason that starts with `DEFECT:` and says what the app does, what it should do and where that is stated. In vitest that is `it.fails("... (DEFECT: ...)", ...)`, which fails once the app is fixed until the mark is removed, so a fix cannot go unnoticed. Rust has no strict expected failure, so a native test is marked `#[ignore = "DEFECT: ..."]`; `./formtray test native -- --ignored` runs those, and one that passes there is ready to lose its mark. `git grep -n "DEFECT:" frontend/tests core/tests cli/tests` lists the known ones.

## Changing behaviour

A change in behaviour updates its tests in the same pull request. Tests are added when the owner asks. Test data is made by hand or by the test itself in a temporary folder; nothing is written into the repository or the real home folder. The rules in `CONTRIBUTING.md` hold in tests as in code: no vendor icons, no copied text, and other products are named only for compatibility.

## CI

Every pull request runs one job, `test`, on Linux. It installs Rust and the interface from their lock files (`npm ci` in `frontend`), then runs the two layers one step each, `./formtray test unit` and `./formtray test native`, so the step that fails names the layer. The tests do not run on macOS or Windows in CI, so the macOS-only and Windows-only native tests run only on a developer's machine.
