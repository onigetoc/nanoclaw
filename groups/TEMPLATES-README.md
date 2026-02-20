# Groups Templates System

This directory contains the template system for NanoClaw group context files.

## Structure

```
groups/
├── TEMPLATES-README.md              # This file
│
├── templates/                       # Clean templates (versioned on GitHub)
│   ├── AGENTS.tpl.md
│   ├── BOOTSTRAP.tpl.md
│   ├── IDENTITY.tpl.md
│   ├── MEMORY.tpl.md
│   ├── SOUL.tpl.md
│   ├── TOOLS.tpl.md
│   └── USER.tpl.md
│
├── global/                          # Runtime group (gitignored)
│   └── *.md                         # Personal files, never on GitHub
│
├── main/                            # Runtime group (gitignored)
│   └── *.md
│
└── [other-groups]/                  # Runtime groups (gitignored)
    └── *.md
```

## Template Files

### Core Identity
- `IDENTITY.tpl.md` - How the assistant presents itself and communicates
- `SOUL.tpl.md` - Core values, philosophy, and personality
- `USER.tpl.md` - Information about the user

### Configuration
- `AGENTS.tpl.md` - Technical instructions and context loading
- `TOOLS.tpl.md` - Available tools, skills, and capabilities
- `MEMORY.tpl.md` - Long-term memory structure

### Setup
- `BOOTSTRAP.tpl.md` - First-run initialization guide

## Naming Convention

- Templates: `*.tpl.md` (in `templates/` folder)
- Runtime files: `*.md` (in group folders like `global/`, `main/`)

The `.tpl.md` extension ensures:
- Readable as markdown (syntax highlighting)
- Clearly identifiable as templates
- Easy to filter and manage

## Usage

### Automatic Setup
When a new group is registered, NanoClaw automatically:
1. Creates a new folder in `groups/{group-name}/`
2. Copies all `.tpl.md` files from `templates/`
3. Renames them to `.md` (e.g., `IDENTITY.tpl.md` → `IDENTITY.md`)

### Manual Setup
To initialize a group manually:
```bash
# Copy templates to new group
cp groups/templates/*.tpl.md groups/{group-name}/
# Rename .tpl.md to .md
cd groups/{group-name}
for f in *.tpl.md; do mv "$f" "${f%.tpl.md}.md"; done
```

### Reinitialize a Group
To reset a group to clean templates:
```bash
rm groups/{group-name}/*.md
cp groups/templates/*.tpl.md groups/{group-name}/
cd groups/{group-name}
for f in *.tpl.md; do mv "$f" "${f%.tpl.md}.md"; done
```

## Git Strategy

### What's Tracked
- `groups/templates/` - All template files
- `groups/TEMPLATES-README.md` - This documentation

### What's Ignored
- `groups/*/` - All runtime group folders
- All `.md` files in group folders (personal data)

This ensures:
- Templates are versioned and shared
- Personal data stays local
- No accidental commits of private information

## Development Workflow

### Modifying Templates
1. Edit files in `groups/templates/*.tpl.md`
2. Commit changes to GitHub
3. New users get updated templates

### Modifying Personal Config
1. Edit files in `groups/{group-name}/*.md`
2. Changes stay local (gitignored)
3. Never committed to GitHub

### Adding New Template Types
1. Create new `.tpl.md` file in `groups/templates/`
2. Update this README if needed
3. Existing groups won't get it automatically (manual copy if needed)

## Variable Substitution

Templates support variable substitution using `{{VARIABLE_NAME}}` syntax:

### Available Variables
- `{{ASSISTANT_NAME}}` - Name of the assistant (from `.env`)

### How to Change the Assistant Name

1. Edit `.env`:
```bash
ASSISTANT_NAME=YourNewName
```

2. Generate context files:
```bash
npm run generate:context
```

3. Restart the service:
```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Or rebuild container if needed
./container/build.sh
```

### Adding New Variables

To add more variables (e.g., `{{ASSISTANT_ROLE}}`):

1. Add to `.env`:
```bash
ASSISTANT_NAME=Andy
ASSISTANT_ROLE=Personal Assistant
```

2. Update `scripts/generate-context-files.js`:
```javascript
const variables = {
  ASSISTANT_NAME: env.ASSISTANT_NAME || 'Andy',
  ASSISTANT_ROLE: env.ASSISTANT_ROLE || 'Personal Assistant'
};
```

3. Use in templates:
```markdown
You are {{ASSISTANT_NAME}}, a {{ASSISTANT_ROLE}}.
```

## Benefits

✅ Clean separation of templates and runtime data
✅ Templates are reusable and versioned
✅ Personal data never goes to GitHub
✅ Simple `.gitignore` rules
✅ Easy to reset or reinitialize groups
✅ Scalable for new file types
✅ Variable substitution for customization

## Migration from Old System

If you have existing `.template.md` files:

1. Copy content to new `templates/*.tpl.md` files
2. Update `.gitignore` to new structure
3. Run `npm run generate:context` to create runtime files
4. Old `.template.md` files can be removed

## See Also

- [New Architecture Guide](../Project-Docs-Ressources-Helps/new-architecture-guide.md)
- [Groups README](README.md)
