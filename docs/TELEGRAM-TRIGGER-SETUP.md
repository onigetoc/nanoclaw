# Telegram Trigger Configuration

Guide pour configurer si le bot nécessite `@Andy` pour répondre dans les groupes Telegram.

## Deux niveaux de configuration

Pour que le bot réponde **sans** avoir besoin d'écrire `@Andy` dans un groupe, il faut configurer **DEUX choses**:

### 1. Configuration Telegram (BotFather)

Le bot Telegram doit avoir le "privacy mode" désactivé pour voir tous les messages du groupe.

**Étapes:**
1. Ouvre [@BotFather](https://t.me/botfather) dans Telegram
2. Envoie `/mybots`
3. Choisis ton bot (ex: `@Eureclawbot`)
4. Clique sur "Bot Settings"
5. Clique sur "Group Privacy"
6. Choisis **"Turn off"** (désactiver la confidentialité)

**Explication:**
- **Privacy ON** (défaut): Le bot ne voit que les messages qui commencent par `/` ou qui mentionnent le bot (`@botname`)
- **Privacy OFF**: Le bot voit TOUS les messages du groupe

### 2. Configuration EureClaw (Base de données)

EureClaw doit savoir que le groupe ne nécessite pas de trigger `@Andy`.

**Option A: Via script (recommandé)**

```bash
# Désactiver le trigger pour un groupe spécifique
node scripts/disable-trigger-work.js

# Ou pour n'importe quel groupe
bun tools/sqlite-helper.js store/messages.db "UPDATE registered_groups SET requires_trigger = 0 WHERE folder = 'FOLDER_NAME'"
```

**Option B: Via commande Telegram**

Envoie `/setprivacy` dans le groupe Telegram (si cette commande est implémentée).

**Option C: Manuellement dans la DB**

```sql
UPDATE registered_groups 
SET requires_trigger = 0 
WHERE folder = 'work';
```

### 3. Redémarrer EureClaw

Après avoir changé `requires_trigger` dans la DB, redémarre EureClaw:

```bash
# Si tu utilises bun run dev
# Arrête avec Ctrl+C et relance
bun run dev

# Ou via Telegram
# Envoie /restart dans n'importe quel chat avec le bot
```

## Vérification

Pour vérifier la configuration actuelle:

```bash
bun tools/sqlite-helper.js store/messages.db "SELECT jid, name, folder, requires_trigger FROM registered_groups"
```

**Résultat attendu:**
- `requires_trigger: 0` = Pas besoin de `@Andy`
- `requires_trigger: 1` = Doit écrire `@Andy` pour que le bot réponde

## Activer/Désactiver le trigger

### Désactiver le trigger (bot répond à tout)

**Quand utiliser:** Groupe personnel, chat 1-à-1, tu es seul à parler

```bash
# Via script
node scripts/disable-trigger-work.js

# Ou manuellement
bun tools/sqlite-helper.js store/messages.db "UPDATE registered_groups SET requires_trigger = 0 WHERE folder = 'work'"
```

Puis redémarre EureClaw (`/restart` ou `bun run dev`).

### Activer le trigger (bot répond seulement si mentionné)

**Quand utiliser:** Groupe avec plusieurs personnes, tu veux éviter que le bot réponde à toutes les conversations

```bash
# Activer le trigger pour work
bun tools/sqlite-helper.js store/messages.db "UPDATE registered_groups SET requires_trigger = 1 WHERE folder = 'work'"
```

Puis redémarre EureClaw.

**Important:** Avec `requires_trigger = 1`, tu dois écrire `@Andy` au début de ton message pour que le bot réponde.

## Cas d'usage

**Groupe de travail personnel (juste toi):**
- Privacy OFF + requires_trigger = 0
- Le bot répond à tous les messages sans `@Andy`
- Plus rapide, pas besoin de taper `@Andy` à chaque fois

**Groupe avec plusieurs personnes:**
- Privacy ON + requires_trigger = 1
- Le bot répond seulement quand on écrit `@Andy`
- Évite que le bot réponde à toutes les conversations entre humains
- Les autres peuvent discuter librement sans déclencher le bot

## Dépannage

**Le bot ne répond pas sans `@Andy`:**
1. Vérifie BotFather → Privacy doit être OFF
2. Vérifie la DB → `requires_trigger` doit être 0
3. Redémarre EureClaw
4. Envoie un message test dans le groupe

**Le bot répond deux fois:**
- Vérifie que tu n'as pas deux bots dans le groupe
- Vérifie que tu n'as pas deux instances d'EureClaw qui tournent

**Le `/chatid` donne le mauvais ID:**
- Le groupe a peut-être été supprimé et recréé
- Utilise le nouvel ID pour mettre à jour la DB
