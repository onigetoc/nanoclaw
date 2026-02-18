# NanoClaw - Documentation Complète du Projet

**Version:** 1.0  
**Date:** 17 février 2026  
**Auteur:** Documentation générée par Andy (Assistant NanoClaw)

---

## Table des matières

1. [Introduction](#introduction)
2. [Philosophie et Objectifs](#philosophie-et-objectifs)
3. [Architecture Générale](#architecture-générale)
4. [Composants Principaux](#composants-principaux)
5. [Flux de Données](#flux-de-données)
6. [Structure des Dossiers](#structure-des-dossiers)
7. [Configuration](#configuration)
8. [Système de Groupes](#système-de-groupes)
9. [Sécurité et Isolation](#sécurité-et-isolation)
10. [Développement et Personnalisation](#développement-et-personnalisation)

---

## Introduction

**NanoClaw** est un assistant IA personnel qui fonctionne dans des conteneurs isolés de manière sécurisée. Il s'agit d'une alternative légère et compréhensible à OpenClaw (anciennement ClawBot), offrant les mêmes fonctionnalités de base sans la complexité et les problèmes de sécurité des systèmes plus imposants.

### Qu'est-ce que NanoClaw ?

NanoClaw connecte des plateformes de messagerie (WhatsApp, Telegram) à l'OpenCode SDK dans des conteneurs isolés. Chaque message est traité par un agent IA qui peut :

- Répondre aux questions et converser
- Rechercher sur le web et récupérer du contenu
- Naviguer sur le web (cliquer, remplir des formulaires, captures d'écran)
- Lire et écrire des fichiers
- Exécuter des commandes shell
- Programmer des tâches récurrentes

### Comparaison avec OpenClaw

| Aspect            | NanoClaw                   | OpenClaw                             |
| ----------------- | -------------------------- | ------------------------------------ |
| **Taille**        | ~30 fichiers source        | 52+ modules                          |
| **Architecture**  | Un processus Node.js       | 4-5 processus différents             |
| **Sécurité**      | Isolation OS (conteneurs)  | Niveau application (listes blanches) |
| **Configuration** | Quelques fichiers          | 8+ fichiers de config                |
| **Abstractions**  | Minimaliste                | 15+ fournisseurs de canaux           |
| **Mémoire**       | Partagée dans un processus | Complexe avec files d'attente        |

---

## Philosophie et Objectifs

### Les 4 Principes Fondamentaux

1. **Assez petit pour être compris**
   - Un seul processus Node.js
   - Une poignée de fichiers source (~30 fichiers)
   - Pas de microservices ou de files de messages
   - Pas d'abstractions inutiles

2. **Sécurisé par isolation**
   - Les agents fonctionnent dans de vrais conteneurs Linux
   - Apple Container sur macOS
   - Docker sur Linux/Windows
   - Pas de vérifications de permissions au niveau applicatif

3. **Conçu pour un seul utilisateur**
   - Ce n'est pas un framework
   - Logiciel fonctionnel que vous forkez et personnalisez
   - Pas d'installation complexes, pas de tableaux de bord

4. **Natif IA**
   - Pas d'assistants d'installation
   - Pas d'outils de surveillance ou de débogage
   - Demandez simplement à Claude Code de vous aider

### Pourquoi NanoClaw existe

OpenClaw (anciennement ClawBot) est devenu une "monstruosité" :

- 4-5 processus différents exécutant différentes passerelles
- Fichiers de configuration sans fin
- Intégrations interminables
- Cauchemar de sécurité où les agents ne s'exécutent pas dans des processus isolés
- Des contournements qui fuient essaient d'empêcher l'accès aux parties du système
- Impossible de comprendre réellement l'ensemble du codebase

**NanoClaw est la réponse :** simple, sécurisé, compréhensible.

---

## Architecture Générale

### Vue d'ensemble du Flux de Données

```
Messages WhatsApp/Telegram
         ↓
    Base de données SQLite (store/messages.db)
         ↓
   Boucle de polling des messages (toutes les 2s)
         ↓
   Routeur (vérification des déclencheurs, formatage)
         ↓
   File d'attente de groupe (contrôle de concurrence)
         ↓
   Création de conteneur (Apple Container/Docker)
         ↓
   Agent Runner (OpenCode SDK)
         ↓
   Réponse → WhatsApp/Telegram
```

### Stack Technologique

| Composant             | Technologie                         |
| --------------------- | ----------------------------------- |
| **Runtime Hôte**      | Node.js 20+                         |
| **WhatsApp**          | @whiskeysockets/baileys             |
| **Telegram**          | grammy                              |
| **Base de données**   | SQLite (better-sqlite3)             |
| **Runtime Conteneur** | Apple Container (macOS) ou Docker   |
| **Agent IA**          | OpenCode SDK                        |
| **Journalisation**    | Pino + pino-pretty                  |
| **Planification**     | Planificateur intégré (cron-parser) |

---

## Composants Principaux

### 1. **src/index.ts** (L'Orchestrateur)

**Rôle :** Point d'entrée principal et coordinateur central

**Responsabilités clés :**

- Vérifie qu'Apple Container est en cours d'exécution (démarrage auto si nécessaire)
- Initialise la base de données et charge l'état
- Gère les connexions multiples de canaux (WhatsApp, Telegram)
- Exécute la boucle de polling des messages
- Gère l'arrêt gracieux

**Fonctionnement :**

```typescript
// Initialise tous les sous-systèmes
await initializeDatabase();
await initializeChannels();
await initializeTaskScheduler();
await initializeGroupQueue();

// Boucle principale
while (running) {
  const messages = await pollNewMessages();
  await processMessages(messages);
  await sleep(2000);
}
```

### 2. **src/channels/whatsapp.ts**

**Rôle :** Connexion WhatsApp Web via la bibliothèque Baileys

**Fonctionnalités :**

- Authentification par QR code
- Reconnexion automatique en cas de déconnexion
- Indicateurs de saisie (typing)
- Traduction LID vers numéro de téléphone pour le chat personnel
- Synchronisation des métadonnées de groupe (quotidienne)
- File d'attente des messages sortants pour la résilience hors ligne

**Architecture :**

```typescript
class WhatsAppChannel implements Channel {
  async connect(): Promise<void>;
  async sendMessage(jid: string, text: string): Promise<void>;
  ownsJid(jid: string): boolean; // Vérifie si c'est un JID WhatsApp
  async disconnect(): Promise<void>;
  async setTyping(jid: string, isTyping: boolean): Promise<void>;
}
```

**Gestion des événements :**

- `connection.update` : Gère l'état de connexion
- `messages.upsert` : Nouveaux messages entrants
- `groups.update` : Mises à jour des métadonnées de groupe

### 3. **src/channels/telegram.ts**

**Rôle :** Connexion API Telegram Bot

**Fonctionnalités :**

- Commande `/chatid` pour l'enregistrement de groupe
- Commande `/ping` pour vérifier l'état
- Gère : texte, photos, vidéos, voix, documents, stickers, localisation, contacts
- Conversion automatique des mentions @bot en format déclencheur
- Division des messages de 4096 caractères

**Gestion des types de messages :**

```typescript
// Types supportés
- text: Message textuel
- photo: Images avec légende
- video: Vidéos
- voice: Messages vocaux
- document: Fichiers
- sticker: Stickers
- location: Localisations GPS
- contact: Contacts
```

### 4. **src/router.ts**

**Rôle :** Formatage des messages et routage sortant

**Fonctions principales :**

- `formatMessages()` : Formate les messages en XML pour l'agent
- `formatOutbound()` : Supprime les balises internes des réponses
- `findChannel()` : Route les réponses vers le canal correct

**Format XML des messages :**

```xml
<messages>
  <message sender="John" time="2024-01-31T14:32:00Z">
    @Andy quelle est la météo ?
  </message>
  <message sender="Jane" time="2024-01-31T14:33:00Z">
    Bonjour tout le monde !
  </message>
</messages>
```

### 5. **src/db.ts**

**Rôle :** Opérations de base de données SQLite

**Tables :**

| Table               | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `messages`          | Stocke tous les messages (avec filtrage des messages bot) |
| `chats`             | Métadonnées des chats pour la découverte de groupes       |
| `scheduled_tasks`   | Tâches récurrentes/ponctuelles                            |
| `task_run_logs`     | Historique d'exécution                                    |
| `router_state`      | Horodatages du dernier traitement                         |
| `sessions`          | IDs de session par groupe                                 |
| `registered_groups` | Configuration des groupes                                 |

**Schéma détaillé :**

```sql
-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_jid TEXT,
  sender TEXT,
  sender_name TEXT,
  content TEXT,
  timestamp TEXT,
  is_from_me INTEGER,
  is_bot_message INTEGER
);

-- Groupes enregistrés
CREATE TABLE registered_groups (
  jid TEXT PRIMARY KEY,
  name TEXT,
  folder TEXT,
  trigger_pattern TEXT,
  added_at TEXT,
  container_config TEXT,
  requires_trigger INTEGER
);

-- Tâches planifiées
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  group_folder TEXT,
  chat_jid TEXT,
  prompt TEXT,
  schedule_type TEXT,
  schedule_value TEXT,
  next_run TEXT,
  last_run TEXT,
  last_result TEXT,
  status TEXT,
  created_at TEXT,
  context_mode TEXT
);
```

### 6. **src/container-runner.ts**

**Rôle :** Création de conteneurs d'agents avec montages appropriés

**Fonctionnalités clés :**

- Construction des montages de volumes basée sur la configuration du groupe
- Validation des montages additionnels contre une liste blanche
- Gestion du streaming de sortie via des marqueurs
- Gestion des délais d'expiration et nettoyage des conteneurs
- Écriture des snapshots de tâches/groupes pour l'accès agent

**Processus de création :**

```typescript
1. Valider le groupe et les permissions
2. Construire la liste des montages :
   - /workspace/group (dossier du groupe)
   - /workspace/global (mémoire globale)
   - /workspace/ipc (communication IPC)
   - /workspace/sessions (données de session)
   - /workspace/project (projet complet pour main)
3. Valider contre la liste blanche
4. Exécuter la commande container run
5. Streamer la sortie via des marqueurs
```

### 7. **src/group-queue.ts**

**Rôle :** File d'attente de messages par groupe avec limite de concurrence globale

**Fonctionnalités :**

- `MAX_CONCURRENT_CONTAINERS` par défaut : 5
- Logique de nouvelle tentative avec backoff exponentiel (max 5 essais)
- Messages envoyés aux conteneurs actifs (pas besoin de redémarrage)
- Gestion de l'arrêt gracieux

**Algorithme :**

```typescript
class GroupQueue {
  private running = new Map<string, Promise<void>>();
  private pending = new Map<string, Queue[]>();

  async enqueue(groupId: string, message: Message): Promise<void> {
    // Si un conteneur existe déjà, envoyer directement
    if (this.running.has(groupId)) {
      await this.sendToRunning(groupId, message);
      return;
    }

    // Sinon, ajouter à la file d'attente
    this.pending.get(groupId).push(message);
    await this.processQueue(groupId);
  }

  private async processQueue(groupId: string): Promise<void> {
    // Limiter la concurrence globale
    while (this.running.size >= MAX_CONCURRENT) {
      await this.waitForSlot();
    }

    // Créer le conteneur et traiter
    this.running.set(groupId, this.spawnAndProcess(groupId));
  }
}
```

### 8. **src/task-scheduler.ts**

**Rôle :** Exécute les tâches planifiées quand elles sont dues

**Types de planification :**

- `cron` : Expressions cron avec support du fuseau horaire
- `interval` : Millisecondes entre les exécutions
- `once` : Horodatage ISO pour exécution unique

**Boucle de planification :**

```typescript
// Vérifie toutes les 60 secondes
setInterval(async () => {
  const dueTasks = await db.getDueTasks();
  for (const task of dueTasks) {
    await groupQueue.enqueue(task.group_folder, {
      type: 'task',
      prompt: task.prompt,
      taskId: task.id,
    });
  }
}, 60000);
```

### 9. **src/ipc.ts**

**Rôle :** Communication inter-processus basée sur les fichiers

**Opérations supportées :**

| Opération        | Description                                 |
| ---------------- | ------------------------------------------- |
| `schedule_task`  | Programmer une nouvelle tâche               |
| `pause_task`     | Mettre une tâche en pause                   |
| `resume_task`    | Reprendre une tâche en pause                |
| `cancel_task`    | Annuler une tâche                           |
| `send_message`   | Envoyer un message au groupe                |
| `register_group` | Ajouter un nouveau groupe (main uniquement) |
| `refresh_groups` | Synchroniser les métadonnées des groupes    |

**Flux IPC :**

```typescript
1. L'agent écrit un fichier JSON dans /workspace/ipc/{messages,tasks}/
2. Le watcher IPC de l'hôte scrute toutes les secondes
3. Traiter le fichier selon le type :
   - Messages : Router vers le canal pour envoi
   - Tâches : Valider l'autorisation, mettre à jour la base de données
4. Supprimer le fichier après traitement
5. Les erreurs sont déplacées vers le dossier ipc/errors/
```

**Autorisation :**

- Basée sur le répertoire IPC (identité du groupe)
- Le groupe main a tous les privilèges
- Les autres groupes limités à leurs propres ressources

### 10. **container/agent-runner/src/index.ts**

**Rôle :** Code qui s'exécute À L'INTÉRIEUR du conteneur

**Responsabilités :**

- Lit l'entrée depuis stdin
- Crée/reprend les sessions OpenCode
- Scrute les messages IPC
- Stream les résultats via des marqueurs
- Archivage périodique des conversations
- Supporte le mode conteneur et direct

**Cycle de vie :**

```typescript
1. Lire l'entrée du conteneur (prompt, groupFolder, etc.)
2. Créer ou reprendre une session OpenCode
3. Injecter le contexte système (AGENTS.md + env)
4. Envoyer le prompt initial
5. Boucle de polling IPC :
   - Vérifier les nouveaux messages IPC
   - Envoyer à la session via session.prompt()
   - Streamer les réponses
6. Timeout d'inactivité après 30min
7. Nettoyage et fermeture
```

---

## Flux de Données

### Flux de Message Entrant

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MESSAGE ARRIVE                                           │
│    WhatsApp (Baileys) ou Telegram (Grammy)                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. STOCKAGE SQLITE                                          │
│    Stocké avec métadonnées (horodatage, expéditeur, contenu)│
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BOUCLE DE POLLING                                        │
│    Vérifie les nouveaux messages toutes les 2 secondes      │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. VALIDATION DU ROUTEUR                                    │
│    • Chat enregistré ? (Ignorer si non)                     │
│    • Message correspond au déclencheur ?                    │
│      (Main : pas besoin, Autres : déclencheur requis)       │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. FORMATAGE DES MESSAGES                                   │
│    Construit le XML avec tous les messages depuis la        │
│    dernière interaction de l'agent                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. MISE EN FILE D'ATTENTE                                   │
│    GroupQueue gère la concurrence                           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. CRÉATION DE CONTENEUR                                    │
│    Avec le contexte du groupe                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. TRAITEMENT PAR L'AGENT                                   │
│    Via OpenCode SDK                                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. STREAM DE LA RÉPONSE                                     │
│    Retour à l'utilisateur                                   │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. MISE À JOUR DU CURSEUR                                  │
│     (last_agent_timestamp) pour éviter le retraitement      │
└─────────────────────────────────────────────────────────────┘
```

### Flux de Tâche Planifiée

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BOUCLE DU PLANIFICATEUR                                  │
│    Vérifie toutes les 60 secondes                           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. TROUVER LES TÂCHES DUES                                  │
│    Depuis la table scheduled_tasks                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. MISE EN FILE D'ATTENTE VIA GROUPQUEUE                    │
│    (Identique aux messages)                                 │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. CRÉATION DE CONTENEUR AVEC CONTEXTE DE TÂCHE             │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. EXÉCUTION PAR L'AGENT                                    │
│    Avec accès complet aux outils                            │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. MESSAGERIE OPTIONNELLE                                   │
│    Via IPC send_message                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. JOURNALISATION DU RÉSULTAT                               │
│    Dans task_run_logs                                       │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. CALCUL DE LA PROCHAINE EXÉCUTION                         │
│    (Pour les tâches récurrentes)                            │
└─────────────────────────────────────────────────────────────┘
```

### Flux de Communication IPC

```
┌─────────────────────────────────────────────────────────────┐
│ AGENT (Dans le conteneur)                                   │
│ Écrit un fichier JSON dans /workspace/ipc/                  │
│ {messages,tasks}/                                           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ WATCHER IPC DE L'HÔTE                                       │
│ Scrute toutes les secondes                                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ TRAITEMENT SELON LE TYPE                                    │
│ • Messages → Router vers le canal pour envoi                │
│ • Tâches → Valider l'autorisation, mettre à jour la BD      │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ SUPPRESSION DU FICHIER                                      │
│ Après traitement réussi                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ GESTION DES ERREURS                                         │
│ Déplacé vers ipc/errors/                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Structure des Dossiers

```
nanoclaw/
├── .github/                    # Actions GitHub et templates
├── .kiro/                      # Configuration Kiro AI
├── .opencode/                  # Skills OpenCode
│   └── skills/                 # Skills disponibles
│       ├── add-voice-transcription/
│       ├── add-telegram/
│       └── ...
├── container/                  # Configuration des conteneurs
│   ├── agent-runner/           # Code exécuté dans les conteneurs
│   │   ├── src/
│   │   │   └── index.ts       # Point d'entrée de l'agent
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── build.sh               # Script de construction
├── data/                       # Données temporaires
│   ├── ipc/                    # Fichiers IPC
│   ├── sessions/              # Données de session par groupe
│   └── env.json               # Copie des variables d'env
├── docs/                       # Documentation
│   └── REQUIREMENTS.md        # Décisions architecturales
├── groups/                     # Dossiers de groupe
│   ├── global/
│   │   └── AGENTS.md          # Mémoire globale
│   ├── main/
│   │   ├── AGENTS.md          # Mémoire du groupe main
│   │   └── conversations/     # Archives de conversations
│   └── {autres-groupes}/      # Dossiers de groupe personnalisés
├── Project-Docs-Ressources-Helps/  # Documentation du projet
├── scripts/                    # Scripts utilitaires
├── src/                        # Code source principal
│   ├── channels/              # Implémentations de canaux
│   │   ├── whatsapp.ts
│   │   └── telegram.ts
│   ├── index.ts               # Point d'entrée
│   ├── config.ts              # Configuration
│   ├── container-runner.ts    # Gestion des conteneurs
│   ├── db.ts                  # Base de données
│   ├── group-queue.ts         # File d'attente
│   ├── ipc.ts                 # Communication IPC
│   ├── mount-security.ts      # Sécurité des montages
│   ├── router.ts              # Routage
│   ├── task-scheduler.ts      # Planification
│   ├── types.ts               # Types TypeScript
│   └── logger.ts              # Journalisation
├── store/                      # Base de données SQLite
│   └── messages.db            # Base de données principale
├── assets/                     # Ressources statiques
├── config-examples/           # Exemples de configuration
├── launchd/                   # Configuration macOS LaunchAgent
├── repo-tokens/               # Tokens pour dépôts privés
├── AGENTS.md                  # Instructions système racine
├── package.json               # Dépendances et scripts
├── tsconfig.json             # Configuration TypeScript
├── .env                       # Variables d'environnement
└── .env.example              # Exemple de variables
```

### Description détaillée des dossiers

| Dossier             | Contenu                 | Accès Agent                 |
| ------------------- | ----------------------- | --------------------------- |
| `src/`              | Code source TypeScript  | Non monté                   |
| `container/`        | Code conteneur et build | Non monté                   |
| `groups/`           | Mémoire par groupe      | Monté en R/W                |
| `store/`            | Base de données SQLite  | Non monté (hôte uniquement) |
| `data/`             | Sessions et IPC         | Monté en R/W                |
| `docs/`             | Documentation           | Non monté                   |
| `scripts/`          | Scripts utilitaires     | Non monté                   |
| `.opencode/skills/` | Skills Claude Code      | Monté en R/O                |

---

## Configuration

### Variables d'Environnement (.env)

| Variable                    | Description                                        | Défaut         |
| --------------------------- | -------------------------------------------------- | -------------- |
| `ASSISTANT_NAME`            | Nom du déclencheur                                 | Andy           |
| `TELEGRAM_BOT_TOKEN`        | Token d'authentification Telegram                  | (aucun)        |
| `TELEGRAM_ONLY`             | Désactiver WhatsApp                                | false          |
| `CONTAINER_TIMEOUT`         | Durée max d'exécution de l'agent                   | 30min          |
| `IDLE_TIMEOUT`              | Garder le conteneur actif après la dernière sortie | 30min          |
| `MAX_CONCURRENT_CONTAINERS` | Agents parallèles                                  | 5              |
| `LOG_LEVEL`                 | Verbosité de la journalisation                     | info           |
| `OPENCODE_BASE_URL`         | Endpoint OpenCode personnalisé                     | localhost:4096 |

### Liste Blanche de Montage

Fichier : `~/.config/nanoclaw/mount-allowlist.json`

```json
{
  "allowedRoots": [
    {
      "path": "/Users/username/Documents",
      "readOnly": false
    },
    {
      "path": "/Users/username/Projects",
      "readOnly": true
    }
  ]
}
```

**Sécurité :**

- Stocké EN DEHORS du répertoire racine du projet (anti-manipulation)
- Supporte les répertoires racines autorisés avec permissions lecture/écriture
- Bloque les modèles sensibles (.ssh, .env, credentials, etc.)
- La résolution des liens symboliques empêche les attaques de traversée

### Motifs Bloqués par Défaut

```javascript
const BLOCKED_PATTERNS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.env',
  '.kube',
  'credentials',
  'id_rsa',
  'private_key',
  'token',
  'secret',
];
```

---

## Système de Groupes

### Types de Groupes

| Type                | Format JID               | Dossier                  | Privilèges                                                               |
| ------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------ |
| **Main**            | Chat personnel           | `main/`                  | Contrôle total : mémoire globale, toutes les tâches, gestion des groupes |
| **Groupe WhatsApp** | `123@g.us`               | Défini par l'utilisateur | Mémoire propre uniquement, tâches propres uniquement                     |
| **DM WhatsApp**     | `123@s.whatsapp.net`     | Défini par l'utilisateur | Identique aux groupes                                                    |
| **Telegram**        | `tg:123` ou `tg:-100123` | Défini par l'utilisateur | Identique aux groupes                                                    |

### Hiérarchie de Mémoire

```
groups/
├── AGENTS.md                    # Mémoire globale
│   # Lu par tous, écrit par main uniquement
│
├── main/
│   └── AGENTS.md               # Mémoire canal principal
│       # Instructions et personnalité pour le chat principal
│
└── {nom-groupe}/
    ├── AGENTS.md               # Mémoire spécifique au groupe
    │   # Contexte et personnalité pour ce groupe
    │
    ├── *.md                    # Fichiers créés par l'agent
    │   # Notes, recherches, données structurées
    │
    └── conversations/          # Archives de conversations
        # Transcriptions automatiques
```

### Gestion des Sessions

- Chaque groupe a un ID de session persistant stocké dans SQLite
- Les sessions sont reprises via l'OpenCode SDK
- Les transcriptions de conversation stockées dans `data/sessions/{groupe}/`
- Archivage périodique vers `groups/{nom}/conversations/`
- Les sessions se compactent automatiquement quand le contexte devient trop long

**Table sessions :**

```sql
CREATE TABLE sessions (
  group_folder TEXT PRIMARY KEY,
  session_id TEXT
);
```

### Modèle de Déclencheur

- **Par défaut :** `@Andy` (insensible à la casse)
- **Doit être au DÉBUT du message**
- **Groupe main :** déclencheur optionnel
- **Autres groupes :** déclencheur requis par défaut

**Exemples :**

```
✓ @Andy quelle est la météo ?
✓ @andy quelle est la météo ?
✓ @ANDY quelle est la météo ?

✗ Bonjour @Andy (pas au début)
✗ Salut Andy (sans @)
```

### Matrice d'Autorisation

| Opération                  | Groupe Main | Autres Groupes     |
| -------------------------- | ----------- | ------------------ |
| Envoyer à son propre chat  | ✓           | ✓                  |
| Envoyer à d'autres chats   | ✓           | ✗                  |
| Programmer pour soi        | ✓           | ✓                  |
| Programmer pour les autres | ✓           | ✗                  |
| Voir toutes les tâches     | ✓           | Propres uniquement |
| Enregistrer des groupes    | ✓           | ✗                  |
| Écrire la mémoire globale  | ✓           | ✗                  |

---

## Sécurité et Isolation

### Points de Montage (Dans le Conteneur)

| Chemin                | Contenu                         | Permissions              |
| --------------------- | ------------------------------- | ------------------------ |
| `/workspace/group`    | Dossier du groupe               | Lecture-Écriture         |
| `/workspace/global`   | Mémoire globale                 | Lecture seule (non-main) |
| `/workspace/project`  | Projet complet                  | Main uniquement          |
| `/workspace/ipc`      | Répertoire IPC                  | Lecture-Écriture         |
| `/workspace/sessions` | Données de session par groupe   | Lecture-Écriture         |
| `/workspace/extra/*`  | Répertoires montés additionnels | Selon config             |
| `/app/src`            | Code source agent               | Lecture seule            |

### Fonctionnalités de Sécurité

1. **Exécution non privilégiée**
   - Fonctionne en tant qu'utilisateur `node` (uid 1000)
   - Pas d'accès root dans le conteneur

2. **Conteneurs éphémères**
   - Flag `--rm` pour suppression automatique
   - Aucune trace après l'exécution

3. **Visibilité limitée**
   - Seuls les répertoires montés explicitement sont visibles
   - Pas d'accès au système de fichiers hôte

4. **Liste blanche de montage**
   - Validation stricte des chemins
   - Bloque les répertoires sensibles

5. **Gestion des secrets**
   - Les secrets ne sont jamais passés via les variables d'environnement aux sous-processus
   - L'OpenCode SDK lit les clés API depuis `~/.opencode/config.yaml`

### Limites de Confiance

1. **Zone non approuvée** : Messages WhatsApp (injection de prompt potentielle)
2. **Hôte de confiance** : Routage des messages, autorisation IPC, validation des montages
3. **Conteneurs en bac à sable** : Exécution de l'agent (isolation du système de fichiers)

---

## Développement et Personnalisation

### Scripts NPM

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

### Commandes de Développement

```bash
# Construire le projet
npm run build

# Mode développement avec rechargement
npm run dev

# Lancer en production
npm start

# Exécuter les tests
npm test

# Vérifier les types
npm run typecheck

# Construire l'image conteneur
./container/build.sh
```

### Gestion des Services (macOS)

```bash
# Charger le service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Décharger le service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Redémarrer le service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Personnalisation via Code

Au lieu de fichiers de configuration complexes, NanoClaw encourage la modification directe du code :

**Exemple :** Ajouter un nouveau canal

```typescript
// src/channels/discord.ts
export class DiscordChannel implements Channel {
  async connect(): Promise<void> {
    /* ... */
  }
  async sendMessage(jid: string, text: string): Promise<void> {
    /* ... */
  }
  ownsJid(jid: string): boolean {
    return jid.startsWith('discord:');
  }
  async disconnect(): Promise<void> {
    /* ... */
  }
}

// src/index.ts
import { DiscordChannel } from './channels/discord';

// Dans initializeChannels():
channels.push(new DiscordChannel(config));
```

### Skills Claude Code

Les skills sont des modules fonctionnels dans `.opencode/skills/` :

```
.opencode/skills/
├── add-voice-transcription/
│   └── SKILL.md              # Documentation du skill
├── add-telegram/
│   └── SKILL.md
└── add-parallel/
    └── SKILL.md
```

Pour utiliser un skill, l'agent lit son fichier SKILL.md et suit les instructions.

---

## Résumé des Fichiers Source

| Fichier                               | Lignes | Purpose                    |
| ------------------------------------- | ------ | -------------------------- |
| `src/index.ts`                        | 552    | Orchestrateur principal    |
| `src/channels/whatsapp.ts`            | 325    | Connexion WhatsApp         |
| `src/channels/telegram.ts`            | 233    | Connexion Telegram         |
| `src/db.ts`                           | 606    | Opérations base de données |
| `src/container-runner.ts`             | 640    | Création de conteneurs     |
| `src/ipc.ts`                          | 380    | Traitement IPC             |
| `src/group-queue.ts`                  | 303    | Contrôle de concurrence    |
| `src/task-scheduler.ts`               | 219    | Tâches planifiées          |
| `src/mount-security.ts`               | 419    | Validation des montages    |
| `src/router.ts`                       | 45     | Formatage des messages     |
| `src/config.ts`                       | 68     | Configuration              |
| `src/types.ts`                        | 99     | Types TypeScript           |
| `src/logger.ts`                       | 17     | Configuration logs         |
| `container/agent-runner/src/index.ts` | 971    | Code agent dans conteneur  |

**Total :** ~30 fichiers source, ~4 500 lignes de code

---

## Ressources Complémentaires

- **README.md** - Vue d'ensemble du projet
- **README_zh.md** - Documentation en chinois
- **docs/REQUIREMENTS.md** - Décisions architecturales détaillées
- **comparison-openclaw-vs-nanoclaw.md** - Comparaison avec OpenClaw
- **opencode-sdk.md** - Documentation OpenCode SDK

---

## Conclusion

NanoClaw est un assistant IA personnel qui privilégie :

1. **La simplicité** - Code minimal, compréhensible
2. **La sécurité** - Isolation par conteneurs OS
3. **La personnalisation** - Modification par code, pas par configuration
4. **L'IA-native** - Conçu pour être utilisé avec Claude Code

Avec environ 30 fichiers source et une architecture claire, il offre les fonctionnalités essentielles d'OpenClaw sans sa complexité, tout en maintenant des garanties de sécurité solides par l'isolation des conteneurs.

---

_Document généré le 17 février 2026_


---

## Sécurité et Isolation

### Points de Montage (Dans le Conteneur)

| Chemin                | Contenu                         | Permissions              |
| --------------------- | ------------------------------- | ------------------------ |
| `/workspace/group`    | Dossier du groupe               | Lecture-Écriture         |
| `/workspace/global`   | Mémoire globale                 | Lecture seule (non-main) |
| `/workspace/project`  | Projet complet                  | Main uniquement          |
| `/workspace/ipc`      | Répertoire IPC                  | Lecture-Écriture         |
| `/workspace/sessions` | Données de session par groupe   | Lecture-Écriture         |
| `/workspace/extra/*`  | Répertoires additionnels        | Selon liste blanche      |

### Système de Validation des Montages

**Fichier :** `src/mount-security.ts`

**Principe :** Liste blanche externe pour empêcher les agents de modifier leur propre configuration de sécurité.

**Processus de validation :**

```typescript
1. Charger la liste blanche depuis ~/.config/nanoclaw/mount-allowlist.json
2. Pour chaque montage additionnel demandé :
   a. Résoudre les liens symboliques (empêche les attaques de traversée)
   b. Vérifier contre les motifs bloqués (.ssh, .env, etc.)
   c. Vérifier si sous une racine autorisée
   d. Appliquer les permissions (lecture seule vs lecture-écriture)
3. Rejeter les montages non conformes (journalisés)
4. Retourner uniquement les montages validés
```

**Exemple de configuration :**

```json
{
  "allowedRoots": [
    {
      "path": "~/projects",
      "allowReadWrite": true,
      "description": "Projets de développement"
    },
    {
      "path": "~/Documents/work",
      "allowReadWrite": false,
      "description": "Documents de travail (lecture seule)"
    }
  ],
  "blockedPatterns": [
    "password",
    "secret",
    "token"
  ],
  "nonMainReadOnly": true
}
```

### Mode Direct (Windows/Linux)

**Fichier :** `src/direct-runner.ts`

Pour les systèmes sans support de conteneurs (Windows, Linux sans Docker), NanoClaw peut fonctionner en mode direct :

- Exécute l'agent directement avec Node.js (pas de conteneur)
- Moins sécurisé mais fonctionnel
- Utilise les mêmes chemins IPC et de groupe
- Détecté automatiquement si Apple Container/Docker non disponible

**Avertissement :** Le mode direct n'offre PAS d'isolation. L'agent a accès complet au système hôte.

### Modèle de Sécurité

**Principe de base :** Isolation au niveau OS, pas au niveau application

| Aspect                | Approche NanoClaw                                  | Approche OpenClaw                      |
| --------------------- | -------------------------------------------------- | -------------------------------------- |
| **Isolation**         | Conteneurs Linux réels                             | Listes blanches applicatives           |
| **Accès fichiers**    | Montages explicites uniquement                     | Vérifications de chemin dans le code   |
| **Accès réseau**      | Contrôlé par le conteneur                          | Pas de restriction                     |
| **Accès processus**   | Namespace isolé                                    | Processus partagé                      |
| **Escalade**          | Impossible (conteneur non-root)                    | Possible via bugs de validation        |
| **Configuration sécu** | Externe (~/.config/)                               | Dans le projet (modifiable par agent)  |

---

## Développement et Personnalisation

### Commandes de Développement

```bash
# Installation des dépendances
npm install

# Démarrage en mode développement
npm run dev

# Construction du conteneur agent
./container/build.sh

# Vérification du cache de construction
container run -i --rm --entrypoint wc nanoclaw-agent:latest -l /app/src/index.ts

# Nettoyage du cache de construction (macOS)
container builder stop && container builder rm && container builder start
```

### Gestion du Service (macOS)

```bash
# Charger le service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Décharger le service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Redémarrer le service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Voir les logs
tail -f ~/Library/Logs/nanoclaw.log
```

### Structure du Fichier LaunchAgent

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nanoclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/nanoclaw/dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/username/Library/Logs/nanoclaw.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/username/Library/Logs/nanoclaw.log</string>
</dict>
</plist>
```

### Personnalisation de l'Agent

#### 1. Modifier la Personnalité

Éditer `groups/main/AGENTS.md` ou `groups/global/AGENTS.md` :

```markdown
# Andy - Assistant Personnel

Je suis Andy, votre assistant IA personnel. Je suis :

- Proactif et débrouillard
- Capable de rechercher et d'apprendre
- Toujours prêt à aider
- Respectueux de votre vie privée

## Capacités

- Recherche web et récupération de contenu
- Navigation web automatisée
- Gestion de fichiers et de données
- Exécution de commandes shell
- Programmation de tâches récurrentes
```

#### 2. Ajouter des Skills

Les skills sont dans `.opencode/skills/`. Pour ajouter un nouveau skill :

```bash
# Créer le dossier du skill
mkdir -p .opencode/skills/mon-skill

# Créer le fichier SKILL.md
cat > .opencode/skills/mon-skill/SKILL.md << 'EOF'
# Mon Skill

Description de ce que fait le skill.

## Utilisation

Instructions pour utiliser le skill.
EOF
```

#### 3. Configurer des Groupes Personnalisés

Via IPC depuis le groupe main :

```json
{
  "type": "register_group",
  "jid": "123456789@g.us",
  "name": "Équipe Dev",
  "folder": "equipe-dev",
  "trigger_pattern": "@Andy",
  "requires_trigger": true,
  "container_config": {
    "additional_mounts": [
      {
        "hostPath": "~/projects/mon-projet",
        "containerPath": "mon-projet",
        "readonly": false
      }
    ]
  }
}
```

#### 4. Programmer des Tâches

Via IPC :

```json
{
  "type": "schedule_task",
  "prompt": "Vérifier les nouvelles issues GitHub et me faire un résumé",
  "schedule_type": "cron",
  "schedule_value": "0 9 * * *",
  "context_mode": "group"
}
```

Types de planification :

- `cron` : Expression cron (ex: `0 9 * * *` = tous les jours à 9h)
- `interval` : Millisecondes (ex: `3600000` = toutes les heures)
- `once` : ISO timestamp (ex: `2026-02-20T14:30:00Z`)

### Débogage

#### Logs de l'Hôte

```bash
# Logs en temps réel
npm run dev

# Logs du service (macOS)
tail -f ~/Library/Logs/nanoclaw.log

# Logs avec niveau debug
LOG_LEVEL=debug npm run dev
```

#### Logs des Conteneurs

Les logs des agents sont dans `groups/{nom}/logs/` :

```bash
# Voir le dernier log
ls -lt groups/main/logs/ | head -n 2

# Lire un log spécifique
cat groups/main/logs/container-2026-02-17T08-27-19-474Z.log
```

#### Logs IPC

Les erreurs IPC sont dans `data/ipc/{groupe}/errors/` :

```bash
# Voir les erreurs IPC
ls -la data/ipc/main/errors/

# Lire une erreur
cat data/ipc/main/errors/failed-message-123.json
```

#### Base de Données

```bash
# Inspecter la base de données
node check-db.cjs

# Ou avec SQLite directement
sqlite3 store/messages.db

# Requêtes utiles
SELECT * FROM registered_groups;
SELECT * FROM scheduled_tasks WHERE status = 'active';
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;
```

### Problèmes Courants

#### 1. Le conteneur ne démarre pas

```bash
# Vérifier qu'Apple Container est en cours d'exécution
container ps

# Si non, le démarrer
container builder start

# Reconstruire l'image
./container/build.sh
```

#### 2. WhatsApp se déconnecte

- Vérifier que le téléphone est connecté à Internet
- Scanner à nouveau le QR code
- Vérifier les logs pour les erreurs de connexion

#### 3. Les messages ne sont pas traités

- Vérifier que le groupe est enregistré : `SELECT * FROM registered_groups;`
- Vérifier le déclencheur dans le message
- Vérifier les logs pour les erreurs de routage

#### 4. Les tâches planifiées ne s'exécutent pas

- Vérifier le statut : `SELECT * FROM scheduled_tasks;`
- Vérifier `next_run` est dans le passé
- Vérifier que le planificateur tourne (logs)

#### 5. Montages additionnels rejetés

- Vérifier la liste blanche : `~/.config/nanoclaw/mount-allowlist.json`
- Vérifier les logs pour la raison du rejet
- Vérifier que le chemin existe et est accessible

---

## Architecture Multi-Fichiers (Nouvelle)

### Contexte

Inspiré par OpenClaw, NanoClaw a adopté une architecture multi-fichiers pour séparer les préoccupations :

| Fichier        | Contenu                                      | Modifiable par Agent |
| -------------- | -------------------------------------------- | -------------------- |
| `SOUL.md`      | Personnalité, valeurs, philosophie           | ✓                    |
| `IDENTITY.md`  | Style de communication, présentation         | ✓                    |
| `TOOLS.md`     | Catalogue complet des outils et skills       | ✓                    |
| `AGENTS.md`    | Instructions techniques uniquement           | ✓                    |

### Hiérarchie de Chargement

```
1. groups/global/SOUL.md          # Valeurs fondamentales
2. groups/global/IDENTITY.md      # Style de base
3. groups/global/TOOLS.md         # Outils disponibles
4. groups/global/AGENTS.md        # Instructions globales

5. groups/{groupe}/SOUL.md        # Personnalité du groupe
6. groups/{groupe}/IDENTITY.md    # Style du groupe
7. groups/{groupe}/TOOLS.md       # Outils spécifiques
8. groups/{groupe}/AGENTS.md      # Instructions du groupe
```

### Avantages de cette Architecture

1. **Séparation des préoccupations** : Chaque fichier a un rôle clair
2. **Découvrabilité** : TOOLS.md documente explicitement toutes les capacités
3. **Proactivité** : SOUL.md encourage l'initiative et la débrouillardise
4. **Maintenabilité** : Plus facile de modifier un aspect sans toucher aux autres
5. **Évolutivité** : L'agent peut modifier ses propres fichiers de contexte

### Différence avec OpenClaw

| Aspect                | NanoClaw                                | OpenClaw                          |
| --------------------- | --------------------------------------- | --------------------------------- |
| **Stockage**          | Fichiers .md dans groups/               | Fichiers .md dans docs/templates/ |
| **Injection**         | Lecture directe au démarrage            | Injection dynamique runtime       |
| **Frontmatter YAML**  | Non (pour l'instant)                    | Oui (métadonnées)                 |
| **Fichiers .dev.md**  | Non                                     | Oui (templates)                   |
| **USER.md**           | Non                                     | Oui                               |
| **HEARTBEAT.md**      | Non                                     | Oui                               |
| **Base de données**   | SQLite (messages, tâches, sessions)     | Complexe (multiples stores)       |
| **Nom dynamique**     | Variable d'env ASSISTANT_NAME           | Injection runtime                 |

---

## Comparaison Détaillée : NanoClaw vs OpenClaw

### Architecture

| Aspect              | NanoClaw                          | OpenClaw                                |
| ------------------- | --------------------------------- | --------------------------------------- |
| **Processus**       | 1 processus Node.js               | 4-5 processus (gateway, worker, etc.)   |
| **Fichiers source** | ~30 fichiers                      | 52+ modules                             |
| **Complexité**      | Simple, compréhensible            | Complexe, abstractions multiples        |
| **Dépendances**     | Minimales                         | Nombreuses                              |

### Sécurité

| Aspect              | NanoClaw                          | OpenClaw                                |
| ------------------- | --------------------------------- | --------------------------------------- |
| **Isolation**       | Conteneurs OS réels               | Listes blanches applicatives            |
| **Montages**        | Liste blanche externe             | Configuration dans le projet            |
| **Réseau**          | Contrôlé par conteneur            | Pas de restriction                      |
| **Escalade**        | Impossible (conteneur non-root)   | Possible via bugs                       |

### Fonctionnalités

| Fonctionnalité          | NanoClaw | OpenClaw |
| ----------------------- | -------- | -------- |
| **WhatsApp**            | ✓        | ✓        |
| **Telegram**            | ✓        | ✓        |
| **Tâches planifiées**   | ✓        | ✓        |
| **Groupes multiples**   | ✓        | ✓        |
| **Sessions persistantes** | ✓      | ✓        |
| **Skills**              | ✓        | ✓        |
| **Navigation web**      | ✓        | ✓        |
| **Transcription vocale** | Via skill | Intégré |
| **Multi-utilisateurs**  | ✗        | ✓        |
| **Dashboard web**       | ✗        | ✓        |

### Philosophie

| Aspect              | NanoClaw                          | OpenClaw                                |
| ------------------- | --------------------------------- | --------------------------------------- |
| **Cible**           | Un seul utilisateur               | Multi-utilisateurs                      |
| **Approche**        | Fork et personnalise              | Framework à configurer                  |
| **Complexité**      | Assez petit pour comprendre       | Système complet avec abstractions       |
| **Maintenance**     | Demande à Claude Code             | Documentation et outils                 |

---

## Prochaines Étapes et Améliorations Possibles

### Améliorations Identifiées

1. **Injection Dynamique du Nom**
   - Remplacer `{{ASSISTANT_NAME}}` à la lecture des fichiers .md
   - Permet de changer le nom sans modifier 142 occurrences
   - Garder les fichiers .md éditables par l'agent

2. **Frontmatter YAML**
   - Ajouter des métadonnées aux fichiers de contexte
   - Version, date de modification, auteur
   - Permet un meilleur suivi des changements

3. **Fichiers Additionnels**
   - `USER.md` : Préférences et informations utilisateur
   - `HEARTBEAT.md` : État du système et santé
   - `BOOT.md` : Instructions de démarrage

4. **Système de Templates**
   - Fichiers `.dev.md` comme templates (commités)
   - Fichiers `.md` comme instances (gitignorés)
   - Copie automatique au premier démarrage

5. **Amélioration de la Découvrabilité**
   - Documentation automatique des skills disponibles
   - Catalogue des outils MCP
   - Suggestions proactives basées sur le contexte

### Roadmap Potentielle

#### Court Terme (1-2 semaines)

- [ ] Implémenter l'injection dynamique du nom
- [ ] Ajouter le frontmatter YAML aux fichiers de contexte
- [ ] Créer USER.md et HEARTBEAT.md
- [ ] Documenter tous les skills existants dans TOOLS.md

#### Moyen Terme (1-2 mois)

- [ ] Système de templates .dev.md / .md
- [ ] Interface web simple pour la gestion des tâches
- [ ] Amélioration de la transcription vocale
- [ ] Support de plus de plateformes (Discord, Slack)

#### Long Terme (3-6 mois)

- [ ] Mode multi-utilisateurs optionnel
- [ ] Dashboard de monitoring
- [ ] Système de plugins pour les skills
- [ ] Support de modèles IA alternatifs

---

## Glossaire

| Terme                | Définition                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| **Agent**            | Instance de l'IA (OpenCode SDK) qui traite les messages                   |
| **Conteneur**        | Environnement isolé où l'agent s'exécute                                   |
| **Groupe**           | Chat WhatsApp/Telegram avec sa propre mémoire et configuration             |
| **IPC**              | Inter-Process Communication - communication agent ↔ hôte via fichiers      |
| **JID**              | Jabber ID - identifiant unique d'un chat (format WhatsApp/Telegram)        |
| **Main**             | Groupe principal avec privilèges complets                                  |
| **Montage**          | Répertoire hôte accessible dans le conteneur                               |
| **Session**          | Conversation persistante avec historique                                   |
| **Skill**            | Module de fonctionnalité documenté dans .opencode/skills/                  |
| **Déclencheur**      | Mot-clé (@Andy) qui active l'agent dans un groupe                          |
| **Apple Container**  | Système de conteneurs natif macOS                                          |
| **OpenCode SDK**     | SDK pour interagir avec Claude Code                                        |
| **Baileys**          | Bibliothèque WhatsApp Web pour Node.js                                     |
| **Grammy**           | Framework Telegram Bot pour Node.js                                        |

---

## Ressources et Références

### Documentation Externe

- [OpenCode SDK](https://github.com/opencode-ai/sdk)
- [Baileys (WhatsApp)](https://github.com/WhiskeySockets/Baileys)
- [Grammy (Telegram)](https://grammy.dev/)
- [Apple Container](https://developer.apple.com/documentation/containerization)
- [Better SQLite3](https://github.com/WiseLibs/better-sqlite3)

### Fichiers Importants du Projet

- `docs/REQUIREMENTS.md` : Décisions architecturales et justifications
- `docs/SPEC.md` : Spécifications techniques détaillées
- `docs/SECURITY.md` : Modèle de sécurité et bonnes pratiques
- `CONTRIBUTING.md` : Guide de contribution
- `README.md` : Vue d'ensemble et installation

### Comparaisons et Analyses

- `Project-Docs-Ressources-Helps/comparison-openclaw-vs-nanoclaw.md`
- `Project-Docs-Ressources-Helps/new-architecture-guide.md`
- `Project-Docs-Ressources-Helps/SUMMARY-nouvelle-architecture.md`

---

## Conclusion

NanoClaw est un assistant IA personnel conçu pour être :

1. **Simple** : Un seul processus, ~30 fichiers, architecture compréhensible
2. **Sécurisé** : Isolation par conteneurs OS, pas de vérifications applicatives
3. **Personnel** : Conçu pour un seul utilisateur, fork et personnalise
4. **Pratique** : Fonctionne avec WhatsApp et Telegram, tâches planifiées, skills

L'architecture multi-fichiers inspirée d'OpenClaw (SOUL.md, IDENTITY.md, TOOLS.md, AGENTS.md) améliore la découvrabilité et la proactivité de l'agent tout en gardant la simplicité fondamentale de NanoClaw.

Le système est suffisamment petit pour être compris en entier, mais suffisamment puissant pour être utile au quotidien. C'est exactement ce que NanoClaw vise à être : un assistant IA personnel que vous pouvez réellement comprendre et contrôler.

---

**Fin de la documentation**

*Cette documentation a été générée le 17 février 2026 par Andy, l'assistant NanoClaw, en analysant l'ensemble du codebase et en documentant chaque composant, flux de données, et décision architecturale.*
