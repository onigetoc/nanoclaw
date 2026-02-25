# OpenCode Skills System

Un système modulaire de gestion de compétences pour OpenCode/EureClaw.

## Vue d'ensemble

Le système de compétences permet de:
- **Découvrir** automatiquement les compétences disponibles
- **Valider** les prérequis et la structure
- **Exécuter** des scripts et workflows
- **Composer** plusieurs compétences ensemble
- **Gérer** les dépendances entre compétences

## Structure

```
.opencode/skills/
├── skill-manager/          # Gestionnaire de compétences (core)
│   ├── manager.ts         # API principale
│   ├── parser.ts          # Parse SKILL.md
│   ├── validator.ts       # Valide prérequis
│   ├── executor.ts        # Exécute les compétences
│   ├── types.ts           # Types TypeScript
│   ├── mcp-tools.ts       # Outils MCP
│   └── SKILL.md           # Documentation
│
├── templates/             # Templates de compétences
│   ├── basic-skill.md    # Compétence script simple
│   └── workflow-skill.md # Workflow multi-étapes
│
└── [vos-compétences]/    # Vos compétences personnalisées
    ├── SKILL.md          # Définition
    ├── scripts/          # Scripts (optionnel)
    ├── agent.ts          # Outils MCP (optionnel)
    └── host.ts           # Handlers IPC (optionnel)
```

## Types de Compétences

### 1. Script
Exécute un script TypeScript/JavaScript standalone.

**Cas d'usage:**
- Automatisation de tâches
- Traitement de fichiers
- Opérations système
- Scripts de maintenance

**Exemple:**
```yaml
execution:
  type: script
  entry_point: ./scripts/main.ts
  timeout: 60000
```

### 2. MCP
Fournit des outils MCP à l'agent (ne peut pas être exécuté directement).

**Cas d'usage:**
- Intégrations externes (X, Gmail, etc.)
- Outils système
- APIs personnalisées
- Fonctionnalités agent

**Exemple:**
```yaml
execution:
  type: mcp
  tools_file: ./agent.ts
  host_handler: ./host.ts
```

### 3. Workflow
Chaîne plusieurs compétences ensemble.

**Cas d'usage:**
- Pipelines de déploiement
- Processus multi-étapes
- Orchestration complexe
- Automatisation avancée

**Exemple:**
```yaml
execution:
  type: workflow
  steps:
    - skill: setup
    - skill: build
    - skill: deploy
```

## Utilisation

### Via Agent (MCP Tools)

```typescript
// Lister les compétences
await mcp.list_skills({ category: 'all' });

// Info détaillée
await mcp.skill_info({ skill_name: 'setup' });

// Vérifier prérequis
await mcp.check_skill_prerequisites({ skill_name: 'x-integration' });

// Exécuter une compétence
await mcp.execute_skill({
  skill_name: 'setup',
  params: { skipAuth: false }
});

// Rechercher
await mcp.search_skills({
  query: 'docker',
  type: 'script'
});
```

### Via Code

```typescript
import { SkillManager } from './.opencode/skills/skill-manager/manager.js';
import { SkillExecutor } from './.opencode/skills/skill-manager/executor.js';

// Découvrir toutes les compétences
const skills = SkillManager.discover();

// Obtenir une compétence spécifique
const skill = SkillManager.get('setup');

// Valider
const validation = SkillManager.validate(skill);
console.log(validation.valid, validation.errors);

// Vérifier prérequis
const prereqCheck = await SkillManager.checkPrerequisites(skill);
console.log(prereqCheck.satisfied, prereqCheck.missing);

// Exécuter
const result = await SkillExecutor.execute(skill, {
  param1: 'value1',
  param2: true
});

console.log(result.success, result.output, result.duration);
```

## Créer une Nouvelle Compétence

### 1. Créer le Dossier

```bash
mkdir .opencode/skills/ma-competence
cd .opencode/skills/ma-competence
```

### 2. Créer SKILL.md

Utilisez un template comme base:

```bash
cp ../templates/basic-skill.md ./SKILL.md
```

