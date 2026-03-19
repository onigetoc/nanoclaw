# Document d'Exigences — Renommage `groups/` → `workspaces/`

## Introduction

Refactoring massif du projet EureClaw pour renommer le concept de "group" en "workspace" à travers toute la codebase. Le dossier racine `groups/` devient `workspaces/`, et toutes les références dans le code TypeScript, la base de données SQLite, la configuration, la documentation, les templates, les skills, les prompts, les agents, les fichiers steering et la Web UI sont mises à jour en conséquence.

**Attention critique** : chaque workspace contient un sous-dossier `workspace/` (singulier) pour le contenu généré par l'agent. Ce sous-dossier interne ne doit PAS être renommé. Seul le dossier racine `groups/` (pluriel) → `workspaces/` (pluriel) et le concept "group" → "workspace" dans le code sont concernés.

## Glossaire

- **Workspace** : Contexte isolé d'un agent EureClaw (anciennement "group"). Contient les fichiers DNA, le contenu généré, les uploads, les logs et les conversations.
- **Workspace_Directory** : Le dossier racine `workspaces/` contenant tous les workspaces individuels (anciennement `groups/`).
- **Inner_Workspace_Folder** : Le sous-dossier `workspace/` à l'intérieur de chaque workspace, utilisé pour le contenu généré par l'agent. Ce dossier n'est PAS affecté par ce renommage.
- **Refactoring_Engine** : L'ensemble des modifications de code, fichiers et configuration nécessaires au renommage.
- **Config_Module** : Le module `src/config.ts` qui exporte les constantes de chemin.
- **Database_Module** : Le module `src/db.ts` qui gère les opérations SQLite.
- **Container_Runner** : Le module `src/container-runner.ts` qui lance les containers d'agent.
- **Group_Manager** : Le module `src/group-manager.ts` (renommé en Workspace_Manager).
- **State_Module** : Le module `src/state.ts` qui gère l'état global.
- **IPC_Module** : Le module `src/ipc.ts` qui gère la communication inter-processus.
- **Router_Module** : Le module `src/router.ts` qui gère le routage des messages.
- **Task_Scheduler** : Le module `src/task-scheduler.ts` qui exécute les tâches planifiées.
- **Web_UI** : L'interface web dans `web-ui/`.
- **Agent_Runner** : Le code dans `container/agent-runner/src/` qui s'exécute à l'intérieur des containers.
- **DNA_Files** : Les fichiers de personnalité (AGENTS.md, IDENTITY.md, etc.) dans le sous-dossier `dna/` de chaque workspace.
- **Template_Files** : Les fichiers modèles dans `workspaces/templates/` (anciennement `groups/templates/`).

## Exigences

### Exigence 1 : Renommage du dossier physique

**User Story :** En tant que développeur, je veux que le dossier `groups/` soit renommé en `workspaces/`, afin que la structure du projet reflète la nouvelle terminologie.

#### Critères d'acceptation

1. WHEN le Refactoring_Engine est appliqué, THE Workspace_Directory SHALL être localisé à `workspaces/` à la racine du projet
2. WHEN le Refactoring_Engine est appliqué, THE Workspace_Directory SHALL contenir les mêmes sous-dossiers que l'ancien `groups/` (global, main, work, templates)
3. THE Inner_Workspace_Folder SHALL conserver son nom `workspace/` (singulier) à l'intérieur de chaque workspace
4. WHEN le Refactoring_Engine est appliqué, THE Refactoring_Engine SHALL mettre à jour le fichier `.gitignore` pour référencer `workspaces/` au lieu de `groups/`

### Exigence 2 : Mise à jour du module de configuration

**User Story :** En tant que développeur, je veux que les constantes de configuration reflètent le nouveau nom, afin que tous les chemins soient cohérents.

#### Critères d'acceptation

1. THE Config_Module SHALL exporter une constante `WORKSPACES_DIR` au lieu de `GROUPS_DIR`
2. THE Config_Module SHALL résoudre `WORKSPACES_DIR` vers `path.resolve(PROJECT_ROOT, 'workspaces')`
3. THE Config_Module SHALL exporter `MAIN_WORKSPACE_FOLDER` au lieu de `MAIN_GROUP_FOLDER`
4. WHEN un module importe `GROUPS_DIR` ou `MAIN_GROUP_FOLDER`, THE Refactoring_Engine SHALL remplacer ces imports par `WORKSPACES_DIR` et `MAIN_WORKSPACE_FOLDER`

