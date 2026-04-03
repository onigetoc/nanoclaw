# Document de Spécifications — Event Activity Panel

## Introduction

Le panneau "Event Activity" est une extension du Web UI d'EureClaw qui affiche en temps réel l'activité détaillée de l'agent pendant un échange. Contrairement à la vue Activity existante (qui montre les exécutions au niveau macro : statut, durée, modèle), cette nouvelle fonctionnalité expose les événements OpenCode granulaires — outils appelés, fichiers lus/écrits, commandes shell exécutées, agents délégués, erreurs, etc. — sous forme de timeline interactive.

Le backend EventLogger (`event-logger.ts`) écrit déjà les événements dans des fichiers JSONL (`workspaces/{name}/logs/events/`). Le flux SSE existant (`/chat/stream`) ne transmet que les `message.part.delta` pour le streaming de texte. Cette feature doit exposer les autres types d'événements au Web UI, soit via un nouveau endpoint SSE, soit en étendant le flux existant.

## Glossaire

- **Event_Activity_Panel** : Composant React du Web UI qui affiche la timeline d'événements OpenCode pour un workspace donné
- **Activity_API** : Endpoint(s) REST/SSE dans `api-server.ts` qui servent les événements au Web UI
- **Event_Stream** : Flux SSE temps réel qui transmet les événements OpenCode au navigateur
- **JSONL_Store** : Fichiers JSONL écrits par EventLogger dans `workspaces/{name}/logs/events/`
- **EventLogger** : Classe existante dans `event-logger.ts` qui capture les événements OpenCode SSE et les écrit en JSONL
- **OpenCode_Event** : Un événement SSE émis par le serveur OpenCode (42 types documentés dans `event.type.md`)
- **Activity_Event** : Un événement normalisé pour le Web UI, dérivé d'un OpenCode_Event, avec structure `{ts, type, properties}`
- **Timeline** : Représentation visuelle chronologique des Activity_Events dans le panneau
- **Workspace_Folder** : Dossier de travail d'un workspace EureClaw (`workspaces/{name}/`)
- **Session** : Session OpenCode identifiée par un `sessionID`, correspondant à un échange agent

## Exigences

### Exigence 1 : Endpoint API pour les événements historiques

**User Story :** En tant que développeur utilisant le Web UI, je veux récupérer l'historique des événements d'un workspace, afin de voir ce que l'agent a fait lors d'échanges passés.

#### Critères d'acceptation

1. WHEN une requête GET est envoyée à `/chats/:jid/activity`, THE Activity_API SHALL retourner la liste des fichiers JSONL disponibles pour le workspace correspondant au JID
2. WHEN une requête GET est envoyée à `/chats/:jid/activity/:filename`, THE Activity_API SHALL lire le fichier JSONL spécifié et retourner les Activity_Events sous forme de tableau JSON
3. WHEN le paramètre `limit` est fourni dans la requête, THE Activity_API SHALL limiter le nombre d'événements retournés au nombre spécifié
4. WHEN le paramètre `since` (timestamp) est fourni, THE Activity_API SHALL retourner uniquement les événements dont le `ts` est supérieur à la valeur fournie
5. IF le JID ne correspond à aucun workspace enregistré, THEN THE Activity_API SHALL retourner un code HTTP 404 avec un message d'erreur descriptif
6. IF le dossier `logs/events/` du workspace est vide ou inexistant, THEN THE Activity_API SHALL retourner un tableau vide avec un code HTTP 200
7. THE Activity_API SHALL exiger une authentification par token Bearer (même mécanisme que les autres endpoints)

### Exigence 2 : Flux SSE temps réel pour les événements d'activité

**User Story :** En tant que développeur utilisant le Web UI, je veux voir en temps réel ce que l'agent fait pendant un échange, afin de suivre sa progression sans rafraîchir la page.

#### Critères d'acceptation

1. WHEN un client se connecte à `/chats/:jid/activity/stream`, THE Activity_API SHALL ouvrir un flux SSE qui transmet les OpenCode_Events en temps réel
2. THE Activity_API SHALL filtrer les événements par workspace en résolvant le JID vers un `sessionID` via la map session-to-jid existante
3. WHEN un événement de type `session.created`, `session.idle`, `session.error`, `message.part.updated` (tool-invocation), `file.edited`, `command.executed`, `question.asked`, `permission.asked`, ou `pty.created` est reçu, THE Event_Stream SHALL le transmettre au client
4. WHEN un événement de type `message.part.delta`, `file.watcher.updated`, `tui.*`, `installation.*`, `server.*`, ou `global.*` est reçu, THE Event_Stream SHALL ne pas le transmettre (événements bruyants filtrés côté serveur)
5. WHEN le client ferme la connexion SSE, THE Activity_API SHALL libérer les ressources associées (abort controller, listeners)
6. IF la connexion au serveur OpenCode échoue, THEN THE Event_Stream SHALL envoyer un événement d'erreur au client et fermer le flux proprement
7. THE Event_Stream SHALL inclure le `chatJid` et le `folder` du workspace dans chaque événement transmis

