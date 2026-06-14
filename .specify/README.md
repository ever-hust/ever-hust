# `.specify/` — Hust Specification Workspace (GitHub Spec Kit)

This directory follows the [GitHub Spec Kit](https://github.com/github/spec-kit) layout.
Every meaningful feature, refactor, and integration in Hust goes through the
**Specify → Plan → Tasks → Implement** loop.

> **Specs live in `docs/specs/`, not here.** This is deliberate — we keep the specs with
> the rest of the human-facing docs. `.specify/` holds only the Spec Kit *machinery*:
> the constitution and the templates.

```
.specify/
├── README.md                # this file
├── memory/
│   └── constitution.md      # non-negotiable design principles for Hust
└── templates/
    ├── spec.template.md     # what & why
    ├── plan.template.md     # how
    └── tasks.template.md    # ordered, ≤1-day work items

docs/specs/                  # ← the actual specs live here
├── ROADMAP.md               # master plan: all epics, phases, sequencing
└── <NN>-<slug>/
    ├── spec.md              # functional spec (what & why)
    ├── plan.md              # implementation plan (how)
    └── tasks.md             # ordered tasks with acceptance criteria
```

## Numbering

Epics use **2-digit IDs** (`01`, `02`, … `19`, plus split epics `19a`, `19b`) matching the
numbering already in [`docs/specs/ROADMAP.md`](../docs/specs/ROADMAP.md). Slugs are
kebab-case and match the epic name (e.g. `03-evaluation-engine`).

## Workflow

1. **Specify.** Copy `templates/spec.template.md` → `docs/specs/<NN>-<slug>/spec.md`. Fill it out.
2. **Plan.** Copy `templates/plan.template.md` → same dir. Outline phases, packages, risks.
3. **Tasks.** Copy `templates/tasks.template.md` → same dir. Break the plan into ≤1-day tasks.
4. **Implement.** Pick the lowest unchecked task. Cross-reference `CLAUDE.md` + the constitution.
5. **Verify.** Lint + type-check + unit + E2E green; **zero competitor references** (Article 11).

## Status Conventions

In `tasks.md`, tasks are checkboxes:

- `- [ ] T01 — …` → pending
- `- [~] T02 — …` → in-progress
- `- [x] T03 — …` → done
- `- [-] T04 — …` → dropped (keep with rationale; don't delete)

## Constitution

Always re-read [`memory/constitution.md`](memory/constitution.md) before authoring a new
spec or starting a build. It encodes the non-negotiables — especially **Article 2**
(standalone-first), **Article 4** (human-in-the-loop), **Article 5** (structured output),
and **Article 11** (competitor confidentiality, STRICT).
