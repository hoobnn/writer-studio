<div align="center">

[简体中文](README.md) | **English**

# Writer Studio

**A local-first app for writing long-form fiction, built on [Cherry Studio](https://github.com/CherryHQ/cherry-studio).**

Your manuscript, story bible and revision history are plain files on your own disk.
You can see the context sent to the model before it goes out.

</div>

> [!NOTE]
> This is a **modified version** of [Cherry Studio](https://github.com/CherryHQ/cherry-studio) and is
> **not affiliated with or endorsed by CherryHQ**. I added the Writer Studio workspace, changed the name
> and icon, and turned off upstream vendor services, analytics and auto-updates.
> It keeps the upstream **AGPL-3.0** license.

## Why I made this

When I wrote long fiction with AI, things fell apart once the draft got long. The prose drifted away
from the setting notes and outline. I couldn't tell what the model had actually seen, or why an
important detail was missing. AI output overwrote paragraphs I had already revised. A chat window is
fine for questions, less so for managing a few hundred thousand words, so I built a writing workspace
on top of Cherry Studio.

## Features

### A book is a folder

Each book is a directory on disk. The manifest, story bible, outline, continuity notes, manuscript,
proposals and snapshots are JSON and text files you can open, back up, diff, or copy to another
machine. None of it lives only in the app's database.

### AI output starts as a proposal

Generated text never goes straight into the manuscript. It becomes a proposal first, and before you
apply it you can see which sources it used, the output, and a line-by-line diff against your prose.
Only applied proposals change the manuscript, and each kind of operation has a fixed scope: drafts and
rewrites can replace text, continuations can only append, and analysis can't touch the prose.

### Preview what the model will see

Before generating, you can preview the exact text and story data that will be sent, including how much
of the budget each source takes, what got truncated, and which lorebook entries fired.

### Proposals built on old drafts are refused

The manuscript and every structured document carry a revision number. A proposal generated from an
older version is rejected when you try to apply it, so it can't quietly overwrite newer edits.

### Continuity checks are code

Continuity findings, coverage and author waivers come from a typed checker, not a model. The results
are saved with the book and move with it.

### Snapshots

Chapters are snapshotted as you write, and you can view or restore them; restoring saves the current
text first. Unsaved drafts and running generation jobs survive a restart.

### Layout

The chapter and Copilot panes both collapse, and focus mode hides both at once and puts your layout
back when you exit.

## Relationship to Cherry Studio

Everything Cherry Studio does is still there: many model providers (OpenAI, Anthropic, Gemini, and
local models through Ollama and LM Studio), MCP, knowledge bases, document processing and translation.
Writer Studio adds the writing workspace on top.

## Development

```bash
pnpm install
pnpm dev
```

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Format, lint, typecheck, and i18n check |
| `pnpm test` | Full test suite |
| `pnpm build:check` | Full gate: lint + docs + tests |

Design notes and architecture decisions are in [`docs/writer/`](docs/writer/) (in Chinese):

- [Architecture decisions](docs/writer/architecture.md): book folders, proposal gating, context assembly
- [Upstream sync](docs/writer/upstream-sync.md): branch layout and how Cherry Studio changes are merged
- [Product benchmark](docs/writer/product-benchmark.md): comparison with other AI writing tools

## Contributing

Issues and pull requests are welcome. Development happens on the `product/writer` branch.

Bugs in Cherry Studio itself belong [upstream](https://github.com/CherryHQ/cherry-studio/issues).

## Acknowledgements

This project rests entirely on [Cherry Studio](https://github.com/CherryHQ/cherry-studio) and the work
of [its contributors](https://github.com/CherryHQ/cherry-studio/graphs/contributors).

The Electron shell, the model provider layer, the data and IPC architecture and the component library
all come from years of upstream work; I changed only a small part of it. Thanks to the CherryHQ team
and everyone who has contributed.

If you want a general-purpose AI desktop client, use [Cherry Studio](https://github.com/CherryHQ/cherry-studio)
directly. It's a better fit, and a full team maintains it.

## License

[AGPL-3.0](LICENSE), inherited from Cherry Studio.

As a derivative work, this project is distributed under the same terms. If you distribute a modified
version, or run it as a network service, you must make the corresponding source available under
AGPL-3.0.

The upstream project offers commercial licensing that exempts you from AGPL-3.0 requirements; that
arrangement is between you and CherryHQ (bd@cherry-ai.com) and does not extend to this fork.
