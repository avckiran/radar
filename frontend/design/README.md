Copied from the design handoff (the original lives outside this repo).
- `tokens.json` is the source of truth for colors, type, spacing and radii. `npm run tokens` turns it into `src/styles/tokens.css`.
- `../src/styles/rd-components.css` is the design's reference component stylesheet (classes start with `rd-`).
- To update after a design change: copy the new files over these and rebuild.
