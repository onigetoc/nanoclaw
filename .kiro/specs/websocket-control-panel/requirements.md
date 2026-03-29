# Document d'Exigences — Migration WebSocket du Panneau de Contrôle

## Introduction

Le panneau de contrôle web d'EureClaw utilise actuellement des Server-Sent Events (SSE) pour les mises à jour en temps réel (messages, statuts, étapes d'exécution). Le streaming de chat fonctionne bien via son endpoint dédié `/chat/stream`, mais les données du panneau de contrôle (statuts, étapes, informations système) sont lentes et ne sont pas véritablement temps réel. Cette migration remplace le transport SSE du panneau de contrôle par WebSocket pour obtenir une communication bidirectionnelle et des mises à jour instantanées, tout en conservant le streaming SSE du chat (`/chat/stream`) qui fonctionne déjà correctement.

De plus, les trois sections actuelles du panneau de contrôle — Trace (timeline d'exécution), Debug (metadata agent) et Logs (table d'exécutions + erreurs) — affichent toutes les mêmes données `AgentExecution[]` avec des présentations différentes. Cette migration les regroupe en une seule vue unifiée nommée « Activity » qui conserve le look timeline vertical de l'ancien Trace, enrichi avec les metadata de Debug et le résumé d'erreurs de Logs. Chaque entrée affiche également l'agent utilisé (ex: orchestrator, planner, researcher).



## Glossaire

- **Serveur_API** : Le serveur Fastify backend (`src/api-server.ts`) qui écoute sur le port 4300 et gère l'authentification, les routes REST et la diffusion d'événements
- **Client_Web** : L'application frontend React/Vite (`web-ui/src/api.ts`) qui se connecte au Serveur_API pour afficher le panneau de contrôle
- **Gestionnaire_WS** : Le nouveau module WebSocket côté serveur qui gère les connexions WebSocket, l'authentification et la diffusion d'événements
- **Client_WS** : Le nouveau module WebSocket côté client qui gère la connexion, la reconnexion automatique et la distribution des événements reçus
- **Panneau_de_Contrôle** : L'interface web qui affiche les messages, statuts de traitement et étapes d'exécution en temps réel
- **Token_API** : Jeton Bearer utilisé pour l'authentification des clients (SHA-256 hashé côté serveur)
- **Événement_Message** : Événement de type `message` diffusé lors de la réception ou l'envoi d'un message chat
- **Événement_Statut** : Événement de type `status` diffusé lors des changements d'état de traitement (processing, connecting, waiting, responding, error, done, queued)
- **Événement_Étape** : Événement de type `step` diffusé lors des étapes d'exécution d'un agent (queue, init, context, model, fallback, response, error, done)
- **SSE_Chat** : L'endpoint SSE existant `/chat/stream` pour le streaming de tokens du modèle (deltas thinking/response), qui reste inchangé
- **Vue_Activity** : La nouvelle vue unifiée qui remplace les trois sections Trace, Debug et Logs, affichant les exécutions avec timeline verticale, metadata agent et résumé d'erreurs

## Exigences

### Exigence 1 : Établissement de la connexion WebSocket

**User Story :** En tant qu'utilisateur du Panneau_de_Contrôle, je veux que le Client_Web établisse une connexion WebSocket avec le Serveur_API, afin de recevoir les mises à jour en temps réel avec une latence minimale.

#### Critères d'Acceptation

1. WHEN le Client_Web s'initialise avec un Token_API valide, THE Gestionnaire_WS SHALL accepter la connexion WebSocket sur le chemin `/ws`
2. WHEN un client tente une connexion WebSocket sans Token_API valide, THE Gestionnaire_WS SHALL rejeter la connexion avec le code de fermeture 4401
3. WHEN la connexion WebSocket est établie, THE Client_WS SHALL envoyer le Token_API dans le premier message sous forme de JSON `{"type":"auth","token":"<bearer_token>"}`
4. WHEN le Gestionnaire_WS reçoit un message d'authentification valide, THE Gestionnaire_WS SHALL confirmer l'authentification avec un message `{"type":"auth_ok"}`
5. WHEN le Gestionnaire_WS reçoit un message d'authentification invalide, THE Gestionnaire_WS SHALL fermer la connexion avec le code 4401

