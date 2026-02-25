# Configuration OpenCode - IMPORTANT

## ⚠️ NE PAS MODIFIER LES MODÈLES ICI

**Ce fichier (`opencode.json`) configure UNIQUEMENT les agents et leurs permissions.**

**Pour changer les modèles, modifiez `models-config.json` à la place!**

## Pourquoi deux fichiers?

### `models-config.json` (SOURCE DE VÉRITÉ pour les modèles)
- Contient: `model`, `small_model`, `vision_model`, `fallback_model`, etc.
- Utilisé par: Le serveur OpenCode (via variables d'environnement)
- Modifiable via: MCP tools (`change_model`, `set_small_model`)

### `opencode.json` (Configuration des agents)
- Contient: Configuration des agents (build, chat, planner, etc.)
- Utilisé par: OpenCode SDK pour la sélection d'agents
- **NE DOIT PAS** contenir de champs `model` ou `small_model` au niveau racine

## Agents disponibles

### build (agent principal)
- Accès complet aux outils (write, edit, bash)
- Peut déléguer aux subagents (@planner, @researcher, @summarizer)
- Utilisé pour: Tâches normales de développement

### chat (agent conversationnel)
- Modèle léger: `google/gemini-2.5-flash-lite`
- Pas d'accès aux outils (rapide et économique)
- Utilisé pour: Messages simples ("salut", "merci", etc.)

### orchestrator (orchestrateur)
- Délègue intelligemment aux subagents
- Demande permission pour edit/bash
- Utilisé pour: Tâches complexes nécessitant coordination

### planner, researcher, summarizer (subagents)
- Spécialisés pour des tâches spécifiques
- Invoqués par build ou orchestrator avec @

## Comment changer les modèles

### Via MCP tools (recommandé)
```
Andy: Change le modèle principal pour claude-3.5-sonnet
EureClaw: [Utilise mcp__eureclaw__change_model]
```

### Manuellement
1. Modifier `models-config.json`
2. Redémarrer le serveur OpenCode (`bun start`)
3. **NE PAS** modifier `opencode.json`

## Modèles actuels (voir models-config.json)

- **model**: `opencode/minimax-m2.5-free` (principal)
- **small_model**: `google/gemini-2.5-flash-lite` (léger)
- **vision_model**: `google/gemini-2.5-flash-lite` (images)
- **fallback_model**: `opencode/glm-5-free` (secours)

## En cas de problème

Si les modèles semblent incohérents:
1. Vérifier `models-config.json` (source de vérité)
2. Vérifier que `opencode.json` n'a PAS de champs `model`/`small_model` à la racine
3. Redémarrer le serveur OpenCode

## Documentation complète

Voir `dev-notes/model-configuration.md` pour l'architecture complète.