### Exigence 3 : Composant Timeline du panneau d'activité

**User Story :** En tant que développeur utilisant le Web UI, je veux voir une timeline visuelle des étapes de l'agent, afin de comprendre le déroulement complet d'un échange.

#### Critères d'acceptation

1. THE Event_Activity_Panel SHALL afficher les Activity_Events sous forme de timeline verticale chronologique
2. WHEN un Activity_Event de type tool-invocation est reçu, THE Event_Activity_Panel SHALL afficher le nom de l'outil, son état (call, result), et les arguments pertinents (chemin de fichier, commande, URL)
3. WHEN un Activity_Event de type `session.created` est reçu, THE Event_Activity_Panel SHALL afficher le début de session avec l'identifiant de l'agent et du modèle utilisés
4. WHEN un Activity_Event de type `session.idle` est reçu, THE Event_Activity_Panel SHALL afficher la fin de traitement de l'agent
5. WHEN un Activity_Event de type `session.error` est reçu, THE Event_Activity_Panel SHALL afficher l'erreur avec un style visuel distinctif (couleur rouge, icône d'alerte)
6. WHEN un Activity_Event de type `file.edited` est reçu, THE Event_Activity_Panel SHALL afficher le chemin du fichier modifié
7. WHEN un Activity_Event de type `command.executed` est reçu, THE Event_Activity_Panel SHALL afficher la commande exécutée (tronquée à 120 caractères avec ellipsis)
8. THE Event_Activity_Panel SHALL utiliser des icônes distinctes par catégorie d'événement (lecture, écriture, commande, MCP, erreur) conformément au mapping d'icônes existant dans EventLogger

### Exigence 4 : Panneau de statistiques récapitulatives

**User Story :** En tant que développeur utilisant le Web UI, je veux voir un résumé des statistiques de l'échange en cours, afin d'avoir une vue d'ensemble rapide de l'activité de l'agent.

#### Critères d'acceptation

1. THE Event_Activity_Panel SHALL afficher un panneau de statistiques contenant : nombre total d'événements, durée totale, nombre de fichiers édités, nombre de commandes exécutées, nombre d'erreurs, et liste des outils utilisés
2. WHILE l'agent est actif (entre `session.created` et `session.idle`), THE Event_Activity_Panel SHALL mettre à jour les statistiques en temps réel à chaque nouvel événement
3. WHEN un événement `_summary` est présent dans le JSONL (écrit par EventLogger en fin de session), THE Event_Activity_Panel SHALL utiliser les données du résumé pour afficher les statistiques finales
4. THE Event_Activity_Panel SHALL afficher la liste des outils utilisés sous forme de badges avec le nombre d'appels par outil

### Exigence 5 : Intégration dans le Web UI existant

**User Story :** En tant que développeur utilisant le Web UI, je veux accéder au panneau d'activité depuis l'interface de chat, afin de suivre l'activité sans quitter ma conversation.

#### Critères d'acceptation

1. THE Event_Activity_Panel SHALL être accessible via un onglet ou bouton dans la vue de chat existante
2. WHEN l'utilisateur active le panneau d'activité, THE Event_Activity_Panel SHALL se connecter automatiquement au flux SSE du workspace actif
3. WHEN l'utilisateur change de workspace/chat, THE Event_Activity_Panel SHALL se déconnecter du flux précédent et se reconnecter au nouveau workspace
4. WHEN l'utilisateur désactive le panneau d'activité, THE Event_Activity_Panel SHALL fermer la connexion SSE pour économiser les ressources
5. THE Event_Activity_Panel SHALL respecter le thème clair/sombre du Web UI existant (paramètre `isDark`)
6. THE Event_Activity_Panel SHALL permettre de basculer entre la vue temps réel (stream) et l'historique (fichiers JSONL passés)

### Exigence 6 : Parsing et normalisation des événements JSONL

**User Story :** En tant que développeur, je veux que les événements JSONL soient correctement parsés et normalisés, afin que le Web UI affiche des informations cohérentes et exploitables.

#### Critères d'acceptation

1. THE Activity_API SHALL parser chaque ligne JSONL en un objet `{ts: number, type: string, properties: object}`
2. WHEN une ligne JSONL est malformée (JSON invalide), THE Activity_API SHALL ignorer la ligne et continuer le parsing des lignes suivantes
3. THE Activity_API SHALL extraire les informations pertinentes des tool-invocations : nom de l'outil, état, arguments (filePath, command, url, pattern, agent)
4. FOR ALL Activity_Events parsés puis sérialisés en JSON puis re-parsés, le résultat SHALL être équivalent à l'objet original (propriété round-trip)
5. WHEN un événement de type `message.part.updated` avec `part.type === 'tool-invocation'` est reçu, THE Activity_API SHALL extraire le `toolName` depuis `part.toolInvocation.toolName` ou `part.toolName`
6. WHEN un outil MCP est détecté (nom commençant par `mcp__`), THE Activity_API SHALL nettoyer le nom en retirant le préfixe `mcp__eureclaw__` pour l'affichage
