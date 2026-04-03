# Plan d'implémentation : Event Activity Panel

## Vue d'ensemble

Implémentation incrémentale du panneau d'activité événementielle pour le Web UI d'EureClaw. Le plan suit le flux de données : types partagés → API backend (routes REST + SSE) → service client (api.ts) → hook React → composants UI. Chaque étape est testable indépendamment et s'intègre aux précédentes.

## Tâches

- [x] 1. Définir les types partagés et les fonctions utilitaires de normalisation
  - [x] 1.1 Créer le fichier `src/activity-types.ts` avec les interfaces `ActivityEvent`, `ActivityStatsData`, `ActivityFile` et les constantes
    - Définir `ActivityEvent` avec `ts`, `type`, `properties`, `icon`, `label`, `category`
    - Définir `ActivityStatsData` avec `totalEvents`, `duration`, `filesEdited`, `commandsRun`, `errors`, `toolsUsed`, `isActive`
    - Définir `ActivityFile` avec `filename`, `size`, `modified`
    - Exporter les sets `ALLOWED_EVENT_TYPES` et `FILTERED_EVENT_TYPES` selon le design
    - Exporter le mapping `EVENT_CATEGORY_MAP` (type → catégorie)
    - _Exigences: 2.3, 2.4, 6.1_

  - [x] 1.2 Implémenter les fonctions de normalisation dans `src/activity-utils.ts`
    - `parseJsonlLine(line: string): ActivityEvent | null` — parse une ligne JSONL, retourne null si malformée
    - `parseJsonlContent(content: string): ActivityEvent[]` — parse un contenu JSONL complet, ignore les lignes invalides
    - `normalizeEvent(raw: {ts, type, properties}): ActivityEvent` — enrichit avec `icon`, `label`, `category`
    - `extractToolInfo(props)` — extrait toolName, state, args depuis les propriétés d'un tool-invocation
    - `cleanMcpToolName(name: string): string` — retire le préfixe `mcp__eureclaw__` ou `mcp__`
    - `buildEventLabel(type, properties): string` — construit le label lisible (tronqué à 120 chars pour les commandes)
    - `isAllowedEvent(type: string): boolean` — vérifie si l'événement doit être transmis au client
    - _Exigences: 3.2, 3.3, 3.6, 3.7, 6.1, 6.2, 6.3, 6.5, 6.6_

  - [ ]* 1.3 Écrire les tests property-based pour le parsing et la normalisation
    - **Property 1: Round-trip JSONL parsing**
    - **Valide: Exigences 1.2, 6.1, 6.4**

  - [ ]* 1.4 Écrire le test property-based pour la résilience JSONL malformé
    - **Property 2: Malformed JSONL resilience**
    - **Valide: Exigences 6.2**

  - [ ]* 1.5 Écrire le test property-based pour le filtrage des types d'événements
    - **Property 3: Event type filtering**
    - **Valide: Exigences 2.3, 2.4**

  - [ ]* 1.6 Écrire le test property-based pour l'extraction des labels
    - **Property 6: Event label extraction**
    - **Valide: Exigences 3.2, 3.3, 3.6, 3.7, 6.3, 6.5**

  - [ ]* 1.7 Écrire le test property-based pour la cohérence du mapping d'icônes
    - **Property 7: Icon mapping consistency**
    - **Valide: Exigences 3.8**

  - [ ]* 1.8 Écrire le test property-based pour le nettoyage des noms MCP
    - **Property 8: MCP tool name cleaning**
    - **Valide: Exigences 6.6**

- [x] 2. Checkpoint — Vérifier que les types et utilitaires compilent
  - S'assurer que `bun run build` passe, poser des questions si nécessaire.

