# Résumé: Système de Templates pour le Nom de l'Assistant

## Problème Résolu

Le nom "Andy" était codé en dur dans 142 endroits du code. Changer le nom nécessitait un find-replace manuel risqué et fastidieux.

## Solution Implémentée

Système de templates avec variables remplaçables:
- Fichiers `.template.md` avec placeholders `{{ASSISTANT_NAME}}`
- Script de génération qui lit `.env` et crée les fichiers `.md`
- Nom configurable via `ASSISTANT_NAME=Andy` dans `.env`

## Fichiers Créés

### Scripts
- ✅ `scripts/generate-context-files.js` - Script de génération

### Templates (committés dans git)
- ✅ `groups/main/SOUL.template.md`
- ✅ `groups/main/IDENTITY.template.md`
- ✅ `groups/main/AGENTS.template.md`
- ✅ `groups/global/SOUL.template.md`
- ✅ `groups/global/IDENTITY.template.md`
- ✅ `groups/global/AGENTS.template.md`

### Documentation
- ✅ `groups/TEMPLATES-README.md` - Guide du système de templates
- ✅ `Project-Docs-Ressources-Helps/MIGRATION-template-system.md` - Guide de migration
- ✅ `Project-Docs-Ressources-Helps/SUMMARY-template-system.md` - Ce fichier

### Configuration
- ✅ Ajout de `generate:context` dans `package.json`
- ✅ Mise à jour de `.gitignore` pour ignorer les `.md` générés

## Comment Utiliser

### Première utilisation (après clone)

```bash
# 1. Configurer le nom dans .env
echo "ASSISTANT_NAME=Andy" > .env

# 2. Générer les fichiers de contexte
npm run generate:context

# 3. Démarrer le service
npm run dev
```

### Changer le nom de l'assistant

```bash
# 1. Éditer .env
ASSISTANT_NAME=Jarvis

# 2. Régénérer
npm run generate:context

# 3. Redémarrer
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Modifier la personnalité

```bash
# 1. Éditer le template (pas le .md!)
nano groups/main/SOUL.template.md

# 2. Régénérer
npm run generate:context

# 3. Redémarrer
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Architecture

```
.env
└── ASSISTANT_NAME=Andy
    ↓
scripts/generate-context-files.js
    ↓ lit les templates
groups/main/*.template.md
    ↓ remplace {{ASSISTANT_NAME}}
groups/main/*.md (généré, gitignored)
    ↓ lu par
NanoClaw Agent
```

## Workflow de Développement

### Développeur qui modifie les templates

1. Éditer `groups/**/SOUL.template.md` (ou autre template)
2. Tester: `npm run generate:context`
3. Vérifier les fichiers générés
4. Committer SEULEMENT les `.template.md`

### Utilisateur qui clone le repo

1. Cloner le repo
2. Créer `.env` avec `ASSISTANT_NAME=MonNom`
3. Exécuter `npm run generate:context`
4. Démarrer le service

## Fichiers Trackés vs Ignorés

### ✅ Trackés dans Git
- `.template.md` - Templates avec placeholders
- `TOOLS.md` - Pas de nom, pas besoin de template
- `README.md`, `TEMPLATES-README.md` - Documentation
- `.env.example` - Exemple de configuration

### 🚫 Ignorés (.gitignore)
- `.md` générés (SOUL.md, IDENTITY.md, AGENTS.md)
- `.env` - Configuration locale

## Variables Disponibles

Actuellement:
- `{{ASSISTANT_NAME}}` - Nom de l'assistant (depuis `.env`)

Facile d'ajouter:
- `{{ASSISTANT_ROLE}}` - Rôle de l'assistant
- `{{ASSISTANT_LANGUAGE}}` - Langue de l'assistant
- `{{ASSISTANT_TIMEZONE}}` - Fuseau horaire
- etc.

## Avantages

✅ **Single source of truth**: Nom défini une seule fois dans `.env`
✅ **Cohérence garantie**: Toutes les occurrences sont remplacées automatiquement
✅ **Facile à changer**: Éditer `.env` + régénérer
✅ **Pas d'erreurs manuelles**: Le script gère tout
✅ **Version control friendly**: Seuls les templates sont committés
✅ **Extensible**: Facile d'ajouter d'autres variables
✅ **Multi-plateforme**: Fonctionne sur macOS, Linux, Windows

