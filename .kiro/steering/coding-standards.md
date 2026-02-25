---
inclusion: auto
---

TU ES SOUS WINDOWS ALORS FAIT DES COMMANDE WINDOWS (PAS DE COMMANDE LINUX OU MAC)

# Coding Standards

## File Size Limit

Files should NEVER exceed 600 lines of code. If a file approaches this limit:
- Refactor into smaller, focused modules
- Extract related functions into separate files
- Use clear, single-responsibility principles

## Package Manager

Always use `bun` instead of `npm` for all commands:
- `bun install` (not `npm install`)
- `bun run dev` (not `npm run dev`)
- `bun run build` (not `npm run build`)
- `bun add <package>` (not `npm install <package>`)

- Alway do the build `bun run build` for me, do not ask me to do it. this way you can see yourself if there's an error.
- Let me do the `bun run dev` or `bun start` because you have the tendency to do multiple of these and you open to many server or process.



## Code Organization

- Keep imports organized and minimal
- Group related functionality into modules
- Use clear, descriptive names
- Prefer composition over inheritance

## TypeScript

- Use strict type checking
- Avoid `any` types when possible
- Define interfaces for complex data structures
- Use type inference where appropriate
