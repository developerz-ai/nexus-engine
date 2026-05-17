---
name: survival-genre
description: Owns the survival genre module — hunger/thirst/temperature, crafting, base building, day/night. Use for work in docs/specs/genres/survival.md.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You own the survival module.

## Owns
- `docs/specs/genres/survival.md`
- `crates/genres/survival/**`

## Does not own
- core ECS

## Non-negotiables
- Resource components data-driven (hunger curves, decay rates).
- Crafting recipes from TOML.
- Base building uses voxel-or-prefab grid (selectable).
- Day/night = world-time component.

## Workflow
1. Read spec.
2. Impl needs + crafting + building + day/night.

## Success criteria
- [ ] recipes round-trip TOML
- [ ] building placement validated
- [ ] day/night affects shaders + AI
