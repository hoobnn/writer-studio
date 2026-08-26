<div align="center">

# ✍️ Writer Studio

**A local-first workspace for writing long-form fiction, built on [Cherry Studio](https://github.com/CherryHQ/cherry-studio).**

Your manuscript, story bible, and revision history stay in plain files on your own disk.
The model only ever sees the context you can inspect.

</div>

> [!NOTE]
> This is a **modified fork** of [Cherry Studio](https://github.com/CherryHQ/cherry-studio) and is
> **not affiliated with or endorsed by CherryHQ**. It adds the Writer Studio workspace and rebrands
> the application; upstream vendor services, analytics, and auto-updates are disabled.
> Licensed under **AGPL-3.0**, inherited from the upstream project.

## Why this exists

Long-form fiction breaks the assumptions most chat UIs are built on. Five problems keep recurring:

1. Prose, story bible, outline, and continuity notes drift apart as the draft grows.
2. You cannot tell what the model actually saw, or why a key detail was left out.
3. AI output overwrites your words, and stale suggestions get applied to prose that has since changed.
4. Your material is locked to a platform, making it costly to switch tools or branch a storyline.
5. The more features a tool adds, the more the writing surface shrinks.

Writer Studio addresses these directly rather than adding another chat window.

## What it does

**Portable projects.** A book is a folder on your disk. Manifest, story bible, outline, continuity,
manuscript, proposals, and history are all plain JSON and text you can read, back up, diff, or move
to another machine. Nothing about your book lives only in an app database.

**AI proposes, never overwrites.** Generation always produces a *proposal*. You see the sources it
used, a preview, and a line-level diff against your prose before anything is applied. Only an applied
proposal advances canon — and each operation has a strict target: drafts and rewrites can replace,
continuations can only append, and analytical proposals cannot touch prose at all.

**You can see the exact context.** Before generating, preview the precise text and story data that
will be sent, with per-source budget accounting, truncation receipts, and which lorebook entries
activated. No guessing about what the model received.

**Revision gates.** Prose and each structured document carry their own content revision. A proposal
built against an older draft is refused rather than silently applied over your newer text.

**Deterministic continuity review.** A typed checker — not a model — reports continuity findings,
coverage, and author waivers. Results are saved alongside the project and travel with it.

**History and recovery.** Chapters snapshot as you write, with list, read, and restore; restoring
first snapshots the current text. Unsaved drafts and in-flight generation jobs survive a restart.

**A workspace that stays out of the way.** Collapsible chapter and copilot panes, plus a focus mode
that clears both and restores your layout on exit.

## Built on Cherry Studio

Everything the upstream project provides is still here — a mature desktop AI client with broad
provider support (OpenAI, Anthropic, Gemini, local models via Ollama and LM Studio), MCP servers,
knowledge bases, document processing, and translation. Writer Studio adds a writing workspace on top
of that foundation rather than reinventing it.

## Development

```bash
pnpm install
pnpm dev
```

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Format, lint, typecheck, and i18n check |
| `pnpm test` | Full test suite |
| `pnpm build:check` | The complete gate: lint + docs + tests |

Design notes and architecture decisions live in [`docs/writer/`](docs/writer/):

- [Architecture decisions](docs/writer/architecture.md) — portable projects, proposal gating, context assembly
- [Upstream sync](docs/writer/upstream-sync.md) — branch layout and how changes are merged from Cherry Studio
- [Product benchmark](docs/writer/product-benchmark.md) — comparison against other AI writing tools

## Contributing

Issues and pull requests are welcome. Development targets the `product/writer` branch.

Bugs in Cherry Studio itself belong
[upstream](https://github.com/CherryHQ/cherry-studio/issues), not here.

## Acknowledgements

Writer Studio exists because of [**Cherry Studio**](https://github.com/CherryHQ/cherry-studio) and
the work of [its contributors](https://github.com/CherryHQ/cherry-studio/graphs/contributors).

The upstream project provides the entire foundation this builds on: the Electron application shell,
the AI provider layer, the data and IPC architecture, the component library, and years of
accumulated engineering. This fork changes a small fraction of that surface and inherits the rest.
Sincere thanks to the CherryHQ team and everyone who has contributed to it.

If you want a general-purpose AI desktop client, use
[Cherry Studio](https://github.com/CherryHQ/cherry-studio) — it is the better choice, and it is
actively maintained by a real team.

## License

[AGPL-3.0](LICENSE), inherited from Cherry Studio.

As a derivative work, this project is distributed under the same terms. If you distribute a modified
version, or run it as a network service, you must make the corresponding source available under
AGPL-3.0.

The upstream project offers commercial licensing that exempts you from AGPL-3.0 requirements; that
arrangement is between you and CherryHQ (bd@cherry-ai.com) and does not extend to this fork.