### Exigence 3 : Mise à jour des types TypeScript

**User Story :** En tant que développeur, je veux que les interfaces et types reflètent la nouvelle terminologie, afin que le code soit cohérent.

#### Critères d'acceptation

1. THE State_Module SHALL renommer l'interface `RegisteredGroup` en `RegisteredWorkspace` dans `src/types.ts`
2. THE State_Module SHALL renommer le champ `group_folder` en `workspace_folder` dans l'interface `ScheduledTask`
3. THE State_Module SHALL renommer le champ `context_mode: 'group'` en `context_mode: 'workspace'` dans l'interface `ScheduledTask`
4. THE State_Module SHALL renommer `requiresTrigger` commentaire de "groups" à "workspaces"
5. WHEN un type ou interface contient le mot "group" dans son nom ou ses champs, THE Refactoring_Engine SHALL le renommer en "workspace" de manière cohérente

### Exigence 4 : Mise à jour de la base de données SQLite

**User Story :** En tant que développeur, je veux que les tables et colonnes de la base de données reflètent la nouvelle terminologie, afin que le schéma soit cohérent.

#### Critères d'acceptation

1. THE Database_Module SHALL renommer la table `registered_groups` en `registered_workspaces`
2. THE Database_Module SHALL renommer la colonne `group_folder` en `workspace_folder` dans la table `scheduled_tasks`
3. THE Database_Module SHALL renommer la colonne `group_folder` en `workspace_folder` dans la table `sessions`
4. THE Database_Module SHALL fournir une migration automatique qui renomme les tables et colonnes existantes sans perte de données
5. THE Database_Module SHALL renommer les fonctions `getRegisteredGroup`, `setRegisteredGroup`, `getAllRegisteredGroups`, `hasGroupWithFolder` en équivalents "workspace"
6. THE Database_Module SHALL renommer les fonctions `getTasksForGroup` en `getTasksForWorkspace`
7. IF la migration échoue, THEN THE Database_Module SHALL logger l'erreur et conserver les données existantes intactes

### Exigence 5 : Mise à jour du Group Manager → Workspace Manager

**User Story :** En tant que développeur, je veux que le module de gestion des groupes soit renommé et refactoré, afin que la terminologie soit cohérente.

#### Critères d'acceptation

1. THE Refactoring_Engine SHALL renommer le fichier `src/group-manager.ts` en `src/workspace-manager.ts`
2. THE Workspace_Manager SHALL renommer la fonction `registerGroup` en `registerWorkspace`
3. THE Workspace_Manager SHALL renommer la fonction `copyTemplatesToGroup` en `copyTemplatesToWorkspace`
4. THE Workspace_Manager SHALL renommer la fonction `getAvailableGroups` en `getAvailableWorkspaces`
5. THE Workspace_Manager SHALL mettre à jour les chemins internes pour utiliser `WORKSPACES_DIR` au lieu de `GROUPS_DIR`
6. WHEN un module importe depuis `group-manager.ts`, THE Refactoring_Engine SHALL mettre à jour l'import vers `workspace-manager.ts`

### Exigence 6 : Mise à jour du Group Queue → Workspace Queue

**User Story :** En tant que développeur, je veux que la file d'attente par groupe soit renommée, afin que la terminologie soit cohérente.

#### Critères d'acceptation

1. THE Refactoring_Engine SHALL renommer le fichier `src/group-queue.ts` en `src/workspace-queue.ts`
2. THE Refactoring_Engine SHALL renommer la classe `GroupQueue` en `WorkspaceQueue`
3. THE Refactoring_Engine SHALL renommer le fichier de test `src/group-queue.test.ts` en `src/workspace-queue.test.ts`
4. WHEN un module importe `GroupQueue`, THE Refactoring_Engine SHALL mettre à jour l'import vers `WorkspaceQueue`

### Exigence 7 : Mise à jour du State Module

