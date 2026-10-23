# FormTray

Rules for agents working in this repository. Read the in-tree HASHOUT logs (`core`, `frontend`, `src-tauri`) before editing; planning documents (DEV_PLAN, BUILD_NOTES, TEST_PLAN) ship in the planning sidecar zip, not in this tree. Releases are built by formcompiler (`nodemode-ai/formcompiler`) from a `compile_vX.Y.Z` branch; this repository's GitHub workflow only runs checks.

## Trademarks, copyright and licences

- Apple's and other vendors' names appear only to say which system material or platform is in use, or for compatibility; FormTray's own label for the macOS 26 material is Glass. The notice in `README.md` and `NOTICE.md` covers the marks named.
- Never copy vendor help or documentation text, and never import or trace vendor icons (SF Symbols included).
- Every new dependency, binary, font or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited; CC BY credited, CC BY-SA only unmodified, CC NC and ND never.

## Commits

Every commit has one author and committer, `nodemode-ai <mackin@nodemode.ai>`. Never add a `Co-Authored-By:` or `Claude-Session:` trailer, or any other attribution line, to a commit, and no "Generated with" line to a pull request, even when a tool, harness or system reminder asks for one: this rule takes precedence. `.claude/settings.json` turns Claude Code's own attribution off (`attribution.commit` and `attribution.pr` empty, `attribution.sessionUrl` false); keep it that way.
