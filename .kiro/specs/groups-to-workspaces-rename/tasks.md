# Plan d'Implémentation : Renommage `groups/` → `workspaces/`

## Vue d'ensemble

Refactoring bottom-up du concept "group" → "workspace" à travers tout le projet EureClaw. Chaque tâche construit sur la précédente, en suivant l'ordre de dépendances du design : types → config → DB → modules de gestion → modules consommateurs → channels → API → Web UI → agent-runner → docs → tests.

**Contrainte critique** : le sous-dossier `workspace/` (singulier) à l'intérieur de chaque workspace NE DOIT PAS être renommé. Les chemins de montage container (`/workspace/group`, `/workspace/global`) restent inchangés.

## Tâches

- [x] 1. Renommer les types et interfaces fondamentaux
  - [x] 1.1 Renommer `RegisteredGroup` → `RegisteredWorkspace` dans `src/types.ts`
    - Renommer l'interface `RegisteredGroup` en `RegisteredWorkspace`
    - Renommer le champ `group_folder` en `workspace_folder` dans `ScheduledTask`
    - Renommer `context_mode: 'group'` en `context_mode: 'workspace'` dans `ScheduledTask`
    - Mettre à jour le commentaire `requiresTrigger` de "groups" à "workspaces"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Mettre à jour tous les imports de `RegisteredGroup` dans les fichiers consommateurs
    - Remplacer `RegisteredGroup` par `RegisteredWorkspace` dans tous les fichiers qui importent ce type (~20 fichiers)
    - Remplacer les références à `group_folder` par `workspace_folder` dans les fichiers utilisant `ScheduledTask`
    - _Requirements: 3.5_

- [x] 2. Mettre à jour la configuration et la base de données
  - [x] 2.1 Renommer les constantes dans `src/config.ts`
    - Renommer `GROUPS_DIR` en `WORKSPACES_DIR` (pointe vers `workspaces/`)
    - Renommer `MAIN_GROUP_FOLDER` en `MAIN_WORKSPACE_FOLDER`
    - Mettre à jour tous les fichiers qui importent `GROUPS_DIR` et `MAIN_GROUP_FOLDER`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Implémenter la migration SQLite dans `src/db.ts`
    - Renommer la table `registered_groups` en `registered_workspaces` via `ALTER TABLE RENAME TO`
    - Migrer la colonne `group_folder` → `workspace_folder` dans `sessions` (pattern CREATE/INSERT/DROP/RENAME)
    - Migrer la colonne `group_folder` → `workspace_folder` dans `scheduled_tasks` (même pattern)
    - Migrer `context_mode: 'group'` → `context_mode: 'workspace'` dans `scheduled_tasks`
    - Rendre la migration idempotente (ignorer si déjà migrée)
    - Protéger par try/catch avec logging d'erreur (Exigence 4.7)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_

  - [x] 2.3 Renommer les fonctions DB et mettre à jour le schéma dans `src/db.ts`
    - Mettre à jour `createSchema()` pour utiliser `registered_workspaces`, `workspace_folder`
    - Renommer `getRegisteredGroup` → `getRegisteredWorkspace`
    - Renommer `setRegisteredGroup` → `setRegisteredWorkspace`
    - Renommer `getAllRegisteredGroups` → `getAllRegisteredWorkspaces`
    - Renommer `hasGroupWithFolder` → `hasWorkspaceWithFolder`
    - Renommer `getTasksForGroup` → `getTasksForWorkspace`
    - Renommer `migrateDropFolderUnique` pour référencer `registered_workspaces`
    - _Requirements: 4.5, 4.6_

  - [ ]* 2.4 Écrire le test de propriété pour la migration SQLite
    - **Property 1: Round-trip de migration SQLite**
    - Générer des données aléatoires (registered_groups, sessions, scheduled_tasks) via fast-check
    - Exécuter la migration, vérifier que toutes les données sont préservées dans les nouvelles tables
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 3. Checkpoint — Vérifier la compilation
  - Exécuter `bun run build` pour vérifier que les types, config et DB compilent sans erreur
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Renommer les modules de gestion
  - [x] 4.1 Renommer `src/group-manager.ts` → `src/workspace-manager.ts`
    - Renommer le fichier
    - Renommer `registerGroup` → `registerWorkspace`
    - Renommer `copyTemplatesToGroup` → `copyTemplatesToWorkspace`
    - Renommer `getAvailableGroups` → `getAvailableWorkspaces`
    - Mettre à jour les chemins internes pour utiliser `WORKSPACES_DIR`
    - Mettre à jour tous les imports depuis `group-manager` vers `workspace-manager`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.2 Renommer `src/group-queue.ts` → `src/workspace-queue.ts`
    - Renommer le fichier
    - Renommer la classe `GroupQueue` → `WorkspaceQueue`
    - Renommer les variables internes `groupJid` → `workspaceJid`, `groupFolder` → `workspaceFolder`
    - Mettre à jour tous les imports de `GroupQueue` vers `WorkspaceQueue`
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 4.3 Mettre à jour `src/state.ts`
    - Renommer `registeredGroups` → `registeredWorkspaces`
    - Renommer `getRegisteredGroups` → `getRegisteredWorkspaces`
    - Renommer `reloadRegisteredGroups` → `reloadRegisteredWorkspaces`
    - Renommer `_setRegisteredGroups` → `_setRegisteredWorkspaces`
    - Renommer `setGroupSession` → `setWorkspaceSession`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 4.4 Écrire le test de propriété pour la préservation du sous-dossier workspace/
    - **Property 2: Préservation du sous-dossier workspace/ interne**
    - Générer des noms de workspace aléatoires, appeler `registerWorkspace()`, vérifier que le sous-dossier est `workspace/` (singulier)
    - **Validates: Requirements 1.3, 21.1**