**User Story :** En tant que développeur, je veux que le module d'état utilise la terminologie "workspace", afin que l'API interne soit cohérente.

#### Critères d'acceptation

1. THE State_Module SHALL renommer la variable `registeredGroups` en `registeredWorkspaces`
2. THE State_Module SHALL renommer la fonction `getRegisteredGroups` en `getRegisteredWorkspaces`
3. THE State_Module SHALL renommer la fonction `reloadRegisteredGroups` en `reloadRegisteredWorkspaces`
4. THE State_Module SHALL renommer la fonction `_setRegisteredGroups` en `_setRegisteredWorkspaces`
5. THE State_Module SHALL renommer `setGroupSession` en `setWorkspaceSession`

### Exigence 8 : Mise à jour du Container Runner

**User Story :** En tant que développeur, je veux que le Container Runner utilise la terminologie "workspace", afin que les montages et variables soient cohérents.

#### Critères d'acceptation

1. THE Container_Runner SHALL utiliser `WORKSPACES_DIR` au lieu de `GROUPS_DIR` pour les chemins de montage
2. THE Container_Runner SHALL renommer l'interface `AvailableGroup` en `AvailableWorkspace`
3. THE Container_Runner SHALL renommer la fonction `writeGroupsSnapshot` en `writeWorkspacesSnapshot`
4. THE Container_Runner SHALL renommer les variables locales contenant "group" en "workspace" dans les fonctions de montage
5. THE Container_Runner SHALL conserver les chemins de montage container (`/workspace/group`, `/workspace/global`) inchangés pour éviter de casser l'Agent_Runner

### Exigence 9 : Mise à jour du module IPC

**User Story :** En tant que développeur, je veux que le module IPC utilise la terminologie "workspace", afin que les interfaces et fonctions soient cohérentes.

#### Critères d'acceptation

1. THE IPC_Module SHALL renommer les champs `registeredGroups` en `registeredWorkspaces` dans l'interface `IpcDeps`
2. THE IPC_Module SHALL renommer `getAvailableGroups` en `getAvailableWorkspaces` dans l'interface `IpcDeps`
3. THE IPC_Module SHALL renommer `writeGroupsSnapshot` en `writeWorkspacesSnapshot` dans l'interface `IpcDeps`
4. THE IPC_Module SHALL renommer `syncGroupMetadata` en `syncWorkspaceMetadata` dans l'interface `IpcDeps`
5. THE IPC_Module SHALL renommer le type IPC `register_group` en `register_workspace`
6. THE IPC_Module SHALL renommer le type IPC `refresh_groups` en `refresh_workspaces`
7. THE IPC_Module SHALL renommer les variables locales `sourceGroup` en `sourceWorkspace`

### Exigence 10 : Mise à jour du Task Scheduler

**User Story :** En tant que développeur, je veux que le planificateur de tâches utilise la terminologie "workspace", afin que les références soient cohérentes.

#### Critères d'acceptation

1. THE Task_Scheduler SHALL utiliser `WORKSPACES_DIR` au lieu de `GROUPS_DIR`
2. THE Task_Scheduler SHALL utiliser `MAIN_WORKSPACE_FOLDER` au lieu de `MAIN_GROUP_FOLDER`
3. THE Task_Scheduler SHALL renommer les champs `registeredGroups` en `registeredWorkspaces` dans l'interface `SchedulerDependencies`
4. THE Task_Scheduler SHALL renommer `GroupQueue` en `WorkspaceQueue` dans les imports et types

### Exigence 11 : Mise à jour des Channels (Telegram, WhatsApp)

**User Story :** En tant que développeur, je veux que les channels de messagerie utilisent la terminologie "workspace", afin que les interfaces soient cohérentes.

#### Critères d'acceptation

1. WHEN le channel WhatsApp référence `registeredGroups`, THE Refactoring_Engine SHALL le renommer en `registeredWorkspaces`
2. WHEN le channel WhatsApp référence `syncGroupMetadata`, THE Refactoring_Engine SHALL le renommer en `syncWorkspaceMetadata`
3. THE Refactoring_Engine SHALL renommer `GROUP_SYNC_INTERVAL_MS` en `WORKSPACE_SYNC_INTERVAL_MS` dans le channel WhatsApp
4. THE Refactoring_Engine SHALL mettre à jour les commentaires et logs contenant "group" en "workspace" dans les channels
5. THE Refactoring_Engine SHALL mettre à jour les tests des channels pour refléter la nouvelle terminologie

