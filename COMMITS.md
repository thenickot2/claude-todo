# Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Format

```
<type>(<scope>): <summary>

[optional body]

[optional footer]
```

### Header

- **type** — required, one of the types below
- **scope** — optional, the area of the codebase (e.g. `ui`, `storage`, `claude`, `winmgmt`, `build`)
- **summary** — required, imperative present tense ("add" not "added"), lowercase, no period, max 72 characters

### Body

Optional. Use it to explain **why**, not what. Wrap at 80 characters.

### Footer

Optional. Use for breaking changes and issue references:

```
BREAKING CHANGE: description of what changed and migration path

Closes #42
```

Breaking changes can also be indicated with `!` after the type/scope:

```
feat(storage)!: switch from single file to per-project storage
```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `build` | Build system, dependencies, CI configuration |
| `chore` | Maintenance tasks that don't fit other types |

## Examples

```
feat(ui): add Focus button to in-progress items

fix(storage): handle concurrent writes with lock file

refactor(claude): extract terminal launch into separate function

build: add windows-rs dependency for window management

docs: add commit conventions guide

feat(storage)!: change metadata delimiter from pipe to tab
```

## Guidelines

- Each commit should be a single logical change
- Separate refactors from feature work — don't mix formatting changes with behavior changes
- Prefer small, focused commits over large ones
- Use the body to explain motivation when the summary alone isn't enough
- Reference issues in the footer, not the summary
