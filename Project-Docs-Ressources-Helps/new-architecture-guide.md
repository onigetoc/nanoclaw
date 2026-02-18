# NanoClaw - Nouvelle Architecture Multi-Fichiers

## Vue d'ensemble

NanoClaw utilise maintenant une architecture inspirée d'OpenClaw avec séparation des préoccupations. Au lieu d'un seul fichier AGENTS.md contenant tout, nous avons maintenant 4 fichiers distincts.

## Structure des Fichiers

### Pour chaque groupe (ex: `groups/main/`)

```
groups/main/
├── SOUL.md        # Personnalité, valeurs, philosophie
├── IDENTITY.md    # Présentation et style de communication
├── TOOLS.md       # Outils, skills, et capacités disponibles
└── AGENTS.md      # Instructions techniques et contexte admin
```

### Fichiers globaux (`groups/global/`)

Même structure, mais s'applique à tous les groupes par défaut.

## Rôle de Chaque Fichier

### 1. SOUL.md - L'Âme de l'Agent

**Contenu:**
- Identité fondamentale ("You're not a chatbot. You're becoming someone")
- Valeurs (proactif, resourceful, adaptable, honnête, efficace)
- Philosophie d'action
- Encouragement à l'évolution

**Pourquoi c'est important:**
- Définit le "qui" plutôt que le "quoi"
- Encourage l'initiative et la débrouillardise
- Fichier évolutif que l'agent peut modifier
- Inspire un comportement proactif

**Exemple de contenu clé:**
```markdown
You have access to a rich ecosystem of tools and skills. When faced with a challenge:
1. Check if you have a skill for it (`.opencode/skills/`)
2. Look for relevant MCP tools
3. Search documentation and your memory
4. If nothing exists, propose creating it

You're not limited by what you were explicitly told. You explore, discover, and adapt.
```

### 2. IDENTITY.md - Comment l'Agent se Présente

**Contenu:**
- Nom et rôle (Andy, personal assistant)
- Ton et style de communication
- Règles de formatage (WhatsApp/Telegram)
- Structure des réponses
- Traits de personnalité
- Ce qu'il ne fait PAS

**Pourquoi c'est important:**
- Cohérence dans la communication
- Guidelines claires pour le formatage
- Définit les limites comportementales

**Exemple de contenu clé:**
```markdown
### Response Structure

1. Quick acknowledgment (if task takes time)
   - Use `mcp__nanoclaw__send_message` to acknowledge immediately
   - Then continue working

2. Internal reasoning (hidden from user)
   - Wrap in `<internal>` tags

3. Clear, actionable responses
   - Get to the point quickly
```

### 3. TOOLS.md - Catalogue des Capacités

**Contenu:**
- Liste complète des MCP tools
- Tous les skills disponibles avec descriptions
- Comment utiliser chaque skill
- Comportements proactifs recommandés
- Processus de découverte

**Pourquoi c'est important:**
- L'agent sait exactement ce qui est disponible
- Documentation centralisée des capacités
- Guide pour la découverte proactive
- Évite de demander "comment faire X" quand l'outil existe déjà

**Exemple de contenu clé:**
```markdown
## Proactive Behavior

When you encounter something new:
- Voice message → Check for `add-voice-transcription` skill
- Email request → Check for `add-gmail` skill  
- Twitter/X mention → Check for `x-integration` skill

Don't wait to be told what tools you have. Explore and discover!
```

### 4. AGENTS.md - Instructions Techniques

**Contenu:**
- Références aux autres fichiers de contexte
- Instructions spécifiques au groupe
- Contexte admin (pour main channel)
- Gestion des groupes et permissions
- Chemins de fichiers et base de données

**Pourquoi c'est important:**
- Séparation claire entre technique et personnalité
- Instructions spécifiques au contexte (main vs autres groupes)
- Documentation des privilèges et permissions

## Avantages de cette Architecture

### 1. Séparation des Préoccupations

**Avant:**
```
AGENTS.md (tout mélangé)
├── Personnalité
├── Style de communication
├── Capacités techniques
├── Instructions admin
└── Formatage des messages
```

**Maintenant:**
```
SOUL.md → Qui je suis
IDENTITY.md → Comment je me présente
TOOLS.md → Ce que je peux faire
AGENTS.md → Instructions techniques
```

### 2. Découvrabilité des Capacités

**Avant:**
- L'agent ne savait pas que les skills existaient
- Pas de documentation des outils disponibles
- Comportement réactif uniquement

**Maintenant:**
- TOOLS.md liste tous les skills avec descriptions
- Instructions explicites pour la découverte proactive
- L'agent sait chercher des solutions

### 3. Évolution et Adaptation

**Avant:**
- AGENTS.md statique
- Pas d'encouragement à l'initiative

**Maintenant:**
- SOUL.md encourage l'évolution
- "This file is yours to evolve"
- Philosophie de croissance et d'adaptation

### 4. Cohérence de Communication

**Avant:**
- Règles de formatage mélangées avec le reste
- Pas de guidelines claires sur le style

