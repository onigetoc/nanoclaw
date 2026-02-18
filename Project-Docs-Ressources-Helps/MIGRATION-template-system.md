# Migration vers le Système de Templates

## Contexte

Le nom de l'assistant "Andy" était codé en dur dans 142 endroits du code. Nous avons créé un système de templates pour rendre le nom configurable via `.env`.

## Ce qui a changé

### Avant
```
groups/main/AGENTS.md  (Andy codé en dur)
groups/main/SOUL.md    (Andy codé en dur)
groups/main/IDENTITY.md (Andy codé en dur)
```

### Maintenant
```
groups/main/AGENTS.template.md    ({{ASSISTANT_NAME}})
groups/main/SOUL.template.md      ({{ASSISTANT_NAME}})
groups/main/IDENTITY.template.md  ({{ASSISTANT_NAME}})
↓ npm run generate:context
groups/main/AGENTS.md    (Andy - généré, gitignored)
groups/main/SOUL.md      (Andy - généré, gitignored)
groups/main/IDENTITY.md  (Andy - généré, gitignored)
```

## Étapes de Migration

### 1. Sauvegarder les fichiers existants (si modifiés)

Si vous avez personnalisé vos fichiers SOUL.md, IDENTITY.md ou AGENTS.md:

```bash
# Sauvegarder vos modifications
cp groups/main/SOUL.md groups/main/SOUL.backup.md
cp groups/main/IDENTITY.md groups/main/IDENTITY.backup.md
cp groups/main/AGENTS.md groups/main/AGENTS.backup.md
```

### 2. Les fichiers templates sont déjà créés

Les fichiers `.template.md` ont été créés avec `{{ASSISTANT_NAME}}` à la place de "Andy".

### 3. Générer les fichiers de contexte

```bash
npm run generate:context
```

Sortie attendue:
```
🔧 Generating context files from templates...

📝 Assistant name: Andy

Found 6 template file(s):

  ✓ groups/main/SOUL.template.md → groups/main/SOUL.md
  ✓ groups/main/IDENTITY.template.md → groups/main/IDENTITY.md
  ✓ groups/main/AGENTS.template.md → groups/main/AGENTS.md
  ✓ groups/global/SOUL.template.md → groups/global/SOUL.md
  ✓ groups/global/IDENTITY.template.md → groups/global/IDENTITY.md
  ✓ groups/global/AGENTS.template.md → groups/global/AGENTS.md

✅ Done! Context files generated successfully.

💡 To change the assistant name, edit ASSISTANT_NAME in .env and run this script again.
```

### 4. Vérifier les fichiers générés

```bash
# Vérifier que le nom est correct
grep "You are" groups/main/SOUL.md
# Devrait afficher: You are Andy, a personal AI assistant...

grep "Name:" groups/main/IDENTITY.md
# Devrait afficher: - **Name**: Andy
```

### 5. Comparer avec vos sauvegardes (si applicable)

Si vous aviez des modifications personnalisées:

```bash
diff groups/main/SOUL.backup.md groups/main/SOUL.md
```

Reportez vos modifications dans les fichiers `.template.md` correspondants.

### 6. Tester le changement de nom

```bash
# Changer le nom dans .env
echo "ASSISTANT_NAME=Jarvis" >> .env

# Régénérer
npm run generate:context

# Vérifier
grep "You are" groups/main/SOUL.md
# Devrait afficher: You are Jarvis, a personal AI assistant...

# Remettre Andy si vous voulez
echo "ASSISTANT_NAME=Andy" > .env
npm run generate:context
```

### 7. Redémarrer le service

```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Ou rebuild container
./container/build.sh
```

## Workflow Futur

### Pour modifier la personnalité/identité

1. **Éditer les fichiers `.template.md`** (pas les `.md`!)
   ```bash
   # Exemple: modifier la personnalité
   nano groups/main/SOUL.template.md
   ```

2. **Régénérer les fichiers**
   ```bash
   npm run generate:context
   ```

3. **Redémarrer le service**
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```

### Pour changer le nom de l'assistant

1. **Éditer .env**
   ```bash
   ASSISTANT_NAME=NouveauNom
   ```

2. **Régénérer**
   ```bash
   npm run generate:context
   ```

3. **Redémarrer**
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```