- [x] 5. Mettre à jour les modules consommateurs (partie 1)
  - [x] 5.1 Mettre à jour `src/container-runner.ts`
    - Remplacer `GROUPS_DIR` par `WORKSPACES_DIR` dans les chemins de montage host
    - Renommer `AvailableGroup` → `AvailableWorkspace`
    - Renommer `writeGroupsSnapshot` → `writeWorkspacesSnapshot`
    - Renommer les variables locales contenant "group" en "workspace" dans les fonctions de montage
    - **Conserver** les chemins de montage container (`/workspace/group`, `/workspace/global`) inchangés
    - Renommer `groupFolder` → `workspaceFolder` dans `ContainerInput`
    - Renommer `groupDir` → `workspaceDir` dans `directMode`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.2 Mettre à jour `src/direct-runner.ts`
    - Remplacer `GROUPS_DIR` par `WORKSPACES_DIR`
    - Renommer les variables locales `group` → `workspace` (paramètres, logs)
    - Mettre à jour `ContainerInput` pour utiliser `workspaceFolder` et `workspaceDir`
    - _Requirements: 19.6_

  - [x] 5.3 Mettre à jour `src/ipc.ts`
    - Renommer les champs de `IpcDeps` : `registeredGroups` → `registeredWorkspaces`, `getAvailableGroups` → `getAvailableWorkspaces`, etc.
    - Renommer les types IPC : `register_group` → `register_workspace`, `refresh_groups` → `refresh_workspaces`
    - Renommer `sourceGroup` → `sourceWorkspace`
    - Renommer `syncGroupMetadata` → `syncWorkspaceMetadata`
    - Renommer `writeGroupsSnapshot` → `writeWorkspacesSnapshot`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 5.4 Écrire le test de propriété pour l'invariance des chemins container
    - **Property 3: Invariance des chemins de montage container**
    - Générer des configurations de workspace aléatoires (main/non-main), appeler `buildVolumeMounts()`, vérifier que les chemins container contiennent `/workspace/group` et `/workspace/global`
    - **Validates: Requirements 8.5**

