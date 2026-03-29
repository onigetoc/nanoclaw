# Plan d'Implémentation : Migration WebSocket du Panneau de Contrôle

## Vue d'ensemble

Migration du transport SSE vers WebSocket pour les événements temps réel du panneau de contrôle, avec fusion des vues Trace/Debug/Logs en une vue unifiée « Activity ». Le streaming SSE `/chat/stream` reste inchangé. L'implémentation suit un ordre naturel : serveur → client → intégration → UI → nettoyage.

## Tâches

- [x] 1. Module WebSocket serveur (`src/api-websocket.ts`)
  - [x] 1.1 Créer le module `src/api-websocket.ts` avec la gestion des connexions WebSocket
    - Implémenter l'interface `WsClient` avec les champs `ws`, `tokenId`, `authenticated`, `lastPong`
    - Créer la `Map<string, Set<WsClient>> wsConnections` pour stocker les connexions par tokenId
    - Implémenter `setupWebSocket(fastify)` qui enregistre le handler d'upgrade WebSocket sur `/ws` via `fastify.server`
    - Implémenter l'authentification par premier message JSON `{"type":"auth","token":"..."}` avec hash SHA-256 et lookup via `getAllApiTokens()`
    - Répondre `{"type":"auth_ok"}` si valide, fermer avec code 4401 si invalide
    - Limiter à 50 connexions par tokenId (code 4429 si dépassé)
    - Installer la dépendance `ws` : `bun add ws` et `bun add -d @types/ws`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.4, 8.1_

  - [x] 1.2 Implémenter le heartbeat et la détection de connexions mortes
    - Envoyer un ping WebSocket toutes les 30 secondes via `setInterval`
    - Détecter le timeout pong (>10s sans réponse) et fermer la connexion
    - Nettoyer les ressources (retirer de `wsConnections`) à la fermeture
    - _Requirements: 4.1, 4.2, 7.3_

  - [x] 1.3 Implémenter les fonctions de diffusion (`broadcastToToken`, `broadcastStatus`, `broadcastStep`)
    - Reproduire la logique de filtrage existante : `getApiTokenChatMappings(tokenId)` et `getLinkedChatJids(chatJid)`
    - Conserver le même format JSON que le système SSE actuel (champs `type`, `chatJid`, `status`, `detail`, `timestamp`)
    - Gérer les erreurs d'envoi : fermer la connexion défaillante et la retirer de `wsConnections`
    - Exporter les trois fonctions et `getWsConnectionCount()` pour usage par les autres modules
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 8.3_

  - [x] 1.4 Implémenter le ping/pong applicatif et la résilience aux messages malformés
    - Répondre `{"type":"pong","timestamp":"..."}` aux messages `{"type":"ping"}` des clients authentifiés
    - Ignorer les messages JSON malformés ou avec un `type` inconnu sans fermer la connexion
    - Logger un warning pour les messages malformés
    - _Requirements: 6.1, 6.2, 7.2_

  - [ ]* 1.5 Écrire les tests de propriétés pour le module serveur WebSocket
    - **Property 1: Authentification valide acceptée** — Pour tout token valide, le serveur répond `auth_ok`
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 1.6 Écrire le test de propriété pour l'authentification invalide
    - **Property 2: Authentification invalide rejetée avec code 4401** — Pour tout token invalide, le serveur ferme avec code 4401
    - **Validates: Requirements 1.2, 1.5**

  - [ ]* 1.7 Écrire le test de propriété pour la diffusion filtrée
    - **Property 3: Diffusion filtrée par autorisation** — Seuls les clients autorisés reçoivent les événements
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

  - [ ]* 1.8 Écrire le test de propriété pour la compatibilité du format
    - **Property 4: Compatibilité du format d'événements** — Le JSON produit contient les mêmes champs que l'ancien SSE
    - **Validates: Requirements 2.4**

  - [ ]* 1.9 Écrire le test de propriété pour la diffusion cross-canal
    - **Property 5: Diffusion cross-canal via JIDs liés** — Les clients avec accès aux JIDs liés reçoivent aussi l'événement
    - **Validates: Requirements 2.6**

  - [ ]* 1.10 Écrire le test de propriété pour le ping/pong applicatif
    - **Property 8: Ping applicatif → Pong** — Pour tout ping d'un client authentifié, le serveur répond pong avec timestamp ISO
    - **Validates: Requirements 6.1**

  - [ ]* 1.11 Écrire le test de propriété pour la résilience aux messages malformés
    - **Property 9: Résilience aux messages malformés** — La connexion reste ouverte après réception de messages invalides
    - **Validates: Requirements 6.2**

  - [ ]* 1.12 Écrire le test de propriété pour le nettoyage après erreur d'envoi
    - **Property 10: Nettoyage après erreur d'envoi** — Le client défaillant est retiré de wsConnections
    - **Validates: Requirements 7.1**

  - [ ]* 1.13 Écrire le test de propriété pour la libération des ressources
    - **Property 11: Libération des ressources après déconnexion** — Le client déconnecté n'apparaît plus dans aucune structure
    - **Validates: Requirements 7.3**

  - [ ]* 1.14 Écrire le test de propriété pour la limite de connexions
    - **Property 12: Limite de connexions par token** — Le nombre de connexions par tokenId ne dépasse jamais 50
    - **Validates: Requirements 7.4**