- [x] 3. Implémenter les routes API backend dans `src/api-activity-routes.ts`
  - [x] 3.1 Créer `src/api-activity-routes.ts` avec la fonction `registerActivityRoutes(fastify, authenticate)`
    - Implémenter `GET /chats/:jid/activity` — liste les fichiers JSONL du workspace (résolution JID → workspace folder → `logs/events/`)
    - Retourner `{ files: ActivityFile[] }` avec filename, size, modified
    - Retourner 404 si le JID ne correspond à aucun workspace enregistré
    - Retourner `{ files: [] }` si le dossier `logs/events/` est vide ou inexistant
    - Authentification Bearer via `preHandler: authenticate`
    - _Exigences: 1.1, 1.5, 1.6, 1.7_

  - [x] 3.2 Implémenter `GET /chats/:jid/activity/:filename` — lecture d'un fichier JSONL spécifique
    - Lire le fichier JSONL, parser chaque ligne avec `parseJsonlContent`
    - Normaliser chaque événement avec `normalizeEvent`
    - Supporter le paramètre `limit` (nombre max d'événements, défaut 500)
    - Supporter le paramètre `since` (timestamp minimum, filtrer `ts > since`)
    - Retourner `{ events: ActivityEvent[] }`
    - Retourner 404 si le fichier n'existe pas
    - _Exigences: 1.2, 1.3, 1.4, 1.5, 1.7, 6.1, 6.2_

  - [x] 3.3 Implémenter `GET /chats/:jid/activity/stream` — endpoint SSE temps réel
    - Ouvrir une connexion SSE avec les headers appropriés (`Content-Type: text/event-stream`, etc.)
    - Se connecter au serveur OpenCode SSE (`/event`) et filtrer les événements par sessionID (résolution JID → sessionID via la map existante)
    - Filtrer les événements avec `isAllowedEvent()` côté serveur
    - Normaliser chaque événement avec `normalizeEvent` avant transmission
    - Inclure `chatJid` et `folder` dans chaque événement transmis
    - Gérer la fermeture propre : AbortController, cleanup des listeners
    - Envoyer un événement d'erreur si la connexion OpenCode échoue
    - _Exigences: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 3.4 Écrire le test property-based pour le paramètre limit
    - **Property 10: Limit parameter caps results**
    - **Valide: Exigences 1.3**

  - [ ]* 3.5 Écrire le test property-based pour le paramètre since
    - **Property 11: Since parameter filters by timestamp**
    - **Valide: Exigences 1.4**

  - [ ]* 3.6 Écrire le test property-based pour l'authentification requise
    - **Property 12: Authentication required**
    - **Valide: Exigences 1.7**

- [x] 4. Enregistrer les routes d'activité dans le serveur API
  - [x] 4.1 Importer et appeler `registerActivityRoutes(fastify, authenticate)` dans `src/api-server.ts`
    - Ajouter l'import de `registerActivityRoutes` depuis `./api-activity-routes.js`
    - Appeler la fonction d'enregistrement au même endroit que les autres modules de routes (`registerAuthRoutes`, `registerEnvVarRoutes`, etc.)
    - _Exigences: 1.7, 2.1_

- [x] 5. Checkpoint — Vérifier que le backend compile et les routes sont enregistrées
  - S'assurer que `bun run build` passe, poser des questions si nécessaire.

- [x] 6. Étendre le service client API (`web-ui/src/api.ts`)
  - [x] 6.1 Ajouter les méthodes d'activité à la classe `ApiService`
    - `getActivityFiles(jid: string): Promise<ActivityFile[]>` — appelle `GET /chats/:jid/activity`
    - `getActivityEvents(jid: string, filename: string, options?: {limit?, since?}): Promise<ActivityEvent[]>` — appelle `GET /chats/:jid/activity/:filename`
    - `connectToActivityStream(jid: string): void` — ouvre une connexion SSE vers `/chats/:jid/activity/stream`
    - `disconnectFromActivityStream(): void` — ferme la connexion SSE d'activité
    - `onActivityEvent(callback): () => void` — enregistre un listener pour les événements d'activité
    - Ajouter les types `ActivityEvent`, `ActivityFile`, `ActivityStatsData` dans `api.ts` ou les importer
    - _Exigences: 1.1, 1.2, 2.1, 5.2, 5.4_

- [x] 7. Implémenter le hook `useActivityStream` dans `web-ui/src/hooks/useActivityStream.ts`
  - [x] 7.1 Créer le hook React `useActivityStream(jid, enabled)`
    - Gérer la connexion/déconnexion SSE automatique selon `jid` et `enabled`
    - Accumuler les événements reçus dans un state React
    - Calculer les statistiques (`ActivityStatsData`) à chaque nouvel événement
    - Exposer `events`, `stats`, `isConnected`, `isLoading`, `error`, `loadHistory`, `availableFiles`
    - Se déconnecter du flux précédent et se reconnecter quand le JID change
    - Se déconnecter quand `enabled` passe à `false`
    - Charger la liste des fichiers JSONL disponibles au montage
    - _Exigences: 5.2, 5.3, 5.4, 5.6_

  - [ ]* 7.2 Écrire le test property-based pour le calcul des statistiques
    - **Property 9: Stats computation from events**
    - **Valide: Exigences 4.1, 4.4**

- [x] 8. Checkpoint — Vérifier que le hook et le service client compilent
  - S'assurer que `bun run build` passe dans `web-ui/`, poser des questions si nécessaire.

- [x] 9. Implémenter les composants React du panneau d'activité
  - [x] 9.1 Créer le composant `EventTimelineItem` dans `web-ui/src/components/EventTimelineItem.tsx`
    - Afficher une ligne d'événement avec icône, label, timestamp relatif
    - Supporter les catégories visuelles : `session`, `tool`, `file`, `command`, `error`, `message`, `other`
    - Style distinctif pour les erreurs (couleur rouge, icône d'alerte)
    - Tronquer les commandes à 120 caractères avec ellipsis
    - Respecter le thème clair/sombre via prop `isDark`
    - _Exigences: 3.1, 3.2, 3.5, 3.7, 3.8, 5.5_

  - [x] 9.2 Créer le composant `EventTimeline` dans `web-ui/src/components/EventTimeline.tsx`
    - Timeline verticale chronologique des `EventTimelineItem`
    - Auto-scroll vers le bas pour les nouveaux événements (si l'utilisateur est en bas)
    - Afficher un message vide si aucun événement
    - _Exigences: 3.1, 3.4_

  - [x] 9.3 Créer le composant `ActivityStats` dans `web-ui/src/components/ActivityStats.tsx`
    - Afficher les compteurs : total événements, durée, fichiers édités, commandes exécutées, erreurs
    - Afficher la liste des outils utilisés sous forme de badges avec compteur
    - Utiliser les données du résumé `_summary` si disponible
    - Mise à jour en temps réel pendant que l'agent est actif
    - Respecter le thème clair/sombre
    - _Exigences: 4.1, 4.2, 4.3, 4.4, 5.5_

  - [x] 9.4 Créer le composant conteneur `EventActivityPanel` dans `web-ui/src/components/EventActivityPanel.tsx`
    - Utiliser le hook `useActivityStream` pour gérer l'état
    - Afficher `EventTimeline` et `ActivityStats`
    - Permettre de basculer entre vue temps réel (stream) et historique (fichiers JSONL passés)
    - Sélecteur de fichier JSONL pour l'historique
    - Indicateur de connexion SSE (connecté/déconnecté)
    - Respecter le thème clair/sombre
    - _Exigences: 5.1, 5.5, 5.6_

- [x] 10. Intégrer le panneau dans la vue de chat (`web-ui/src/App.tsx`)
  - [x] 10.1 Ajouter le bouton/onglet d'activation du panneau d'activité dans le header de chat
    - Ajouter un state `showActivityPanel` dans `App.tsx`
    - Ajouter un bouton dans le header à côté du bouton debug existant
    - Rendre `EventActivityPanel` conditionnellement quand activé
    - Passer le JID du chat sélectionné et `isDark` au panneau
    - Connexion automatique au flux SSE quand le panneau est activé
    - Déconnexion quand le panneau est désactivé ou le chat change
    - _Exigences: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 11. Checkpoint — Vérifier que les tests property-based pour le SSE passent
  - [ ]* 11.1 Écrire le test property-based pour l'enrichissement workspace
    - **Property 4: Event enrichment with workspace context**
    - **Valide: Exigences 2.7**

  - [ ]* 11.2 Écrire le test property-based pour le filtrage par session
    - **Property 5: Session-based event filtering**
    - **Valide: Exigences 2.2**

- [x] 12. Checkpoint final — S'assurer que tout compile et que les tests passent
  - Exécuter `bun run build` à la racine du projet
  - Exécuter `bun run build` dans `web-ui/`
  - S'assurer que tous les tests passent, poser des questions si nécessaire.

## Notes

- Les tâches marquées avec `*` sont optionnelles et peuvent être ignorées pour un MVP plus rapide
- Chaque tâche référence les exigences spécifiques pour la traçabilité
- Les checkpoints assurent une validation incrémentale
- Les tests property-based utilisent `fast-check` avec minimum 100 itérations
- Les tests unitaires utilisent `vitest` ou `bun:test`
- Le fichier `src/api-activity-routes.ts` ne doit pas dépasser 600 lignes
- Package manager : `bun` (pas npm)