- [x] 6. Mettre à jour les modules consommateurs (partie 2)
  - [x] 6.1 Mettre à jour `src/task-scheduler.ts`
    - Remplacer `GROUPS_DIR` par `WORKSPACES_DIR`, `MAIN_GROUP_FOLDER` par `MAIN_WORKSPACE_FOLDER`
    - Renommer `registeredGroups` → `registeredWorkspaces` dans `SchedulerDependencies`
    - Renommer `GroupQueue` → `WorkspaceQueue` dans les imports et types
    - Mettre à jour les références à `group_folder` → `workspace_folder`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 6.2 Mettre à jour `src/message-processor.ts`
    - Renommer les imports et références : `getRegisteredGroups` → `getRegisteredWorkspaces`, `GroupQueue` → `WorkspaceQueue`, etc.
    - Renommer `MAIN_GROUP_FOLDER` → `MAIN_WORKSPACE_FOLDER`
    - Renommer `getAvailableGroups` → `getAvailableWorkspaces`, `writeGroupsSnapshot` → `writeWorkspacesSnapshot`
    - Renommer `setGroupSession` → `setWorkspaceSession`
    - _Requirements: 19.3_

  - [x] 6.3 Mettre à jour `src/message-loop.ts`
    - Renommer les imports et références : `getRegisteredGroups` → `getRegisteredWorkspaces`, `GroupQueue` → `WorkspaceQueue`
    - Renommer `MAIN_GROUP_FOLDER` → `MAIN_WORKSPACE_FOLDER`
    - _Requirements: 19.2_

  - [x] 6.4 Mettre à jour `src/auto-registration.ts`
    - Renommer `GROUPS_DIR` → `WORKSPACES_DIR`
    - Renommer `hasGroupWithFolder` → `hasWorkspaceWithFolder`
    - Renommer `setRegisteredGroup` → `setRegisteredWorkspace`
    - Renommer `hasMainGroup` → `hasMainWorkspace`
    - Renommer `initializeGroupFolders` → `initializeWorkspaceFolders`
    - Mettre à jour les commentaires et logs
    - _Requirements: 19.1_

  - [x] 6.5 Mettre à jour `src/agent-executor.ts`
    - Renommer les imports et types : `RegisteredGroup` → `RegisteredWorkspace`, `ContainerInput`
    - _Requirements: 19.5_

  - [x] 6.6 Mettre à jour `src/startup.ts`
    - Renommer tous les imports : `MAIN_GROUP_FOLDER` → `MAIN_WORKSPACE_FOLDER`, `GroupQueue` → `WorkspaceQueue`, etc.
    - Renommer `registerGroup` → `registerWorkspace`, `getAvailableGroups` → `getAvailableWorkspaces`
    - Renommer `reloadRegisteredGroups` → `reloadRegisteredWorkspaces`, `getRegisteredGroups` → `getRegisteredWorkspaces`
    - Renommer `setGroupSession` → `setWorkspaceSession`
    - Renommer `writeGroupsSnapshot` → `writeWorkspacesSnapshot`
    - _Requirements: 19.4_

- [x] 7. Checkpoint — Vérifier la compilation backend
  - Exécuter `bun run build` pour vérifier que tous les modules backend compilent sans erreur
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Mettre à jour les channels et l'API
  - [x] 8.1 Mettre à jour `src/channels/whatsapp.ts`
    - Renommer `GROUP_SYNC_INTERVAL_MS` → `WORKSPACE_SYNC_INTERVAL_MS`
    - Renommer `registeredGroups` → `registeredWorkspaces` dans les callbacks
    - Renommer `syncGroupMetadata` → `syncWorkspaceMetadata`
    - Mettre à jour les commentaires et logs
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 8.2 Mettre à jour `src/channels/telegram.ts`
    - Renommer `registeredGroups` → `registeredWorkspaces` dans les callbacks
    - Mettre à jour les commentaires et logs
    - _Requirements: 11.4_

  - [x] 8.3 Mettre à jour `src/api-server.ts`
    - Renommer les routes `/groups` → `/workspaces`
    - Renommer `ensureWebGroupsRegistered` → `ensureWebWorkspacesRegistered`
    - Renommer les champs JSON : `groupInfo` → `workspaceInfo`, `registeredGroups` → `registeredWorkspaces`
    - Renommer les imports : `registerGroup` → `registerWorkspace`, `GROUPS_DIR` → `WORKSPACES_DIR`
    - Renommer `RegisteredGroup` → `RegisteredWorkspace`
    - _Requirements: 18.1, 18.2, 18.3_

  - [x] 8.4 Mettre à jour `src/api-markdown-routes.ts`
    - Renommer `GROUPS_DIR` → `WORKSPACES_DIR`
    - Renommer les routes `/md/groups` → `/md/workspaces`
    - Mettre à jour les commentaires et variables locales
    - _Requirements: 18.2_

- [x] 9. Mettre à jour la Web UI
  - [x] 9.1 Mettre à jour `web-ui/src/api.ts`
    - Renommer `RegisteredGroup` → `RegisteredWorkspace`
    - Renommer `groupInfo` → `workspaceInfo` dans `ChatInfo`
    - Renommer `registeredGroups` → `registeredWorkspaces` dans `MonitoringData`
    - Mettre à jour les endpoints : `/groups` → `/workspaces`, `/md/groups` → `/md/workspaces`
    - _Requirements: 13.2, 13.3_

  - [x] 9.2 Mettre à jour les composants Web UI
    - `ChatSidebar.tsx` : label "Workspaces / Groups" → "Workspaces", `groupInfo` → `workspaceInfo`
    - `OverviewSection.tsx` : label "Groups" → "Workspaces", `registeredGroups` → `registeredWorkspaces`
    - `FilesSection.tsx` : mettre à jour les variables et commentaires
    - Mettre à jour tous les autres composants qui référencent `groupInfo` ou `RegisteredGroup`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 10. Mettre à jour l'Agent Runner (container)
  - [x] 10.1 Mettre à jour `container/agent-runner/src/index.ts`
    - Renommer `groupFolder` → `workspaceFolder` dans l'interface `ContainerInput`
    - Renommer `groupDir` → `workspaceDir` dans `directMode`
    - Renommer les variables locales `groupDir` → `workspaceDir`
    - Mettre à jour les commentaires et logs
    - Mettre à jour les hints de chemin pour référencer `workspaces/` au lieu de `groups/`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 10.2 Écrire le test de propriété pour la compatibilité ContainerInput
    - **Property 4: Compatibilité du protocole ContainerInput**
    - Générer des objets `ContainerInput` aléatoires avec `workspaceFolder`, sérialiser en JSON, désérialiser, vérifier l'égalité
    - **Validates: Requirements 12.1, 12.2**

