#Command line by OS

###Get api key powershell 
$env:ANTHROPIC_API_KEY

###Get api key cmd
echo %ANTHROPIC_API_KEY%

###set api key widowns permanent ou session set
setx ANTHROPIC_API_KEY "your_api_here"

### Get APi keys
2. Variables spécifiques aux IA
Voici les noms exacts que des logiciels recherchent :
- $env:ANTHROPIC_API_KEY
- $env:OPENAI_API_KEY
- $env:GOOGLE_API_KEY
- $env:GEMINI_API_KEY
- $env:DASHSCOPE_API_KEY
- $env:MISTRAL_API_KEY
- $env:GROQ_API_KEY
- $env:OPENROUTER_API_KEY
- $env:HF_TOKEN
- $env:AWS_ACCESS_KEY_ID et 
- $env:AWS_SECRET_ACCESS_KEY
- $env:MOONSHOT_API_KEY
- $env:DEEPSEEK_API_KEY

others:
$env:COHERE_API_KEY : Très utilisé en entreprise pour le texte et le RAG (recherche documentaire).
$env:PERPLEXITY_API_KEY : Pour utiliser l'IA qui fait des recherches sur le web en temps réel.
$env:TOGETHER_API_KEY : Un concurrent de Groq qui héberge des centaines de modèles open-source.
$env:DEEPSEEK_API_KEY : La nouvelle star chinoise (très puissante et pas chère) qui casse les prix en ce moment.
$env:VOYAGE_API_KEY : Souvent utilisé pour les "embeddings" (la mémoire vectorielle de l'IA).

## OpenCode Commands

### View Usage Statistics
```bash
# Show OpenCode usage stats (sessions, costs, tokens, tool usage)
opencode stats

# From a specific project directory
cd C:\Users\LENOVO\APPS\0-AI-Agents\nanoclaw
opencode stats
```

This shows:
- Total sessions and messages
- Cost breakdown (total, average per day, per session)
- Token usage (input, output, cache read/write)
- Tool usage statistics (bash, read, write, etc.)

**Note:** Cache read tokens are much cheaper than regular tokens. High cache numbers = big savings!

### Other Useful OpenCode Commands
```bash
# Check OpenCode version
opencode --version

# Login/authenticate
opencode auth login

# View current configuration
opencode config

# Export a session
opencode export [sessionID]

# Clear cache
opencode cache clear
```