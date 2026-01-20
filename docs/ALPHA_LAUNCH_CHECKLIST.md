# Alpha Launch Checklist

This checklist defines the release gates for alpha readiness.

## Parity gates

- [ ] Ansible top-20 matrix updated with current status
- [ ] Terraform parity checklist updated with current status
- [ ] CLI parity table updated with current status
- [ ] Golden parity tests passing

## Quality gates

- [ ] Unit tests green (`bun test`)
- [ ] Typecheck green (`bun run typecheck`)
- [ ] Lint green (`bun run lint`)

## Security gates

- [ ] Audit review recorded
- [ ] Secrets handling reviewed
- [ ] Vulnerability scan results captured

## Performance gates

- [ ] Baseline performance numbers captured
- [ ] Regression thresholds defined

## Docs gates

- [ ] README updated for current behavior
- [ ] User guide updated for current behavior
- [ ] Known limitations documented
