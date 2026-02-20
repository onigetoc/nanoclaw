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