# Contributing to Hust

Thanks for your interest in contributing! Hust is open-source software licensed under the
**GNU AGPL-3.0-or-later**. By contributing, you agree that your contributions will be licensed
under the same license.

## Ground rules

- Be respectful. This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything security-related, follow [SECURITY.md](SECURITY.md) — **do not** open a public
  issue.
- Open an issue to discuss substantial changes before investing in a large pull request.

## Development setup

This is a Turborepo monorepo using **pnpm** (do not use `npm`/`yarn`).

```bash
pnpm install --ignore-scripts
cp apps/web/.env.example apps/web/.env.local   # fill in your own values
pnpm db:push
pnpm db:seed
pnpm dev          # http://localhost:8443
```

See [README.md](README.md) and [CLAUDE.md](CLAUDE.md) for architecture and commands.

## Before you open a PR

Run the full local gate — all must pass:

```bash
pnpm lint            # eslint --max-warnings 0
pnpm check-types     # TypeScript
pnpm test            # Jest unit tests
pnpm test:e2e        # Playwright E2E (optional but encouraged)
pnpm format          # Prettier
```

## Pull request guidelines

- Keep PRs focused and reasonably small; one logical change per PR.
- Write a clear description: what changed, why, and how you tested it.
- Add or update tests for any behavior change.
- Update docs (`README.md`, `docs/`, `CLAUDE.md`) when you change behavior or architecture.
- **Never commit secrets.** `.env*` files are gitignored — keep it that way. A committed
  credential must be rotated and history-scrubbed.
- Match the surrounding code style; the Prettier/ESLint config is the source of truth.

## Commit / branch conventions

- Branch off `develop`.
- Use descriptive commit messages (Conventional Commits encouraged, e.g. `feat:`, `fix:`,
  `docs:`, `chore:`).

## License of contributions

All contributions are accepted under **AGPL-3.0-or-later**. Do not submit code you are not
authorized to license this way, and do not paste proprietary or incompatibly-licensed code.

## Questions

Open a GitHub Discussion or issue. Thank you for contributing! 🙌
