# Sprite Drop Folder — Habbo-style Pixel Characters

The Office uses pixel-art sprites for each agent. **Drop PNGs here and the office picks them up automatically.**

## Expected files

```
sprites/
├── mariana.png        ← 4-pose sprite sheet (2x2 grid)
├── carlos.png
├── diana.png
├── alex.png
├── sofia.png
├── lucas.png
├── diego.png
├── max.png
├── valentina.png
├── roberto.png
├── qcbot.png          ← optional
├── oracle.png         ← 4-state sheet (idle/thinking/broadcasting/glow)
└── glitch.png         ← 5-pose sheet (idle + 4 walk dirs)
```

## Sprite sheet layout

Each PNG is a **2×2 grid** with the 4 standard poses:

```
┌────────┬────────┐
│ IDLE   │ WORK   │   row 0
├────────┼────────┤
│ HAPPY  │ THINK  │   row 1
└────────┴────────┘
   col 0    col 1
```

Recommended: 64×128 pixels per pose (so the full sheet is 128×256). The
loader auto-divides by 2 in each axis.

For ORACLE (4 states): same 2×2 layout — `idle`, `thinking`, `broadcasting`, `glow`.

For GLITCH (5 poses): use a **1×5 horizontal sheet** — `idle`, `walk_n`, `walk_e`, `walk_s`, `walk_w`.

## Fallback behavior

If a PNG is missing, the office renders a **procedural pixel character** built
from the agent's preset color palette. The fallback is designed to look at home
in the Habbo-style scene so you can iterate visually before the artists deliver.

## License / usage

These sprites are project-private. Don't redistribute without permission.