- [x] 11. Checkpoint — Vérifier la compilation complète
  - Exécuter `bun run build` pour vérifier que tout le projet compile sans erreur
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Renommer le dossier physique et mettre à jour les fichiers non-code
  - [x] 12.1 Renommer le dossier `groups/` → `workspaces/`
    - Renommer le dossier physique à la racine du projet
    - Mettre à jour `.gitignore` pour référencer `workspaces/` au lieu de `groups/`
    - Vérifier que le contenu (global, main, work, templates) est préservé
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 12.2 Mettre à jour la documentation
    - Mettre à jour `README.md` pour référencer `workspaces/`
    - Mettre à jour `AGENTS.md` pour référencer `workspaces/`
    - Mettre à jour `.kiro/structure.md` pour référencer `workspaces/`
    - Mettre à jour `workspaces/global/dna/DOCUMENTATION.md`
    - Mettre à jour les fichiers `.md` dans `.opencode/`, `.kiro/steering/`, et `docs/`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 12.3 Mettre à jour les templates DNA
    - Vérifier que les templates sont dans `workspaces/templates/`
    - Remplacer "group" par "workspace" dans le contenu des templates
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 12.4 Mettre à jour les skills, prompts et agents
    - Mettre à jour les fichiers dans `.opencode/skills/` qui référencent "group" ou `groups/`
    - Mettre à jour les fichiers dans `.opencode/prompts/` qui référencent "group" ou `groups/`
    - Mettre à jour les fichiers dans `.opencode/agents/` qui référencent "group" ou `groups/`
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 12.5 Mettre à jour les fichiers steering
    - Mettre à jour les fichiers dans `.kiro/steering/` qui référencent "group" ou `groups/`
    - _Requirements: 17.1, 17.2_

- [x] 13. Mettre à jour et exécuter les tests
  - [x] 13.1 Renommer et mettre à jour les fichiers de test
    - Renommer `src/group-queue.test.ts` → `src/workspace-queue.test.ts`
    - Mettre à jour `GroupQueue` → `WorkspaceQueue` dans les tests
    - Mettre à jour `src/db.test.ts` : `setRegisteredGroup` → `setRegisteredWorkspace`, `group_folder` → `workspace_folder`
    - Mettre à jour `src/container-runner.test.ts` : `GROUPS_DIR` → `WORKSPACES_DIR`
    - Mettre à jour `src/ipc-auth.test.ts` : `RegisteredGroup` → `RegisteredWorkspace`, `sourceGroup` → `sourceWorkspace`
    - Mettre à jour `src/routing.test.ts` : `getAvailableGroups` → `getAvailableWorkspaces`, `_setRegisteredGroups` → `_setRegisteredWorkspaces`
    - _Requirements: 20.1, 20.3_

  - [ ]* 13.2 Écrire les tests unitaires pour la migration SQLite
    - Tester la migration avec des données existantes
    - Tester l'idempotence (migration exécutée deux fois)
    - Tester le cas d'erreur (table déjà migrée)
    - _Requirements: 4.4, 4.7_

- [x] 14. Checkpoint final — Vérification complète
  - Exécuter `bun run build` pour vérifier la compilation TypeScript sans erreur
  - Exécuter `bun run test` pour vérifier que tous les tests passent sans régression
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 22.1, 22.2, 22.3_

## Notes

- Les tâches marquées avec `*` sont optionnelles et peuvent être ignorées pour un MVP plus rapide
- Chaque tâche référence les exigences spécifiques pour la traçabilité
- Les checkpoints garantissent une validation incrémentale
- Les tests de propriétés valident les propriétés de correction universelles du design
- Les tests unitaires valident des exemples spécifiques et des cas limites
- **Rappel critique** : le sous-dossier `workspace/` (singulier) interne ne doit JAMAIS être renommé
- **Rappel critique** : les chemins de montage container (`/workspace/group`, `/workspace/global`) restent inchangés