### Exigence 2 : Diffusion des événements via WebSocket

**User Story :** En tant qu'utilisateur du Panneau_de_Contrôle, je veux recevoir les messages, statuts et étapes d'exécution via WebSocket, afin d'avoir des mises à jour instantanées sans la latence du SSE.

#### Critères d'Acceptation

1. WHEN un Événement_Message est émis, THE Gestionnaire_WS SHALL diffuser le message à tous les clients WebSocket authentifiés ayant accès au chat concerné
2. WHEN un Événement_Statut est émis, THE Gestionnaire_WS SHALL diffuser le statut à tous les clients WebSocket authentifiés ayant accès au chat concerné
3. WHEN un Événement_Étape est émis, THE Gestionnaire_WS SHALL diffuser l'étape à tous les clients WebSocket authentifiés ayant accès au chat concerné
4. THE Gestionnaire_WS SHALL conserver le même format JSON pour les événements que celui utilisé par le système SSE actuel (champs `type`, `chatJid`, `status`, `detail`, `timestamp`)
5. THE Gestionnaire_WS SHALL respecter le filtrage par Token_API et les mappings de chats existants (via `getApiTokenChatMappings`)
6. THE Gestionnaire_WS SHALL résoudre les JIDs liés (via `getLinkedChatJids`) pour la diffusion cross-canal, de manière identique au comportement SSE actuel

### Exigence 3 : Reconnexion automatique du client

**User Story :** En tant qu'utilisateur du Panneau_de_Contrôle, je veux que la connexion WebSocket se rétablisse automatiquement après une déconnexion, afin de ne pas perdre les mises à jour en temps réel.

#### Critères d'Acceptation

1. WHEN la connexion WebSocket est perdue, THE Client_WS SHALL tenter une reconnexion après un délai initial de 2 secondes
2. WHEN les tentatives de reconnexion échouent successivement, THE Client_WS SHALL augmenter le délai de reconnexion avec un backoff exponentiel plafonné à 30 secondes
3. WHILE la connexion WebSocket est interrompue, THE Client_WS SHALL mettre à jour l'état de connexion pour que le Panneau_de_Contrôle affiche l'état déconnecté
4. WHEN la reconnexion réussit, THE Client_WS SHALL ré-authentifier automatiquement avec le Token_API stocké

### Exigence 4 : Heartbeat et détection de connexion morte

**User Story :** En tant qu'opérateur du système, je veux que les connexions WebSocket mortes soient détectées et nettoyées, afin d'éviter les fuites de mémoire et les diffusions inutiles.

#### Critères d'Acceptation

1. THE Gestionnaire_WS SHALL envoyer un message ping WebSocket toutes les 30 secondes à chaque client connecté
2. IF un client ne répond pas au ping dans un délai de 10 secondes, THEN THE Gestionnaire_WS SHALL fermer la connexion et libérer les ressources associées
3. WHEN le Client_WS reçoit un ping, THE Client_WS SHALL répondre avec un pong automatiquement (comportement natif du protocole WebSocket)

### Exigence 5 : Remplacement du transport SSE pour le panneau de contrôle

**User Story :** En tant que développeur, je veux que le transport SSE du panneau de contrôle soit remplacé par WebSocket, afin de simplifier l'architecture et d'éliminer la duplication de code.

#### Critères d'Acceptation

1. WHEN le Gestionnaire_WS est actif, THE Serveur_API SHALL utiliser les connexions WebSocket au lieu de `sseConnections` pour les fonctions `broadcastToToken()`, `broadcastStatus()` et `broadcastStep()`
2. THE Client_WS SHALL remplacer la méthode `connectToEvents()` basée sur SSE par une connexion WebSocket pour les événements du panneau de contrôle
3. THE SSE_Chat (endpoint `/chat/stream`) SHALL rester inchangé et continuer à fonctionner via SSE pour le streaming de tokens du modèle
4. THE Serveur_API SHALL supprimer l'endpoint SSE `/events` une fois la migration WebSocket complète
5. THE Client_WS SHALL conserver les mêmes interfaces de listeners (`onMessage()`, `onStatus()`) pour assurer la compatibilité avec les composants React existants