### Exigence 12 : Mise à jour de l'Agent Runner (container)

**User Story :** En tant que développeur, je veux que le code de l'agent runner dans le container utilise la terminologie "workspace", afin que les références internes soient cohérentes.

#### Critères d'acceptation

1. THE Agent_Runner SHALL renommer le champ `groupFolder` en `workspaceFolder` dans l'interface `ContainerInput`
2. THE Agent_Runner SHALL renommer le champ `groupDir` en `workspaceDir` dans les options `directMode`
3. THE Agent_Runner SHALL renommer les variables locales `groupDir` en `workspaceDir`
4. THE Agent_Runner SHALL mettre à jour les commentaires et logs contenant "group" en "workspace"
5. THE Agent_Runner SHALL mettre à jour les hints de chemin pour référencer `workspaces/` au lieu de `groups/`

### Exigence 13 : Mise à jour de la Web UI

**User Story :** En tant que développeur, je veux que l'interface web utilise la terminologie "workspace", afin que l'affichage soit cohérent.

#### Critères d'acceptation

1. THE Web_UI SHALL afficher "Workspaces" au lieu de "Groups" dans la sidebar (`ChatSidebar.tsx`)
2. THE Web_UI SHALL renommer `groupInfo` en `workspaceInfo` dans les types et composants
3. THE Web_UI SHALL renommer `registeredGroups` en `registeredWorkspaces` dans l'overview des settings
4. THE Web_UI SHALL mettre à jour `FilesSection.tsx` pour utiliser "workspace" au lieu de "group" dans les noms de variables et interfaces
5. THE Web_UI SHALL mettre à jour les labels et textes affichés pour utiliser "workspace" au lieu de "group"

### Exigence 14 : Mise à jour de la documentation

**User Story :** En tant que développeur, je veux que toute la documentation reflète la nouvelle terminologie, afin que les références soient cohérentes.

#### Critères d'acceptation

1. THE Refactoring_Engine SHALL mettre à jour `README.md` pour référencer `workspaces/` au lieu de `groups/`
2. THE Refactoring_Engine SHALL mettre à jour `AGENTS.md` pour référencer `workspaces/` au lieu de `groups/`
3. THE Refactoring_Engine SHALL mettre à jour `.kiro/structure.md` pour référencer `workspaces/` au lieu de `groups/`
4. THE Refactoring_Engine SHALL mettre à jour `groups/global/dna/DOCUMENTATION.md` (déplacé vers `workspaces/global/dna/DOCUMENTATION.md`)
5. THE Refactoring_Engine SHALL mettre à jour tous les fichiers `.md` dans les dossiers `.opencode/`, `.kiro/steering/`, et `docs/`
6. WHEN un fichier de documentation référence `groups/{name}/`, THE Refactoring_Engine SHALL le remplacer par `workspaces/{name}/`

### Exigence 15 : Mise à jour des templates DNA

**User Story :** En tant que développeur, je veux que les templates DNA soient déplacés et mis à jour, afin que les nouveaux workspaces soient créés avec la bonne terminologie.

#### Critères d'acceptation

1. THE Template_Files SHALL être localisés dans `workspaces/templates/` au lieu de `groups/templates/`
2. WHEN un template contient le mot "group", THE Refactoring_Engine SHALL le remplacer par "workspace"
3. THE Workspace_Manager SHALL chercher les templates dans `workspaces/templates/` au lieu de `groups/templates/`

### Exigence 16 : Mise à jour des Skills, Prompts et Agents

**User Story :** En tant que développeur, je veux que les fichiers de configuration des skills, prompts et agents reflètent la nouvelle terminologie.

#### Critères d'acceptation