Éditez le fichier:

```yaml
---
name: ma-competence
description: Ce que fait ma compétence
version: 1.0.0
keywords: [tag1, tag2]

prerequisites:
  tools: [node]
  env_vars: []
  files: []

capabilities:
  provides: [action1]
  consumes: [input1]

execution:
  type: script
  entry_point: ./scripts/main.ts
  timeout: 60000
---

# Ma Compétence

Documentation détaillée...
```

### 3. Implémenter

**Pour script:**
```bash
mkdir scripts
touch scripts/main.ts
```

```typescript
// scripts/main.ts
const params = JSON.parse(process.env.SKILL_PARAMS || '{}');

async function main() {
  console.log('Traitement:', params);
  
  // Votre logique ici
  const result = await processData(params);
  
  // Sortie JSON
  console.log(JSON.stringify({
    success: true,
    result
  }));
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
});
```

**Pour MCP:**
```bash
touch agent.ts
touch host.ts
```

Voir les compétences existantes (x-integration, setup) pour des exemples.

### 4. Tester

```typescript
import { SkillManager } from '../skill-manager/manager.js';

const skill = SkillManager.get('ma-competence');

// Valider
const validation = SkillManager.validate(skill);
console.log('Valid:', validation.valid);

// Vérifier prérequis
const check = await SkillManager.checkPrerequisites(skill);
console.log('Prerequisites:', check.satisfied);

// Dry run
const dryRun = await SkillExecutor.dryRun(skill);
console.log('Can execute:', dryRun.canExecute);

// Exécuter
const result = await SkillExecutor.execute(skill, { test: true });
console.log('Result:', result);
```

## Format SKILL.md

### Métadonnées (Obligatoire)

```yaml
name: nom-unique              # Identifiant unique
description: Description      # Description courte
version: 1.0.0               # Version sémantique
author: Votre Nom            # Optionnel
keywords: [tag1, tag2]       # Pour la recherche
```

### Prérequis (Optionnel)

```yaml
prerequisites:
  skills: [autre-skill]       # Compétences requises
  tools: [docker, git]        # Outils système
  env_vars: [API_KEY]         # Variables d'environnement
  files: [.env, config.json]  # Fichiers requis
  min_node_version: "18.0.0"  # Version Node minimum
```

### Capacités (Optionnel)

```yaml
capabilities:
  provides: [action1, action2] # Ce que fournit la compétence
  consumes: [input1, input2]   # Ce qu'elle consomme
  mcp_tools: [tool1, tool2]    # Outils MCP enregistrés
```

### Exécution (Obligatoire)

```yaml
execution:
  type: script | mcp | workflow
  entry_point: ./scripts/main.ts  # Pour script
  tools_file: ./agent.ts          # Pour mcp
  host_handler: ./host.ts         # Pour mcp
  steps: [...]                    # Pour workflow
  timeout: 60000                  # Timeout en ms
```

## Workflows

Chaînez plusieurs compétences:

```yaml
execution:
  type: workflow
  steps:
    - skill: etape1
      description: Première étape
      params: { key: value }
      on_failure: abort
      
    - skill: etape2
      description: Deuxième étape
      on_failure: retry
      retry_count: 2
      
    - skill: etape3
      description: Troisième étape
      on_failure: continue
```

### Gestion des Échecs

- `abort` - Arrêter immédiatement (défaut)
- `continue` - Ignorer et continuer
- `retry` - Réessayer N fois

## Bonnes Pratiques

1. **Noms clairs** - Utilisez des noms descriptifs en minuscules avec tirets
2. **Documentation** - Écrivez des exemples d'utilisation clairs
3. **Prérequis** - Déclarez toutes les dépendances explicitement
4. **Validation** - Testez avec `SkillManager.validate()`
5. **Gestion d'erreurs** - Gérez les erreurs gracieusement
6. **Timeouts** - Définissez des timeouts raisonnables
7. **Idempotence** - Rendez les compétences sûres à exécuter plusieurs fois
8. **Logs** - Loggez les étapes importantes
9. **Tests** - Testez avant de déployer
10. **Versioning** - Utilisez le versioning sémantique

