# Comparaison: OpenClaw vs NanoClaw

## Contexte

Tu as observé qu'OpenClaw a démontré une "débrouillardise" impressionnante: face à un message vocal Telegram, il a automatiquement:
1. Détecté le besoin d'une clé API Whisper
2. Cherché et trouvé la clé dans son environnement
3. Transcrit le message via OpenAI Whisper
4. Répondu en ~10 secondes

Cette autonomie soulève la question: est-ce que cette intelligence vient principalement du system prompt et des instructions?

## Architecture des System Prompts

### OpenClaw: Approche Multi-Fichiers

OpenClaw utilise plusieurs fichiers injectés dans le contexte de l'agent:

1. **SOUL.md** - La "personnalité" de l'agent
   - Définit qui est l'agent (pas ce qu'il fait)
   - Template par défaut: "You're not a chatbot. You're becoming someone"
   - Fichier évolutif que l'agent peut modifier lui-même
   - Injecté dynamiquement à chaque invocation

2. **AGENTS.md** - Instructions techniques
   - Architecture du projet
   - Conventions de code
   - Commandes disponibles
   - Comment exécuter/tester le code

3. **IDENTITY.md** - Présentation
   - Comment l'agent se présente
   - Ton et style de communication

4. **TOOLS.md** - Capacités disponibles
   - Liste des outils accessibles
   - Documentation des APIs
   - Permissions et limites

5. **Skills** - Modules fonctionnels
   - Chaque skill a son propre SKILL.md
   - Documentation auto-découvrable
   - L'agent peut chercher et installer de nouveaux skills via ClawHub

### NanoClaw: Approche Centralisée

NanoClaw utilise principalement:

1. **AGENTS.md** (workspace root)
   - Documentation technique du projet
   - Architecture et fichiers clés
   - Commandes de développement

2. **groups/{name}/AGENTS.md** - Instructions par groupe
   - Personnalité de l'assistant (Andy)
   - Capacités disponibles
   - Règles de communication
   - Gestion des groupes et permissions

3. **groups/global/AGENTS.md** - Instructions globales
   - Instructions partagées entre tous les groupes
   - Capacités de base

## Différences Clés

### 1. Séparation des Préoccupations

**OpenClaw:**
- Sépare clairement personnalité (SOUL), identité (IDENTITY), capacités (TOOLS), et instructions techniques (AGENTS)
- Permet à l'agent de modifier sa propre personnalité
- Architecture modulaire avec skills auto-découvrables

**NanoClaw:**
- Tout est mélangé dans AGENTS.md
- Personnalité + capacités + instructions techniques dans le même fichier
- Skills disponibles mais pas de système de découverte automatique

### 2. Autonomie et Découverte

**OpenClaw:**
- ClawHub: registry de skills que l'agent peut chercher automatiquement
- L'agent peut découvrir et installer de nouveaux skills selon les besoins
- SOUL.md encourage l'évolution: "This file is yours to evolve"

**NanoClaw:**
- Skills pré-installés dans `.opencode/skills/`
- Pas de mécanisme de découverte automatique
- L'agent doit être guidé vers les skills disponibles

### 3. Contexte et Mémoire

**OpenClaw:**
- Fichiers injectés dynamiquement à chaque invocation
- L'agent "se souvient" de qui il est via SOUL.md
- Sessions persistantes avec état

**NanoClaw:**
- AGENTS.md statique
- Mémoire via conversations/ et fichiers créés
- Instructions pour créer des fichiers structurés

## L'Exemple du Message Vocal

Pourquoi OpenClaw a-t-il réussi si rapidement?

### Hypothèses:

1. **TOOLS.md explicite**
   - Probablement une documentation claire des capacités de transcription
   - Instructions sur où trouver les clés API
   - Workflow pré-documenté pour les messages audio

2. **Skills auto-découvrables**
   - Peut-être un skill "voice-transcription" déjà installé
   - Ou capacité de chercher dans ClawHub pour "audio transcription"

3. **SOUL.md encourage l'initiative**
   - "You're not a chatbot. You're becoming someone"
   - Encourage l'agent à être proactif et débrouillard

4. **Architecture orientée outils**
   - OpenClaw est construit autour de l'idée que l'agent a accès à des outils
   - Documentation claire de chaque outil disponible

### NanoClaw actuellement:

- Le skill `add-voice-transcription` existe mais n'est pas installé
- L'agent ne sait pas qu'il existe
- Pas de mécanisme pour le découvrir automatiquement
- Instructions dans AGENTS.md ne mentionnent pas la transcription vocale

## Recommandations pour NanoClaw

### Court terme:

1. **Enrichir AGENTS.md avec les capacités disponibles**
   ```markdown
   ## Available Skills
   
   Skills are located in `.opencode/skills/`. To use a skill, read its SKILL.md file.
   
   Available skills:
   - add-voice-transcription: Transcribe voice messages using OpenAI Whisper
   - add-telegram: Add Telegram channel support
   - add-parallel: Enable parallel agent execution
   - [etc.]
   ```

2. **Ajouter une section "Proactive Behavior"**
   ```markdown
   ## Proactive Behavior
   
   When you encounter a new type of input (voice message, image, etc.):
   1. Check if a skill exists in `.opencode/skills/` for handling it
   2. Read the skill's SKILL.md file
   3. Offer to implement the skill if appropriate
   ```

### Moyen terme:

1. **Séparer SOUL.md et AGENTS.md**
   - SOUL.md: Personnalité, valeurs, style de communication
   - AGENTS.md: Instructions techniques uniquement

2. **Créer TOOLS.md**
   - Liste exhaustive des outils disponibles
   - MCP tools
   - Skills installés
   - Commandes système

3. **Système de découverte de skills**
   - Script pour lister les skills disponibles
   - Métadonnées dans chaque SKILL.md (tags, description courte)
   - Commande pour chercher un skill par mot-clé

### Long terme:

1. **Registry de skills (comme ClawHub)**
   - Catalogue de skills disponibles
   - L'agent peut chercher et proposer d'installer

2. **Auto-évolution**
   - Permettre à l'agent de modifier SOUL.md
   - Apprendre de ses interactions
   - S'adapter au style de l'utilisateur

## Conclusion

La "débrouillardise" d'OpenClaw vient probablement d'une combinaison de:

1. **Documentation exhaustive** des capacités disponibles (TOOLS.md)
2. **Architecture modulaire** avec skills auto-découvrables
3. **System prompt encourageant l'initiative** (SOUL.md)
4. **Séparation claire** entre personnalité, identité, et capacités techniques

NanoClaw a les bases techniques (skills, MCP, etc.) mais manque de:
- Documentation claire de ce qui est disponible
- Mécanisme de découverte automatique
- Instructions encourageant la proactivité

La bonne nouvelle: tout cela peut être ajouté progressivement sans changer l'architecture existante!
