# NanoClaw - État de l'installation Windows

## ✅ Ce qui fonctionne

1. **Mode direct créé** - Alternative aux conteneurs pour Windows/Linux
2. **Bot Telegram connecté** - @maxiclawbot (ID: 7435947552)
3. **Chat enregistré** - tg:1382389542 (groupe "Personal")
4. **Messages reçus** - Le bot reçoit correctement les messages Telegram
5. **Base de données** - SQLite configurée et fonctionnelle
6. **Agent-runner** - Lance correctement avec tsx
7. **Clé API** - ANTHROPIC_API_KEY configurée dans .env

## ❌ Problème actuel

**Erreur** : `Failed to spawn Claude Code process: spawn node ENOENT`

Le SDK Claude (@anthropic-ai/claude-agent-sdk) essaie de spawner un processus `node` en interne mais ne le trouve pas dans le PATH du sous-processus.

### Détails techniques
- L'agent-runner démarre correctement
- Le SDK reçoit l'input
- Mais quand le SDK essaie de lancer Claude Code (qui nécessite node), il échoue
- C'est un problème d'héritage d'environnement sur Windows

## 🔧 Solutions tentées

1. ✗ Utiliser `shell: true` dans spawn
2. ✗ Passer PATH explicitement dans l'environnement
3. ✗ Ajouter le chemin de node au PATH dans le code
4. ✗ Hériter de l'environnement complet avec `env: process.env`

## 🎯 Prochaines étapes possibles

### Option 1 : Installer Docker Desktop (recommandé)
- Télécharger Docker Desktop pour Windows
- Utiliser le mode conteneur comme prévu par NanoClaw
- Avantage : Fonctionne exactement comme sur macOS
- Inconvénient : Nécessite Docker Desktop

### Option 2 : Créer un wrapper node
- Créer un script batch qui configure l'environnement
- Faire pointer le SDK vers ce wrapper
- Avantage : Pas besoin de Docker
- Inconvénient : Complexe et peut ne pas fonctionner

### Option 3 : Utiliser l'API Claude directement
- Remplacer le SDK Agent par des appels API directs
- Avantage : Plus simple, pas de problème de spawn
- Inconvénient : Perd les fonctionnalités avancées du SDK (outils, mémoire, etc.)

### Option 4 : Utiliser WSL2
- Installer Windows Subsystem for Linux 2
- Faire tourner NanoClaw dans WSL2
- Avantage : Environnement Linux complet
- Inconvénient : Configuration supplémentaire

## 📝 Fichiers modifiés

- `src/index.ts` - Ajout du mode direct pour Windows
- `src/container-runner.ts` - Fonction `shouldUseDirectMode()`
- `src/direct-runner.ts` - Nouveau runner sans conteneur
- `container/agent-runner/src/index.ts` - Fix PATH pour Windows
- `.env` - Configuration Telegram + clé API
- `register-chat.js` - Script d'enregistrement de chat
- `check-db.js` - Script de vérification de la DB

## 🐛 Logs d'erreur

Les logs sont dans `groups/main/logs/direct-*.log`

Exemple d'erreur typique :
```
[agent-runner] Agent error: Failed to spawn Claude Code process: spawn node ENOENT
```

## 💡 Recommandation

La solution la plus simple et fiable est d'**installer Docker Desktop**. C'est ce pour quoi NanoClaw a été conçu, et ça évitera tous ces problèmes de PATH et d'environnement.

Sinon, WSL2 est une excellente alternative qui donne un vrai environnement Linux sur Windows.