1. WHEN un fichier dans `.opencode/skills/` référence "group" ou `groups/`, THE Refactoring_Engine SHALL le mettre à jour vers "workspace" ou `workspaces/`
2. WHEN un fichier dans `.opencode/prompts/` référence "group" ou `groups/`, THE Refactoring_Engine SHALL le mettre à jour vers "workspace" ou `workspaces/`
3. WHEN un fichier dans `.opencode/agents/` référence "group" ou `groups/`, THE Refactoring_Engine SHALL le mettre à jour vers "workspace" ou `workspaces/`

### Exigence 17 : Mise à jour des fichiers Steering

**User Story :** En tant que développeur, je veux que les fichiers steering de Kiro reflètent la nouvelle terminologie.

#### Critères d'acceptation

1. WHEN un fichier dans `.kiro/steering/` référence "group" ou `groups/`, THE Refactoring_Engine SHALL le mettre à jour vers "workspace" ou `workspaces/`
2. THE Refactoring_Engine SHALL mettre à jour le fichier `rules.md` (workspace-level) pour référencer `workspaces/` au lieu de `groups/`

### Exigence 18 : Mise à jour de l'API Server et routes

**User Story :** En tant que développeur, je veux que les routes API et le serveur utilisent la terminologie "workspace".

#### Critères d'acceptation

1. WHEN le fichier `src/api-server.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
2. WHEN le fichier `src/api-markdown-routes.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
3. WHEN les routes API exposent des champs JSON contenant "group", THE Refactoring_Engine SHALL les renommer en "workspace"
4. THE Refactoring_Engine SHALL maintenir la rétrocompatibilité des endpoints API existants ou documenter les changements breaking

### Exigence 19 : Mise à jour des modules auxiliaires

**User Story :** En tant que développeur, je veux que tous les modules auxiliaires (auto-registration, message-loop, message-processor, startup, etc.) utilisent la terminologie "workspace".

#### Critères d'acceptation

1. WHEN le fichier `src/auto-registration.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
2. WHEN le fichier `src/message-loop.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
3. WHEN le fichier `src/message-processor.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
4. WHEN le fichier `src/startup.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
5. WHEN le fichier `src/agent-executor.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"
6. WHEN le fichier `src/direct-runner.ts` référence "group", THE Refactoring_Engine SHALL le renommer en "workspace"

### Exigence 20 : Mise à jour des tests

**User Story :** En tant que développeur, je veux que tous les tests soient mis à jour et passent après le renommage, afin de garantir la non-régression.

#### Critères d'acceptation

1. THE Refactoring_Engine SHALL mettre à jour tous les fichiers `*.test.ts` pour utiliser la nouvelle terminologie
2. WHEN les tests sont exécutés après le refactoring, THE Refactoring_Engine SHALL garantir que tous les tests passent
3. THE Refactoring_Engine SHALL mettre à jour les mocks et fixtures qui référencent "group"

### Exigence 21 : Préservation de la distinction singulier/pluriel

**User Story :** En tant que développeur, je veux que le sous-dossier `workspace/` (singulier) à l'intérieur de chaque workspace ne soit PAS renommé, afin d'éviter toute confusion.

#### Critères d'acceptation

1. THE Refactoring_Engine SHALL conserver le nom `workspace/` (singulier) pour le sous-dossier de contenu généré à l'intérieur de chaque workspace
2. THE Refactoring_Engine SHALL utiliser `workspaces/` (pluriel) uniquement pour le dossier racine contenant tous les workspaces
3. IF un remplacement textuel risque de modifier le sous-dossier `workspace/` interne, THEN THE Refactoring_Engine SHALL exclure ce remplacement
4. THE Refactoring_Engine SHALL documenter clairement la distinction entre `workspaces/` (racine) et `workspace/` (sous-dossier interne) dans la documentation mise à jour

### Exigence 22 : Compilation et intégrité du projet

**User Story :** En tant que développeur, je veux que le projet compile et reste fonctionnel après chaque étape du refactoring.

#### Critères d'acceptation

1. WHEN le refactoring est terminé, THE Refactoring_Engine SHALL garantir que `bun run build` (tsc) compile sans erreur
2. WHEN le refactoring est terminé, THE Refactoring_Engine SHALL garantir que `bun run test` passe sans régression
3. IF une erreur de compilation est détectée pendant le refactoring, THEN THE Refactoring_Engine SHALL la corriger avant de passer à l'étape suivante