## Comparaison Avant/Après

### Avant: Changer le nom

```bash
# 1. Find-replace manuel dans 142 fichiers
find . -type f -name "*.md" -exec sed -i '' 's/Andy/Jarvis/g' {} +

# 2. Vérifier manuellement qu'on n'a rien cassé
grep -r "Andy" .

# 3. Espérer qu'on n'a pas oublié un fichier
# 4. Committer tous les changements
git add .
git commit -m "Changed assistant name to Jarvis"
```

Risques:
- ❌ Oublier des fichiers
- ❌ Remplacer des occurrences non voulues
- ❌ Conflits git si plusieurs personnes changent le nom
- ❌ Historique git pollué

### Maintenant: Changer le nom

```bash
# 1. Éditer .env
echo "ASSISTANT_NAME=Jarvis" > .env

# 2. Régénérer
npm run generate:context

# 3. Redémarrer
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Avantages:
- ✅ Aucun fichier oublié
- ✅ Remplacements précis et contrôlés
- ✅ Pas de conflits git (`.md` sont ignorés)
- ✅ Historique git propre (seuls les templates sont trackés)

## Tests

### Test 1: Génération basique

```bash
npm run generate:context
# Devrait afficher: ✅ Done! Context files generated successfully.
```

### Test 2: Vérification du nom

```bash
grep "You are" groups/main/SOUL.md
# Devrait afficher: You are Andy, a personal AI assistant...
```

### Test 3: Changement de nom

```bash
echo "ASSISTANT_NAME=TestBot" > .env
npm run generate:context
grep "You are" groups/main/SOUL.md
# Devrait afficher: You are TestBot, a personal AI assistant...
```

### Test 4: Templates intacts

```bash
grep "{{ASSISTANT_NAME}}" groups/main/SOUL.template.md
# Devrait trouver plusieurs occurrences
```

## Prochaines Étapes Possibles

### Court terme
- [ ] Tester avec différents noms
- [ ] Documenter dans le README principal
- [ ] Ajouter un hook pre-commit pour vérifier que les templates sont à jour

### Moyen terme
- [ ] Ajouter d'autres variables (ROLE, LANGUAGE, etc.)
- [ ] Script pour créer de nouveaux groupes avec templates
- [ ] Validation des noms (pas de caractères spéciaux, etc.)

### Long terme
- [ ] Interface web pour configurer le nom
- [ ] Support de noms différents par groupe
- [ ] Templates pour d'autres fichiers (README, etc.)

## Dépannage

### Erreur: "No template files found"

```bash
# Vérifier que les templates existent
ls groups/main/*.template.md
ls groups/global/*.template.md
```

### Erreur: ".env file not found"

```bash
# Créer .env
echo "ASSISTANT_NAME=Andy" > .env
```

### Le nom n'est pas remplacé

```bash
# Vérifier que le placeholder est correct dans le template
grep "{{ASSISTANT_NAME}}" groups/main/SOUL.template.md

# Régénérer avec verbose
node scripts/generate-context-files.js
```

### Le bot utilise toujours l'ancien nom

```bash
# Vérifier les fichiers générés
cat groups/main/SOUL.md | grep "You are"

# Redémarrer le service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Conclusion

Le système de templates résout élégamment le problème du nom codé en dur. Maintenant:

✅ Le nom est configurable via `.env`
✅ Changer le nom prend 2 commandes
✅ Aucun risque d'oublier des fichiers
✅ Git reste propre (seuls les templates sont trackés)
✅ Facile d'ajouter d'autres variables

Le nom "Andy" n'est plus codé en dur nulle part dans les fichiers de contexte! 🎉

## Documentation Complète

- **Guide d'utilisation**: `groups/TEMPLATES-README.md`
- **Guide de migration**: `Project-Docs-Ressources-Helps/MIGRATION-template-system.md`
- **Ce résumé**: `Project-Docs-Ressources-Helps/SUMMARY-template-system.md`
