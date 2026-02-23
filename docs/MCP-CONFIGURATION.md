# Configuration des serveurs MCP pour EureClaw

## Qu'est-ce que MCP?

MCP (Model Context Protocol) permet à l'agent AI d'accéder à des outils et contextes externes:
- Bases de connaissances (documentation, APIs)
- Systèmes de fichiers
- Bases de données
- Services web
- Outils personnalisés

## Fichier de configuration

Les serveurs MCP sont configurés dans `opencode.json` à la racine du projet.

## Comment ajouter un serveur MCP

### 1. Ouvrir opencode.json

Le fichier contient déjà une section `"mcp"` avec des exemples commentés.

### 2. Choisir le type de serveur

**Local** - Exécute une commande/script sur votre machine:
```json
{
  "mcp": {
    "mon-serveur": {
      "type": "local",
      "command": ["npx", "-y", "package-name"],
      "enabled": true
    }
  }
}
```

**Remote** - Se connecte à un service HTTP/HTTPS:
```json
{
  "mcp": {
    "mon-serveur": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### 3. Exemples pratiques

#### Context7 (Documentation AI)
```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer sk-context7-xxx..."
      }
    }
  }
}
```

#### shadcn/ui (Composants React)
```json
{
  "mcp": {
    "shadcn": {
      "type": "local",
      "command": ["npx", "-y", "shadcn@latest", "mcp"],
      "enabled": true
    }
  }
}
```

#### GitHub
```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "enabled": true,
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx..."
      }
    }
  }
}
```

#### PostgreSQL
```json
{
  "mcp": {
    "postgres": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "enabled": true,
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }
}
```

### 4. Activer/Désactiver un serveur

Changez `"enabled"` à `true` ou `false`:
```json
{
  "mcp": {
    "mon-serveur": {
      "enabled": false  // Désactivé
    }
  }
}
```

### 5. Redémarrer EureClaw

Après modification de `opencode.json`, redémarrez EureClaw pour appliquer les changements:

**Windows:**
```powershell
# Arrêter
Stop-Process -Name "node" -Force

# Redémarrer
.\start-eureclaw-supervised.ps1
```

**macOS/Linux:**
```bash
# Arrêter
pkill -f eureclaw

# Redémarrer
./start-eureclaw.sh
```

## Vérification

Pour vérifier que vos serveurs MCP sont chargés:

1. Envoyez un message à Andy via Telegram/WhatsApp
2. Demandez: "Quels outils MCP as-tu disponibles?"
3. L'agent devrait lister les serveurs MCP actifs

## Trouver des serveurs MCP

- **Registre officiel:** https://github.com/modelcontextprotocol/servers
- **NPM:** Cherchez `@modelcontextprotocol/server-*`
- **Communauté:** https://mcp.harishgarg.com/

## Dépannage

### Le serveur ne se charge pas

1. Vérifiez la syntaxe JSON (pas de virgules manquantes)
2. Vérifiez que `"enabled": true`
3. Pour les serveurs locaux, testez la commande manuellement:
   ```bash
   npx -y package-name
   ```
4. Pour les serveurs remote, vérifiez l'URL et les credentials

### Erreur d'authentification

- Vérifiez que votre API key est valide
- Testez avec curl:
  ```bash
  curl -H "Authorization: Bearer YOUR_KEY" https://api-url.com/mcp
  ```

### Voir les logs

Les logs OpenCode sont dans:
- **Windows:** `%USERPROFILE%\.config\opencode\logs\`
- **macOS/Linux:** `~/.config/opencode/logs/`

## Sécurité

⚠️ **Important:**
- Ne commitez JAMAIS `opencode.json` avec des API keys
- Utilisez `.env` pour les secrets sensibles
- Ajoutez `opencode.json` à `.gitignore` si nécessaire

## Exemples complets

Voir `opencode.json.example` pour plus d'exemples de configuration.