- [x] 2. Checkpoint — Vérifier le module serveur
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Module WebSocket client (`web-ui/src/websocket.ts`)
  - [x] 3.1 Créer le module `web-ui/src/websocket.ts` avec la classe `WebSocketClient`
    - Implémenter le constructeur avec `baseUrl` et l'état interne (`WsState`)
    - Implémenter `connect(token)` : ouvrir la connexion WS vers `ws://host:4300/ws`, envoyer `{"type":"auth","token":"..."}` après ouverture
    - Implémenter `disconnect()` : fermer proprement la connexion et annuler les timers de reconnexion
    - Implémenter la distribution des événements reçus aux listeners (`onMessage`, `onStatus`, `onStep`, `onConnectionChange`)
    - Implémenter `sendPing()` pour le ping applicatif
    - Exposer `isConnected` (getter)
    - _Requirements: 1.3, 3.3, 5.2, 5.5, 8.2, 8.4_

  - [x] 3.2 Implémenter la reconnexion automatique avec backoff exponentiel
    - Délai initial de 2 secondes, multiplié par 2 à chaque échec, plafonné à 30 secondes
    - Ré-authentifier automatiquement après reconnexion réussie
    - Ne pas tenter de reconnexion si le code de fermeture est 4401 (token invalide)
    - Mettre à jour `WsConnectionStatus` (connected, reconnecting, reconnectAttempt) à chaque changement
    - _Requirements: 3.1, 3.2, 3.4_

  - [ ]* 3.3 Écrire le test de propriété pour le backoff exponentiel
    - **Property 6: Backoff exponentiel de reconnexion** — Le délai est `min(2000 * 2^n, 30000)` pour n tentatives échouées
    - **Validates: Requirements 3.2**

  - [ ]* 3.4 Écrire le test de propriété pour la cohérence de l'état de connexion
    - **Property 7: Cohérence de l'état de connexion client** — `connected=true` uniquement quand ouvert et authentifié
    - **Validates: Requirements 3.3**

- [x] 4. Checkpoint — Vérifier les modules WS serveur et client
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Intégration dans les fichiers existants
  - [x] 5.1 Intégrer le module WS dans `src/api-server.ts`
    - Importer et appeler `setupWebSocket(fastify)` avant `fastify.listen()`
    - Remplacer les fonctions locales `broadcastToToken`, `broadcastStatus`, `broadcastStep` par des re-exports depuis `api-websocket.ts`
    - Supprimer la `Map sseConnections` et l'endpoint SSE `/events`
    - Conserver les exports des fonctions broadcast pour compatibilité avec les autres modules (`src/index.ts`, etc.)
    - _Requirements: 5.1, 5.4, 8.3_

  - [x] 5.2 Intégrer le client WS dans `web-ui/src/api.ts` (ApiService)
    - Importer `WebSocketClient` depuis `websocket.ts`
    - Instancier `WebSocketClient` dans le constructeur d'`ApiService`
    - Remplacer `connectToEvents()` par `wsClient.connect(token)` et `disconnectFromEvents()` par `wsClient.disconnect()`
    - Adapter `onConnectionChange` pour mapper `WsConnectionStatus` vers `ConnectionStatus` existant
    - Déléguer `onMessage()` et `onStatus()` au `WebSocketClient`
    - Supprimer le code SSE `/events` (fetch + reader + buffer) de `connectToEvents()`
    - Conserver `connectToChatStream()` et `disconnectFromChatStream()` inchangés (SSE `/chat/stream`)
    - _Requirements: 5.2, 5.3, 5.5_

