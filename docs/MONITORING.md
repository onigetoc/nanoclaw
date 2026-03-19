# EureClaw Monitoring System

Le système de monitoring d'EureClaw fournit une visibilité complète sur ce qui se passe dans le système : quels agents sont actifs, quels modèles sont utilisés, et l'historique des exécutions.

## Vue d'ensemble

Le système de monitoring comprend :

1. **Service de monitoring** (`src/monitoring.ts`) - Suit toutes les exécutions d'agents
2. **Monitoring writer** (`src/monitoring-writer.ts`) - Écrit les données dans des fichiers IPC
3. **Outils MCP** - Permettent aux agents d'interroger le système
4. **CLI de monitoring** (`src/monitoring-cli.ts`) - Dashboard en temps réel

## Utilisation du CLI de monitoring

### Dashboard en temps réel

```bash
bun run monitor
```

Affiche :
- Configuration des modèles (primary, small, fallback, vision)
- Statut du serveur OpenCode
- Nombre d'agents actifs
- Groupes enregistrés
- 20 dernières exécutions d'agents

### Statistiques détaillées

```bash
bun run monitor:stats
```

Affiche :
- Taux de succès global
- Durée moyenne d'exécution
- Répartition par type d'agent
- Répartition par groupe
- Répartition par modèle

### Tail des logs

```bash
bun run monitor:logs
```

Affiche les logs d'exécution en temps réel (comme `tail -f`).

## Outils MCP pour les agents

Les agents peuvent interroger le système de monitoring via deux outils MCP :

### show_system_status

Affiche l'état actuel du système.

```typescript
await use_mcp_tool('show_system_status', {});
```

**Retourne :**
- Configuration des modèles
- Statut du serveur OpenCode
- Agents actifs
- Groupes enregistrés
- État de sommeil
- Uptime
- 10 dernières exécutions

**Quand l'utiliser :**
- L'utilisateur demande "qu'est-ce qui se passe ?"
- L'utilisateur veut savoir quel modèle est utilisé
- Debugging de problèmes système
- Comprendre la charge actuelle

### show_execution_stats

Affiche des statistiques détaillées sur les exécutions.

```typescript
await use_mcp_tool('show_execution_stats', {});
```

**Retourne :**
- Nombre total d'exécutions
- Taux de succès
- Durée moyenne
- Répartition par type d'agent
- Répartition par groupe

**Quand l'utiliser :**
- L'utilisateur demande des performances
- Analyser quels agents sont les plus utilisés
- Comprendre les patterns d'utilisation
- Troubleshooting de performance

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Orchestrator                        │
│                      (src/index.ts)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ├─> Monitoring Service (src/monitoring.ts)
                        │   • Tracks agent executions
                        │   • Records model usage
                        │   • Maintains execution history
                        │
                        ├─> Monitoring Writer (src/monitoring-writer.ts)
                        │   • Writes to IPC files every 5s
                        │   • system-status.json
                        │   • execution-stats.json
                        │
                        └─> Logs to files
                            • data/monitoring/executions-YYYY-MM-DD.jsonl
                            
┌─────────────────────────────────────────────────────────────┐
│                    Agent Container                           │
│              (container/agent-runner)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        └─> MCP Tools (ipc-mcp-stdio.ts)
                            • show_system_status
                            • show_execution_stats
                            • Reads from IPC files
```

## Données de monitoring

### Fichiers de logs

**Location:** `data/monitoring/executions-YYYY-MM-DD.jsonl`

Format JSONL (une ligne JSON par exécution) :

```json
{
  "id": "1708790400000-abc123",
  "timestamp": "2026-02-24T10:00:00.000Z",
  "groupName": "Main",
  "groupFolder": "main",
  "chatJid": "tg:123456789",
  "agentType": "orchestrator",
  "status": "completed",
  "model": "opencode/minimax-m2.5-free",
  "sessionId": "sess_abc123",
  "messageCount": 3,
  "duration": 5432,
  "outputSent": true
}
```

### Fichiers IPC (pour les agents)

**Location:** `data/ipc/`

- `system-status.json` - État actuel du système (mis à jour toutes les 5s)
- `execution-stats.json` - Statistiques d'exécution (mis à jour toutes les 5s)

Ces fichiers sont lus par les outils MCP dans les conteneurs d'agents.

## Logs structurés

Le système utilise `pino` pour des logs structurés avec timestamps :

```
[2026-02-24 10:00:00.000] INFO: 🚀 Agent execution started
    executionId: "1708790400000-abc123"
    group: "Main"
    agent: "orchestrator"
    model: "opencode/minimax-m2.5-free"
    messages: 3
    sessionId: "sess_abc123"

[2026-02-24 10:00:05.432] INFO: ✅ Agent execution completed
    executionId: "1708790400000-abc123"
    group: "Main"
    agent: "orchestrator"
    duration: 5432
    outputSent: true
```

## Exemples d'utilisation

### Voir ce qui se passe actuellement

```bash
bun run monitor
```

### Analyser les performances

```bash
bun run monitor:stats
```

### Debugging en temps réel

```bash
bun run monitor:logs
```

### Depuis un agent (via MCP)

```typescript
// Voir l'état du système
const status = await use_mcp_tool('show_system_status', {});

// Voir les statistiques
const stats = await use_mcp_tool('show_execution_stats', {});
```

## Intégration avec les logs existants

Le système de monitoring complète les logs existants :

- **Logs d'exécution** (`workspaces/{workspace}/logs/`) - Logs détaillés de chaque exécution
- **Logs de monitoring** (`data/monitoring/`) - Métadonnées et statistiques
- **Logs système** (stdout/stderr) - Logs structurés avec pino

Utilisez `list_logs` et `read_log` pour accéder aux logs d'exécution détaillés.

## Configuration

Le monitoring est activé automatiquement au démarrage. Aucune configuration n'est nécessaire.

Pour ajuster le niveau de log :

```bash
LOG_LEVEL=debug bun start
```

Niveaux disponibles : `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## Troubleshooting

### Les outils MCP ne retournent pas de données

Vérifiez que le monitoring writer est démarré :

```bash
# Dans les logs, vous devriez voir :
# [INFO] Monitoring system initialized
# [INFO] Monitoring writer started
```

### Les fichiers IPC n'existent pas

Le monitoring writer crée les fichiers après 5 secondes. Attendez quelques secondes après le démarrage.

### Les statistiques sont vides

Les statistiques sont basées sur les 100 dernières exécutions. Si EureClaw vient de démarrer, il n'y a pas encore de données.

## Développement

Pour ajouter de nouvelles métriques :

1. Ajoutez les champs dans `AgentExecution` (`src/monitoring.ts`)
2. Mettez à jour `writeSystemStatus()` dans `src/monitoring-writer.ts`
3. Ajoutez l'affichage dans les outils MCP (`container/agent-runner/src/ipc-mcp-stdio.ts`)
4. Mettez à jour la documentation dans `workspaces/global/dna/TOOLS.md`
