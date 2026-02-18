# Groups Configuration

Each group has its own isolated context defined by multiple files.

## File Structure

```
groups/
├── global/              # Default configuration for all groups
│   ├── SOUL.md         # Core identity and values
│   ├── IDENTITY.md     # Communication style and presentation
│   ├── TOOLS.md        # Available tools and capabilities
│   └── AGENTS.md       # Technical instructions
│
└── {group-name}/       # Per-group configuration (overrides global)
    ├── SOUL.md         # Group-specific personality
    ├── IDENTITY.md     # Group-specific communication style
    ├── TOOLS.md        # Group-specific tools
    ├── AGENTS.md       # Group-specific technical context
    └── conversations/  # Conversation history
```

## File Purposes

### SOUL.md - The Agent's Core Identity
- Who the agent is (not what it does)
- Values and philosophy
- Encourages proactive behavior and evolution
- "You're not a chatbot. You're becoming someone."

### IDENTITY.md - How the Agent Presents Itself
- Name and role
- Communication tone and style
- Message formatting rules
- Response structure guidelines
- Personality traits

### TOOLS.md - Available Capabilities
- Complete list of MCP tools
- All available skills with descriptions
- How to use each tool/skill
- Proactive behavior recommendations
- Discovery process

### AGENTS.md - Technical Instructions
- References to other context files
- Group-specific technical context
- Admin privileges (for main channel)
- Database and file paths
- Group management instructions

## Why This Architecture?

### Separation of Concerns
- **SOUL.md** → Who am I?
- **IDENTITY.md** → How do I communicate?
- **TOOLS.md** → What can I do?
- **AGENTS.md** → How do I operate?

### Proactive Behavior
The agent now knows:
- What tools and skills are available
- When to use them proactively
- How to discover new capabilities

### Evolution
- SOUL.md encourages the agent to evolve
- Agent can modify its own personality over time
- Learns from interactions and adapts

## Example: Voice Message Handling

**Before (single AGENTS.md):**
- Agent doesn't know voice transcription skill exists
- Responds: "I can't handle voice messages"

**After (multi-file architecture):**
1. SOUL.md: "Be proactive, explore available tools"
2. TOOLS.md: "Voice message → Check `add-voice-transcription` skill"
3. Agent discovers skill and proposes implementation
4. IDENTITY.md: Guides how to present the solution

## Creating a New Group

1. Create directory: `groups/{group-name}/`
2. Copy files from `global/` as starting point
3. Customize as needed for the group
4. Register the group in the database

## Maintenance

### Adding a New Skill
1. Create skill in `.opencode/skills/`
2. Add entry to `TOOLS.md`
3. Optionally add proactive behavior trigger

### Modifying Personality
Edit `SOUL.md` only

### Changing Communication Style
Edit `IDENTITY.md` only

### Adding Technical Instructions
Edit `AGENTS.md` only

## See Also

- [New Architecture Guide](../Project-Docs-Ressources-Helps/new-architecture-guide.md) - Detailed explanation
- [OpenClaw Comparison](../Project-Docs-Ressources-Helps/comparison-openclaw-vs-nanoclaw.md) - How we compare
