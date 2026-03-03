# Routing Multimodal Intelligent via models.dev API

> Date: 2026-03-02
> Status: À implémenter
> Priorité: Haute — prochaine feature majeure

## Concept Clé

L'API `https://models.dev/api.json` est la source de vérité pour connaître les capacités de chaque modèle OpenCode. Chaque modèle expose ses `modalities` (input/output), ce qui permet de savoir exactement ce qu'il peut traiter.

Le principe : avant d'envoyer un média (image, audio, vidéo, PDF) au modèle courant, on vérifie s'il le supporte. Si non, on route vers un modèle fallback spécialisé qui analyse le média et renvoie une description texte au modèle principal.

## Comment ça marche

1. Lire le modèle courant depuis `opencode.json` → champ `"model"` (ex: `"opencode/big-pickle"`)
2. Chercher ce modèle dans `models.dev/api.json`
3. Lire `modalities.input` pour savoir ce qu'il accepte
4. Router vers un fallback si le média n'est pas supporté

## Exemples concrets depuis l'API

**Modèle text-only (pas de vision):**
```json
"big-pickle": {
  "modalities": {
    "input": ["text"],
    "output": ["text"]
  }
}
```
→ Ne supporte PAS les images. Si l'utilisateur envoie une image, il faut un fallback.

**Modèle multimodal (vision + audio + vidéo):**
```json
"google/gemini-2.5-flash": {
  "modalities": {
    "input": ["text", "image", "video", "audio"],
    "output": ["text"]
  }
}
```
→ Supporte tout. Pas besoin de fallback.

**Modèle embedding (usage spécialisé):**
```json
"google/text-multilingual-embedding-002": {
  "modalities": { ... }
}
```
→ Utilisable pour RAG, recherche sémantique, etc.

## Workflow de routing

```
User envoie un message avec image
  ↓
Lire currentModel depuis opencode.json
  ↓
Chercher dans models.dev/api.json
  ↓
modalities.input contient "image" ?
  ├─ OUI → envoyer directement au modèle courant
  └─ NON → utiliser le modèle fallback image
              ↓
           Analyser l'image avec le fallback
              ↓
           Envoyer la description texte au modèle courant
```

Même logique pour audio, vidéo, PDF, documents.

## Configuration des fallbacks

Dans `models-config.json` ou un futur settings UI :
```json
{
  "fallback": {
    "image": "google/gemini-2.5-flash",
    "audio": "groq/whisper-large-v3",
    "video": "google/gemini-2.5-flash",
    "document": "google/gemini-2.5-flash",
    "embedding": "google/text-multilingual-embedding-002"
  }
}
```

L'utilisateur pourrait choisir ses modèles fallback par type de média dans un settings panel. Grâce à l'API models.dev, on peut filtrer et proposer uniquement les modèles qui supportent le type voulu.

## Autres infos utiles dans l'API

Chaque modèle expose aussi :
- `attachment` (bool) — supporte les pièces jointes
- `reasoning` (bool) — capacité de raisonnement
- `tool_call` (bool) — peut appeler des outils
- `cost` — prix par token (input/output/cache)
- `limit.context` — taille du contexte
- `limit.output` — taille max de sortie
- `knowledge` — date de coupure des connaissances
- `provider.npm` — package AI SDK à utiliser

## Implémentation

### Phase 1: Capabilities checker
- Créer `src/models-capabilities.ts`
- Fetch + cache `models.dev/api.json` (refresh toutes les heures)
- Fonction `canHandle(modelId, mediaType)` → boolean
- Fonction `getFallbackModel(mediaType)` → string

### Phase 2: Routing dans agent-runner
- Avant d'envoyer un message avec média, vérifier les capabilities
- Si le modèle courant ne supporte pas → utiliser fallback
- Envoyer le résultat (description/transcription) au modèle principal

### Phase 3: Settings UI
- Permettre de choisir les modèles fallback par type
- Filtrer les modèles disponibles par capabilities
- Afficher les capabilities du modèle courant

## Bugs Web UI Audio (à corriger séparément)

- Texte transcrit apparaît dans bulle utilisateur au lieu du texte original
- Pas de bulle si audio envoyé sans texte
- ✅ Cursor sur X des attachments corrigé