## Dépannage

### Compétence Non Trouvée

```typescript
// Vider le cache et rescanner
SkillManager.clearCache();
const skills = SkillManager.discover(true);
```

### Prérequis Non Satisfaits

```typescript
const check = await SkillManager.checkPrerequisites(skill);
console.log('Missing:', check.missing);
console.log('Details:', check.details);
```

### Erreurs de Validation

```typescript
const validation = SkillManager.validate(skill);
console.log('Errors:', validation.errors);
console.log('Warnings:', validation.warnings);
```

### Échecs d'Exécution

```typescript
const result = await SkillExecutor.execute(skill, params);
if (!result.success) {
  console.log('Error:', result.error);
  console.log('Logs:', result.logs);
  console.log('Duration:', result.duration);
}
```

## Intégration avec EureClaw

Le système de compétences s'intègre avec:

- **Agent Runner** - Charge les outils MCP des compétences
- **IPC System** - Exécute les compétences via messages IPC
- **OpenCode SDK** - Fournit les outils aux agents

### Ajouter des Outils MCP

Les compétences MCP sont automatiquement chargées au démarrage du container.

Voir `container/agent-runner/src/ipc-mcp-stdio.ts` pour l'intégration.

## Exemples de Compétences

### Compétences Existantes

- `setup` - Installation et configuration initiale
- `x-integration` - Intégration X/Twitter
- `add-voice-transcription` - Transcription audio
- `browser-playwright` - Automatisation navigateur

### Templates

- `templates/basic-skill.md` - Script simple
- `templates/workflow-skill.md` - Workflow multi-étapes

## API Reference

### SkillManager

```typescript
class SkillManager {
  static discover(forceRefresh?: boolean): SkillDefinition[]
  static get(name: string): SkillDefinition | null
  static search(options: SkillSearchOptions): SkillDefinition[]
  static validate(skill: SkillDefinition): ValidationResult
  static async checkPrerequisites(skill: SkillDefinition): Promise<PrerequisiteCheckResult>
  static async install(options: SkillInstallOptions): Promise<{success: boolean; error?: string}>
  static async uninstall(name: string): Promise<{success: boolean; error?: string}>
  static async list(): Promise<Array<{...}>>
  static getDependencies(skillName: string): string[]
  static clearCache(): void
}
```

### SkillExecutor

```typescript
class SkillExecutor {
  static async execute(skill: SkillDefinition, params?: Record<string, any>): Promise<ExecutionResult>
  static async dryRun(skill: SkillDefinition): Promise<{canExecute: boolean; issues: string[]; warnings: string[]}>
}
```

### SkillParser

```typescript
class SkillParser {
  static parse(filePath: string): SkillDefinition | null
  static validate(skill: SkillDefinition): {valid: boolean; errors: string[]}
  static extractExamples(content: string): string[]
  static extractUsage(content: string): string
}
```

### SkillValidator

```typescript
class SkillValidator {
  static async checkPrerequisites(skill: SkillDefinition): Promise<PrerequisiteCheckResult>
  static validate(skill: SkillDefinition): ValidationResult
}
```

## Améliorations Futures

- [ ] Dépôts de compétences distants
- [ ] Marketplace de compétences
- [ ] Résolution automatique des dépendances
- [ ] Générateur de templates
- [ ] Métriques de performance
- [ ] Framework de tests
- [ ] Versioning et mises à jour
- [ ] Compétences en packages npm
- [ ] Documentation auto-générée
- [ ] Interface web de gestion

## Support

Pour des questions ou problèmes:
1. Consultez la documentation dans `SKILL.md`
2. Vérifiez les templates dans `templates/`
3. Examinez les compétences existantes
4. Utilisez les outils de validation et dry-run

## Contribution

Pour contribuer une nouvelle compétence:
1. Créez la compétence dans `.opencode/skills/`
2. Suivez le format SKILL.md
3. Testez avec le gestionnaire
4. Documentez les exemples d'utilisation
5. Ajoutez des tests si applicable
