# Media Handling Module

Ce module gère tous les types de médias dans NanoClaw : audio, images, vidéos, et documents.

## Structure

```
src/media/
├── types.ts              # Types TypeScript
├── mime-detection.ts     # Détection MIME (3 couches)
├── transcription.ts      # Gestionnaire de transcription
├── audio-manager.ts      # Singleton pour accès facile
├── index.ts              # Exports
└── providers/
    └── groq.ts           # Provider Groq Whisper
```

## Utilisation

### Détection MIME

```typescript
import { MimeDetector } from './media/mime-detection';

const result = MimeDetector.detect(buffer, 'voice.ogg');
console.log(result);
// {
//   mimeType: 'audio/ogg',
//   kind: 'audio',
//   isBinary: true,
//   confidence: 'high'
// }
```

### Transcription audio

```typescript
import { getTranscriptionManager } from './media/audio-manager';

const manager = getTranscriptionManager();
if (manager) {
  const result = await manager.transcribe(buffer, 'voice.ogg', 'fr');
  console.log(result.text); // "Transcription du message"
}
```

## Configuration

Variables d'environnement dans `.env` :

```bash
# Enable audio transcription
AUDIO_ENABLED=true

# Provider: groq (free), openai (paid), local
AUDIO_PROVIDER=groq

# Groq API key (get from https://console.groq.com)
GROQ_API_KEY=gsk_...

# Model: whisper-large-v3 or whisper-large-v3-turbo (faster)
GROQ_WHISPER_MODEL=whisper-large-v3-turbo

# Strip binary after transcription (prevents token waste)
AUDIO_STRIP_AFTER_TRANSCRIPT=true
```

## Formats supportés

### Audio
- OGG/Opus (Telegram voice messages)
- MP3
- WAV
- FLAC
- M4A/AAC
- WebM

### Images (à venir)
- PNG
- JPEG
- GIF
- WebP

### Documents (à venir)
- PDF
- Word (DOC, DOCX)
- Excel (XLS, XLSX)
- Text (TXT, MD)

## Détection MIME : 3 couches de défense

Pour éviter le bug "Audio Binary Injection" d'OpenClaw :

1. **Layer 1: Extension check** - Rapide, vérifie l'extension du fichier
2. **Layer 2: Magic bytes** - Fiable, vérifie les signatures binaires
3. **Layer 3: Content analysis** - Fallback, analyse le contenu

## Providers de transcription

### Groq Whisper (Recommandé - GRATUIT)
- 2000 requêtes/jour
- 8 heures d'audio/jour
- Pas de carte de crédit
- Modèles : `whisper-large-v3`, `whisper-large-v3-turbo`

### OpenAI Whisper (Fallback - Payant)
- ~$0.006 par minute
- Modèle : `whisper-1`

### Local (À venir)
- whisper-cpp
- Pas de coût
- Nécessite installation locale

## Gestion des erreurs

```typescript
try {
  const result = await manager.transcribe(buffer, filename);
} catch (error) {
  switch (error.code) {
    case 'RATE_LIMIT':
      // Groq rate limit hit, retry after error.retryAfter seconds
      break;
    case 'FILE_TOO_LARGE':
      // File > 25MB (Whisper limit)
      break;
    case 'TIMEOUT':
      // Transcription took too long
      break;
    case 'UNSUPPORTED_FORMAT':
      // Audio format not supported
      break;
    case 'API_ERROR':
      // API error from provider
      break;
  }
}
```

## Développement futur

- [ ] Support images (OCR, description)
- [ ] Support vidéos (extraction audio + transcription)
- [ ] Support documents (PDF parsing, OCR)
- [ ] Cache des transcriptions
- [ ] Métriques et monitoring
- [ ] Provider local whisper-cpp
- [ ] Compression audio avant envoi

## Tests

```bash
# Run tests (à implémenter)
npm test src/media/
```

## Documentation

Voir aussi :
- `dev-notes/openclaw-audio-research.md` - Recherche OpenClaw
- `dev-notes/openclaw-mime-detection.md` - Détails MIME
- `dev-notes/audio-implementation-summary.md` - Résumé implémentation