## Fichiers à Éditer vs Fichiers Générés

### ✏️ À Éditer (committé dans git)
- `.env` - Configuration
- `groups/**/SOUL.template.md` - Templates de personnalité
- `groups/**/IDENTITY.template.md` - Templates d'identité
- `groups/**/AGENTS.template.md` - Templates d'instructions
- `groups/**/TOOLS.md` - Liste des outils (pas de template)

### 🚫 Ne PAS Éditer (généré, gitignored)
- `groups/**/SOUL.md` - Généré depuis template
- `groups/**/IDENTITY.md` - Généré depuis template
- `groups/**/AGENTS.md` - Généré depuis template

## Vérification Post-Migration

### Test 1: Le nom est-il correct?

```bash
# Chercher toutes les occurrences du nom
grep -r "Andy" groups/main/*.md groups/global/*.md

# Devrait trouver le nom dans:
# - SOUL.md (généré)
# - IDENTITY.md (généré)
# - AGENTS.md (généré)
```

### Test 2: Les templates sont-ils corrects?

```bash
# Chercher les placeholders dans les templates
grep -r "{{ASSISTANT_NAME}}" groups/main/*.template.md groups/global/*.template.md

# Devrait trouver plusieurs occurrences
```

### Test 3: Le bot répond-il avec le bon nom?

Envoyez un message au bot et vérifiez qu'il se présente correctement.

## Rollback (si problème)

Si quelque chose ne fonctionne pas:

```bash
# 1. Restaurer vos sauvegardes
cp groups/main/SOUL.backup.md groups/main/SOUL.md
cp groups/main/IDENTITY.backup.md groups/main/IDENTITY.md
cp groups/main/AGENTS.backup.md groups/main/AGENTS.md

# 2. Redémarrer
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Avantages du Nouveau Système

✅ **Nom configurable**: Changez le nom en éditant `.env`
✅ **Pas de find-replace manuel**: Le script gère tout
✅ **Cohérence garantie**: Toutes les occurrences sont remplacées
✅ **Extensible**: Facile d'ajouter d'autres variables
✅ **Version control friendly**: Seuls les templates sont committés

## Questions Fréquentes

### Q: Dois-je régénérer à chaque démarrage?

Non. Les fichiers `.md` générés persistent. Régénérez seulement quand:
- Vous changez `ASSISTANT_NAME` dans `.env`
- Vous modifiez un fichier `.template.md`
- Vous clonez le repo pour la première fois

### Q: Puis-je éditer les fichiers .md directement?

Techniquement oui, mais vos modifications seront écrasées la prochaine fois que vous exécutez `npm run generate:context`. Éditez toujours les `.template.md`.

### Q: Que se passe-t-il si j'oublie de régénérer?

Le bot utilisera les anciens fichiers `.md`. Si vous avez changé le nom dans `.env` mais pas régénéré, le bot utilisera toujours l'ancien nom.

### Q: Puis-je avoir des noms différents par groupe?

Actuellement non, `ASSISTANT_NAME` est global. Mais vous pourriez:
1. Créer des variables spécifiques: `MAIN_ASSISTANT_NAME`, `GLOBAL_ASSISTANT_NAME`
2. Modifier le script pour les supporter
3. Utiliser des templates différents par groupe

### Q: Le script fonctionne-t-il sur Windows?

Oui, le script est en Node.js et fonctionne sur toutes les plateformes.

## Support

Si vous rencontrez des problèmes:

1. Vérifiez que `.env` existe et contient `ASSISTANT_NAME`
2. Vérifiez que les fichiers `.template.md` existent
3. Exécutez `npm run generate:context` et lisez les erreurs
4. Consultez `groups/TEMPLATES-README.md` pour plus de détails

## Prochaines Étapes

Après la migration, vous pouvez:

1. **Personnaliser votre assistant**: Éditez les `.template.md`
2. **Changer le nom**: Éditez `.env` et régénérez
3. **Ajouter des variables**: Suivez le guide dans `TEMPLATES-README.md`
4. **Créer de nouveaux groupes**: Copiez les templates et régénérez

Bienvenue dans le nouveau système de templates! 🎉
