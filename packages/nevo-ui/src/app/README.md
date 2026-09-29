# App architecture

`src/app` is organized by runtime responsibility:

- `shell/` owns the application frame, global navigation mode, and shell-level sizing.
- `workspace/` owns Primary/Secondary regions, local workspace navigation, headers, and motion.
- `floating/` owns floating application regions and windows.

Consumers should import the public API from `src/app/index.ts`. Tests, stories, and Figma
definitions stay next to the module they exercise; they are not separate runtime modules.

