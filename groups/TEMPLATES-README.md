# Context Files Template System

## Problem

The assistant name "Andy" was hardcoded in 142 places across the codebase. Changing the assistant name required manual find-and-replace, which was error-prone and tedious.

## Solution

We now use a template system where:
- `.template.md` files contain `{{ASSISTANT_NAME}}` placeholders
- A script generates `.md` files by replacing placeholders with values from `.env`
- The assistant name is configured once in `.env` as `ASSISTANT_NAME=Andy`

## File Structure

```
groups/
├── main/
│   ├── SOUL.template.md      # Template with {{ASSISTANT_NAME}}
│   ├── SOUL.md               # Generated file (gitignored)
│   ├── IDENTITY.template.md
│   ├── IDENTITY.md           # Generated
│   ├── AGENTS.template.md
│   ├── AGENTS.md             # Generated
│   └── TOOLS.md              # No template needed (no name references)
│
└── global/
    ├── SOUL.template.md
    ├── SOUL.md               # Generated
    ├── IDENTITY.template.md
    ├── IDENTITY.md           # Generated
    ├── AGENTS.template.md
    ├── AGENTS.md             # Generated
    └── TOOLS.md              # No template needed
```

## How to Change the Assistant Name

### Step 1: Edit .env

```bash
# In .env file
ASSISTANT_NAME=YourNewName
```

### Step 2: Generate Context Files

```bash
npm run generate:context
```

This will:
1. Read `ASSISTANT_NAME` from `.env`
2. Find all `.template.md` files in `groups/`
3. Replace `{{ASSISTANT_NAME}}` with the actual name
4. Generate corresponding `.md` files

### Step 3: Restart the Service

```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Or rebuild container if needed
./container/build.sh
```

## What Gets Generated

The script replaces these patterns:

| Template | Generated |
|----------|-----------|
| `You are {{ASSISTANT_NAME}}` | `You are Andy` |
| `**Name**: {{ASSISTANT_NAME}}` | `**Name**: Andy` |
| `@{{ASSISTANT_NAME}}` | `@Andy` |

## Adding New Variables

To add more variables (e.g., `{{ASSISTANT_ROLE}}`):

### 1. Add to .env

```bash
ASSISTANT_NAME=Andy
ASSISTANT_ROLE=Personal Assistant
```

### 2. Update the script

Edit `scripts/generate-context-files.js`:

```javascript
const variables = {
  ASSISTANT_NAME: env.ASSISTANT_NAME || 'Andy',
  ASSISTANT_ROLE: env.ASSISTANT_ROLE || 'Personal Assistant'
};
```

### 3. Use in templates

```markdown
You are {{ASSISTANT_NAME}}, a {{ASSISTANT_ROLE}}.
```

## Git Configuration

The generated `.md` files should be gitignored to avoid conflicts:

```gitignore
# In .gitignore
groups/**/SOUL.md
groups/**/IDENTITY.md
groups/**/AGENTS.md
!groups/**/TOOLS.md
```

Only `.template.md` files are committed to version control.

## Workflow

### For Developers

1. Edit `.template.md` files (not `.md` files!)
2. Run `npm run generate:context` to test
3. Commit only `.template.md` files

### For Users

1. Clone the repository
2. Set `ASSISTANT_NAME` in `.env`
3. Run `npm run generate:context`
4. Start the service

## Files That Need Templates

### ✅ Need Templates (contain assistant name)
- `SOUL.md` → `SOUL.template.md`
- `IDENTITY.md` → `IDENTITY.template.md`
- `AGENTS.md` → `AGENTS.template.md`

### ❌ Don't Need Templates (no name references)
- `TOOLS.md` - Lists capabilities, no name needed
- `.context-loading-order.md` - Generic instructions
- `conversations/` - User-generated content

## Troubleshooting

### "No template files found"

Make sure you have `.template.md` files in `groups/main/` and `groups/global/`.

### "Error: .env file not found"

Create a `.env` file in the project root with:
```bash
ASSISTANT_NAME=Andy
```

### Generated files have wrong name

1. Check `.env` has correct `ASSISTANT_NAME`
2. Run `npm run generate:context` again
3. Restart the service

### Changes not reflected in bot

The bot reads `.md` files, not `.template.md` files. Make sure:
1. You ran `npm run generate:context`
2. The `.md` files were generated
3. You restarted the service

## Example: Changing from Andy to Jarvis

```bash
# 1. Edit .env
echo "ASSISTANT_NAME=Jarvis" > .env

# 2. Generate files
npm run generate:context

# Output:
# 🔧 Generating context files from templates...
# 📝 Assistant name: Jarvis
# Found 6 template file(s):
#   ✓ groups/main/SOUL.template.md → groups/main/SOUL.md
#   ✓ groups/main/IDENTITY.template.md → groups/main/IDENTITY.md
#   ✓ groups/main/AGENTS.template.md → groups/main/AGENTS.md
#   ✓ groups/global/SOUL.template.md → groups/global/SOUL.md
#   ✓ groups/global/IDENTITY.template.md → groups/global/IDENTITY.md
#   ✓ groups/global/AGENTS.template.md → groups/global/AGENTS.md
# ✅ Done! Context files generated successfully.

# 3. Restart service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Now your assistant is named Jarvis everywhere!

## Benefits

✅ **Single source of truth**: Name defined once in `.env`
✅ **Easy to change**: Just edit `.env` and regenerate
✅ **No manual find-replace**: Script handles all replacements
✅ **Version control friendly**: Only templates are committed
✅ **Extensible**: Easy to add more variables

## See Also

- [New Architecture Guide](../Project-Docs-Ressources-Helps/new-architecture-guide.md)
- [Groups README](README.md)