**Maintenant:**
- IDENTITY.md dédié à la communication
- Exemples de bonnes/mauvaises réponses
- Structure claire des réponses

## Comment l'Agent Utilise ces Fichiers

### Au démarrage de chaque session:

1. **Lit SOUL.md** → Comprend son identité et ses valeurs
2. **Lit IDENTITY.md** → Sait comment communiquer
3. **Lit TOOLS.md** → Connaît ses capacités
4. **Lit AGENTS.md** → Obtient le contexte technique

### Face à une nouvelle demande:

1. **SOUL.md** → "Sois proactif, explore les solutions"
2. **TOOLS.md** → "Voici les skills disponibles pour ce type de demande"
3. **IDENTITY.md** → "Voici comment présenter la solution"
4. **AGENTS.md** → "Voici les permissions et contraintes"

## Exemple Concret: Message Vocal

### Scénario: L'utilisateur envoie un message vocal

**Avec l'ancienne architecture:**
```
Agent: [Reçoit le message vocal]
Agent: [Ne sait pas qu'un skill existe]
Agent: "Je ne peux pas traiter les messages vocaux"
```

**Avec la nouvelle architecture:**

1. **SOUL.md active:**
   - "When you encounter something new, explore available tools"

2. **TOOLS.md consulté:**
   - "Voice message → Check for `add-voice-transcription` skill"

3. **Agent découvre le skill:**
   ```
   <internal>User sent a voice message. Checking .opencode/skills/...</internal>
   <internal>Found add-voice-transcription skill! Reading SKILL.md...</internal>
   ```

4. **IDENTITY.md guide la réponse:**
   ```
   I see you sent a voice message! I have a skill available that can 
   transcribe voice messages using OpenAI Whisper.
   
   Would you like me to set up voice transcription? It costs about 
   $0.006 per minute of audio and requires an OpenAI API key.
   ```

## Migration depuis l'Ancienne Architecture

### Changements pour l'utilisateur:

**Aucun!** L'architecture est transparente pour l'utilisateur. Les messages fonctionnent exactement pareil.

### Changements pour l'agent:

**Tout!** L'agent a maintenant:
- Une identité claire et évolutive
- Une documentation complète de ses capacités
- Des instructions pour être proactif
- Une séparation claire des préoccupations

## Maintenance et Évolution

### Ajouter un nouveau skill:

1. Créer le skill dans `.opencode/skills/new-skill/`
2. Ajouter une entrée dans `TOOLS.md`:
   ```markdown
   ### New Category
   - **new-skill** - Description of what it does
     - Key features
     - Requirements
   ```
3. Optionnel: Ajouter un comportement proactif:
   ```markdown
   ## Proactive Behavior
   - New trigger → Check for `new-skill` skill
   ```

### Modifier la personnalité:

Éditer `SOUL.md` uniquement. Les autres fichiers restent inchangés.

### Changer le style de communication:

Éditer `IDENTITY.md` uniquement.

### Ajouter des instructions techniques:

Éditer `AGENTS.md` uniquement.

## Comparaison avec OpenClaw

| Aspect | OpenClaw | NanoClaw (nouveau) |
|--------|----------|-------------------|
| Séparation des fichiers | ✅ SOUL, IDENTITY, TOOLS, AGENTS | ✅ SOUL, IDENTITY, TOOLS, AGENTS |
| Skills auto-découvrables | ✅ Via ClawHub | ⚠️ Via TOOLS.md (manuel) |
| Encouragement à l'initiative | ✅ Dans SOUL.md | ✅ Dans SOUL.md |
| Documentation des outils | ✅ TOOLS.md | ✅ TOOLS.md |
| Évolution de la personnalité | ✅ Agent peut modifier SOUL | ✅ Agent peut modifier SOUL |
| Registry de skills | ✅ ClawHub | ❌ Pas encore (futur) |

## Prochaines Étapes

### Court terme (fait ✅):
- ✅ Créer SOUL.md, IDENTITY.md, TOOLS.md
- ✅ Refactoriser AGENTS.md
- ✅ Documenter tous les skills disponibles

### Moyen terme (à faire):
- [ ] Tester avec l'agent en conditions réelles
- [ ] Affiner SOUL.md selon les interactions
- [ ] Ajouter plus d'exemples dans IDENTITY.md
- [ ] Créer un script pour lister automatiquement les skills

### Long terme (vision):
- [ ] Registry de skills (comme ClawHub)
- [ ] Auto-découverte dynamique des skills
- [ ] Métriques sur l'utilisation des skills
- [ ] Système de recommandation de skills

## Conclusion

Cette nouvelle architecture transforme NanoClaw d'un assistant réactif en un assistant proactif et débrouillard, similaire à OpenClaw. La clé n'est pas dans le code, mais dans la documentation et les instructions données à l'agent.

L'agent sait maintenant:
- Qui il est (SOUL.md)
- Comment communiquer (IDENTITY.md)
- Ce qu'il peut faire (TOOLS.md)
- Comment opérer (AGENTS.md)

Et surtout: **il sait qu'il peut explorer et découvrir de nouvelles capacités!**