- [x] 6. Checkpoint — Vérifier l'intégration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Vue unifiée Activity (`web-ui/src/settings/ActivityView.tsx`)
  - [x] 7.1 Créer le composant `ActivityView` avec la structure de base
    - Implémenter l'interface `ActivityViewProps` : `executions`, `activeExecutions`, `onRefresh`, `isDark`
    - Résumé d'erreurs en haut (panneau rose, repris de LogsSection)
    - Toggles de filtrage : « All » | « Errors » | « Active »
    - Timeline verticale avec dots colorés et ligne pointillée (style StepTimeline de ExecutionTrace)
    - Chaque entrée affiche : workspace + agentType, modèle, session, durée, erreur éventuelle
    - Expansion pour voir les steps détaillés (comme ExecutionRow)
    - Bouton Refresh + auto-refresh des exécutions actives (polling 2s)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 7.2 Écrire le test de propriété pour l'affichage des metadata
    - **Property 13: Affichage des metadata d'exécution** — Le rendu contient agentType, model, duration pour chaque exécution
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 7.3 Écrire le test de propriété pour le résumé des erreurs
    - **Property 14: Résumé des erreurs** — Le panneau d'erreurs s'affiche quand il y a des exécutions en erreur
    - **Validates: Requirements 9.5**

  - [ ]* 7.4 Écrire le test de propriété pour le filtrage par catégorie
    - **Property 15: Filtrage par catégorie** — « All » affiche tout, « Errors » les erreurs, « Active » les actives
    - **Validates: Requirements 9.6**

- [x] 8. Mise à jour de la navigation
  - [x] 8.1 Mettre à jour `web-ui/src/settings/SettingsNav.tsx`
    - Remplacer les trois entrées `trace`, `debug`, `logs` par une seule entrée `activity` dans le groupe « Agent »
    - Mettre à jour le type `SettingsSection` : retirer `'trace' | 'debug' | 'logs'`, ajouter `'activity'`
    - Utiliser l'icône `Activity` de lucide-react pour l'entrée « Activity »
    - _Requirements: 9.1_

  - [x] 8.2 Mettre à jour `web-ui/src/settings/AdminPage.tsx`
    - Importer `ActivityView` et retirer les imports de `ExecutionTrace`, `DebugSection`, `LogsSection`
    - Rendre `<ActivityView>` pour `section === 'activity'`
    - Supprimer les blocs conditionnels pour `trace`, `debug`, `logs`
    - _Requirements: 9.1_

- [x] 9. Nettoyage — Suppression du code obsolète
  - [x] 9.1 Supprimer les fichiers des anciennes vues
    - Supprimer `web-ui/src/settings/ExecutionTrace.tsx`
    - Supprimer `web-ui/src/settings/DebugSection.tsx`
    - Supprimer `web-ui/src/settings/LogsSection.tsx`
    - _Requirements: 9.1_

  - [x] 9.2 Vérifier qu'aucune référence aux anciens composants ne subsiste
    - Rechercher les imports de `ExecutionTrace`, `DebugSection`, `LogsSection` dans tout le projet
    - Vérifier que le type `SettingsSection` ne contient plus `trace`, `debug`, `logs`
    - _Requirements: 9.1_

- [x] 10. Checkpoint final — Vérification complète
  - Ensure all tests pass, ask the user if questions arise.
  - Vérifier que `bun run build` compile sans erreur côté serveur et côté client (`cd web-ui && bun run build`)

## Notes

- Les tâches marquées avec `*` sont optionnelles et peuvent être ignorées pour un MVP plus rapide
- Chaque tâche référence les exigences spécifiques pour la traçabilité
- Les checkpoints assurent une validation incrémentale
- Les tests de propriétés utilisent fast-check (`bun add -d fast-check`) avec minimum 100 itérations
- Fichiers de test : `src/__tests__/api-websocket.test.ts` (P1-P5, P8-P12), `web-ui/src/__tests__/websocket.test.ts` (P6-P7), `web-ui/src/__tests__/ActivityView.test.ts` (P13-P15)
- Le SSE `/chat/stream` reste inchangé tout au long de la migration
- Package manager : `bun` (pas npm)
