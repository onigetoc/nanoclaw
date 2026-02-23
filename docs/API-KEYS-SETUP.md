# API Keys Configuration Guide

This guide explains how to configure AI provider API keys for EureClaw/OpenCode.

## Understanding API Key Management

**Important:** EureClaw uses OpenCode SDK, which has its own authentication system. API keys are managed by OpenCode, not by EureClaw's `.env` file.

### Why not use EureClaw's .env?

OpenCode reads API keys from:
1. Its own credentials file (`~/.local/share/opencode/auth.json`)
2. System environment variables

EureClaw's `.env` file is only loaded by the EureClaw Node.js process and is NOT automatically visible to OpenCode.

## Configuration Methods

You have 3 options to configure API keys. Choose the one that works best for you.

### Quick Comparison

| Method | Permanent | Easy | Secure | Cross-Project |
|--------|-----------|------|--------|---------------|
| OpenCode Auth (CLI/TUI) | ✅ | ✅ | ✅ | ✅ |
| System Env Vars | ✅ | ⚠️ | ⚠️ | ✅ |
| Session Env Vars | ❌ | ✅ | ⚠️ | ❌ |

**Recommendation:** Use OpenCode Auth (Option 1) for best experience.

---

### Option 1: OpenCode Auth (Recommended)

This is the easiest and most secure method. OpenCode stores credentials in an encrypted file.

You have two ways to access OpenCode's authentication:

#### Method A: CLI (Command Line)

1. Run the OpenCode authentication command:
   ```bash
   opencode auth login
   ```

2. Select your provider from the list:
   - Google (for Gemini)
   - Anthropic (for Claude)
   - OpenAI (for GPT)
   - etc.

3. Paste your API key when prompted

4. Verify it worked:
   ```bash
   opencode auth list
   ```

#### Method B: TUI (Terminal User Interface)

1. Launch OpenCode's interactive interface:
   ```bash
   opencode
   ```

2. Type the connect command:
   ```
   /connect
   ```

3. Select your provider from the interactive menu

4. Paste your API key when prompted

5. Exit with `/exit` or Ctrl+C

**Pros:**
- ✅ Secure (credentials encrypted)
- ✅ Easy to manage multiple providers
- ✅ Works across all OpenCode projects
- ✅ No need to restart EureClaw
- ✅ Two interfaces (CLI or TUI) - choose what you prefer

**Cons:**
- ❌ Requires manual setup per machine

---

### Option 2: System Environment Variables (Persistent)

Set API keys as permanent system environment variables. They persist across terminal sessions and reboots.

#### Windows

**Method 1: Permanent (User scope - Recommended)**

Use `setx` to save the key permanently for your user account:

```powershell
setx GOOGLE_API_KEY "your_key_here"
setx ANTHROPIC_API_KEY "your_key_here"
```

**Important:** 
- Close and reopen your terminal after using `setx`
- The key will be available for all programs after restart
- No admin rights required

**Method 2: Permanent (System scope - All users)**

Use `setx /M` to save for all users (requires admin):

```powershell
# Run PowerShell as Administrator
setx GOOGLE_API_KEY "your_key_here" /M
```

**Method 3: Via GUI (Permanent)**

1. Open "Edit environment variables for your account"
2. Click "New" under User variables
3. Variable name: `GOOGLE_API_KEY`
4. Variable value: `your_key_here`
5. Click OK

**Restart your terminal** after setting environment variables.

#### Mac/Linux

Add to your shell profile (`~/.zshrc` for Zsh, `~/.bashrc` for Bash):

```bash
export GOOGLE_API_KEY="your_key_here"
export ANTHROPIC_API_KEY="your_key_here"
export OPENAI_API_KEY="your_key_here"
```

Then reload your profile:
```bash
source ~/.zshrc  # or ~/.bashrc
```

**Pros:**
- ✅ Works automatically for all applications
- ✅ Persists across sessions
- ✅ Good for CI/CD and automation

**Cons:**
- ❌ Less secure (visible to all processes)
- ❌ Requires shell/system configuration

---

### Option 3: Session Environment Variables (Temporary)

Set API keys for the current terminal session only. They disappear when you close the terminal.

**What is a "session"?** A session is the current terminal window. When you close and reopen PowerShell/Terminal, it's a new session.

#### Windows PowerShell

**Using `$env:` (temporary - current window only):**
```powershell
$env:GOOGLE_API_KEY="your_key_here"
$env:ANTHROPIC_API_KEY="your_key_here"
npm start
```

**Note:** This is different from `setx` which is permanent. Use `$env:` for quick testing only. The key will disappear when you close PowerShell.

#### Mac/Linux

```bash
export GOOGLE_API_KEY="your_key_here"
export ANTHROPIC_API_KEY="your_key_here"
npm start
```

**Pros:**
- ✅ Quick for testing
- ✅ No permanent changes

**Cons:**
- ❌ Must be set every time you open a new terminal
- ❌ Easy to forget

---

## Recommended Setup for EureClaw Users

We recommend **Option 1 (OpenCode Auth)** for most users:

1. Get your API keys:
   - Google Gemini: https://aistudio.google.com/apikey
   - Anthropic Claude: https://console.anthropic.com/
   - OpenAI: https://platform.openai.com/api-keys

2. Configure with OpenCode:
   ```bash
   opencode auth login
   ```

3. Update `models-config.json` to use your preferred models:
   ```json
   {
     "model": "opencode/minimax-m2.5-free",
     "small_model": "google/gemini-2.5-flash-lite",
     "fallback_model": "opencode/glm-5-free"
   }
   ```

4. Restart EureClaw:
   ```bash
   npm start
   ```

## Verifying Your Configuration

Check which API keys OpenCode can see:

```bash
opencode auth list
```

You should see something like:

```
T  Credentials ~/.local/share/opencode/auth.json
|
•  Google api
|
—  1 credentials

T  Environment
|
•  Google GOOGLE_API_KEY
|
—  1 environment variables
```

## Troubleshooting

### "Model not available" or "API key not found"

1. Verify your API key is configured:
   ```bash
   opencode auth list
   ```

2. If using environment variables, check they're set:
   - Windows: `echo $env:GOOGLE_API_KEY`
   - Mac/Linux: `echo $GOOGLE_API_KEY`

3. Restart EureClaw after adding keys

### "Invalid API key"

- Double-check you copied the full key (no spaces or line breaks)
- Verify the key is active in your provider's dashboard
- Some providers require billing enabled even for free tiers

### Keys in .env not working

Remember: EureClaw's `.env` file is NOT automatically read by OpenCode. You must either:
- Use `opencode auth login` (recommended)
- OR export the keys to system environment variables

## Security Best Practices

1. **Never commit API keys to git**
   - `.env` is in `.gitignore` by default
   - Don't add keys to `models-config.json`

2. **Use OpenCode auth when possible**
   - Keys are encrypted at rest
   - Easier to rotate/revoke

3. **Limit key permissions**
   - Use read-only keys when possible
   - Set spending limits in provider dashboards

4. **Rotate keys regularly**
   - Especially if you suspect they've been exposed
   - Update via `opencode auth login` or environment variables

## Related Documentation

- [Model Configuration Guide](MODEL-CONFIGURATION.md)
- [Gemini Setup Guide](GEMINI-SETUP.md)
- [OpenCode Authentication Docs](https://opencode.ai/docs/authentication)