### Exigence 6 : Communication bidirectionnelle client-serveur

**User Story :** En tant qu'utilisateur du Panneau_de_Contrôle, je veux pouvoir envoyer des commandes via WebSocket, afin de réduire la latence des interactions avec le serveur.

#### Critères d'Acceptation

1. WHEN le Client_WS envoie un message de type `ping`, THE Gestionnaire_WS SHALL répondre avec un message de type `pong` (ping applicatif pour mesurer la latence)
2. THE Gestionnaire_WS SHALL valider le format JSON de chaque message reçu et ignorer les messages malformés sans fermer la connexion

### Exigence 7 : Gestion des erreurs et résilience

**User Story :** En tant qu'opérateur du système, je veux que le système WebSocket gère les erreurs gracieusement, afin de maintenir la stabilité du Serveur_API.

#### Critères d'Acceptation

1. IF une erreur survient lors de l'envoi d'un message WebSocket à un client, THEN THE Gestionnaire_WS SHALL fermer la connexion défaillante et la retirer de la liste des connexions actives
2. IF le Gestionnaire_WS échoue à démarrer, THEN THE Serveur_API SHALL journaliser l'erreur et continuer à fonctionner sans WebSocket
3. WHEN un client se déconnecte, THE Gestionnaire_WS SHALL libérer toutes les ressources associées à cette connexion dans un délai de 5 secondes
4. THE Gestionnaire_WS SHALL limiter le nombre de connexions WebSocket simultanées à 50 par Token_API

### Exigence 8 : Modularité et respect de la limite de taille des fichiers

**User Story :** En tant que développeur, je veux que le code WebSocket soit organisé en modules séparés, afin de respecter la limite de 600 lignes par fichier et de faciliter la maintenance.

#### Critères d'Acceptation

1. THE Gestionnaire_WS SHALL être implémenté dans un fichier dédié `src/api-websocket.ts` séparé du fichier `src/api-server.ts`
2. THE Client_WS SHALL être implémenté dans un fichier dédié `web-ui/src/websocket.ts` séparé du fichier `web-ui/src/api.ts`
3. THE Gestionnaire_WS SHALL exposer les fonctions de diffusion (`broadcastToToken`, `broadcastStatus`, `broadcastStep`) comme exports pour être utilisées par les modules existants
4. THE Client_WS SHALL exposer une API compatible avec l'interface existante de `connectToEvents()` pour minimiser les changements dans les composants React

### Exigence 9 : Vue unifiée « Activity » (regroupement Trace + Debug + Logs)

**User Story :** En tant qu'utilisateur du Panneau_de_Contrôle, je veux une seule vue « Activity » qui regroupe les informations de Trace, Debug et Logs, afin d'avoir une vision complète de chaque exécution sans naviguer entre trois sections qui affichent les mêmes données.

#### Critères d'Acceptation

1. THE Vue_Activity SHALL remplacer les trois sections actuelles « Trace », « Debug » et « Logs » dans la navigation du Panneau_de_Contrôle par une seule entrée « Activity »
2. THE Vue_Activity SHALL conserver le style timeline vertical avec dots et ligne pointillée de l'ancien composant Trace (composant `StepTimeline`)
3. THE Vue_Activity SHALL afficher pour chaque exécution les metadata agent actuellement dans Debug : type d'agent utilisé (ex: orchestrator, planner, researcher), modèle, session, durée et erreur éventuelle
4. THE Vue_Activity SHALL afficher le nom de l'agent (champ `agentType` de `AgentExecution`) de manière visible dans chaque entrée d'exécution, à côté du nom du workspace
5. THE Vue_Activity SHALL inclure un résumé des erreurs récentes en haut de la vue, similaire au panneau d'erreurs de l'ancien composant Logs
6. THE Vue_Activity SHALL supporter le filtrage par catégorie via des toggles : « All », « Errors », « Active » pour permettre de filtrer les exécutions affichées
7. THE Vue_Activity SHALL conserver l'auto-refresh des exécutions actives (polling toutes les 2 secondes) et le bouton Refresh manuel
8. THE Vue_Activity SHALL recevoir les mises à jour d'exécution en temps réel via WebSocket (Événement_Étape) au lieu du polling HTTP
