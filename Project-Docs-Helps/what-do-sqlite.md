Ce qui est stocké dans SQLite
La base de données SQLite (
messages.db
) contient 7 tables:

1. chats
jid - Identifiant unique du chat
name - Nom du chat/groupe
last_message_time - Timestamp du dernier message
Stocke les métadonnées de tous les chats découverts (pas le contenu des messages).

2. messages
id, chat_jid - Clé primaire composite
sender, sender_name - Qui a envoyé
content - Le contenu du message
timestamp - Quand envoyé
is_from_me - Si c'est toi
is_bot_message - Si c'est un message de l'agent
C'est ici que les conversations sont stockées pour les groupes enregistrés.

3. scheduled_tasks
id, group_folder, chat_jid - Identifiants
prompt - La consigne de la tâche
schedule_type, schedule_value - Cron (ex: weekly, monday 9am)
next_run, last_run - Dates d'exécution
status - active, paused, completed
context_mode - Mode de contexte (isolated)
Les tâches programmées comme "@Andy envoie un résumé chaque matin".

4. task_run_logs
Historique des exécutions de tâches (durée, résultat, erreurs).

5. router_state
État global du routeur:

last_timestamp - Dernier message traité
last_agent_timestamp - Cursor par groupe (pour ne pas re-traiter)
6. sessions
Session Claude par groupe (group_folder → session_id).

7. registered_groups
Les groupes auxquels l'agent répond:

jid, name, folder - Identification
trigger_pattern - Le pattern de déclenchement
requires_trigger - Si @Andy est requis