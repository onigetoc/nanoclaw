---
name: web-search
description: Effectue des recherches sur le web et fournit les résultats. Utilise ce skill quand l'utilisateur demande de chercher des informations en ligne, faire des recherches web, trouver des articles, ou obtenir des informations actuelles sur un sujet.
---

# Recherche Web

Ce skill permet à l'agent de faire des recherches sur le web et de fournir les résultats à l'utilisateur.

## Fonctionnalités

- Recherche d'informations actuelles sur le web
- Extraction de contenu depuis des URLs spécifiques
- Synthèse des résultats de recherche
- Vérification de sources multiples

## Utilisation

Quand l'utilisateur demande une recherche web, utilise les outils disponibles:

1. **remote_web_search** - Pour chercher des informations
   - Reformule la requête de l'utilisateur pour optimiser les résultats
   - Fais plusieurs recherches si nécessaire pour couvrir le sujet
   - Priorise les sources récentes et officielles

2. **webFetch** - Pour lire le contenu complet d'une page
   - Utilise après avoir trouvé des URLs pertinentes
   - Mode "truncated" pour un aperçu rapide
   - Mode "full" pour le contenu complet
   - Mode "selective" pour chercher des informations spécifiques

## Workflow

1. Comprendre la demande de l'utilisateur
2. Faire une ou plusieurs recherches web
3. Analyser les résultats (titres, snippets, dates)
4. Si nécessaire, lire le contenu complet des pages les plus pertinentes
5. Synthétiser les informations trouvées
6. Présenter les résultats avec les sources

## Bonnes Pratiques

- Toujours citer les sources avec des liens
- Vérifier la date de publication des informations
- Privilégier les sources officielles et fiables
- Faire plusieurs recherches pour des sujets complexes
- Résumer les informations de manière claire et concise
- Ne jamais reproduire plus de 30 mots consécutifs d'une source

## Exemples de Requêtes

- "Cherche les dernières nouvelles sur [sujet]"
- "Trouve des informations sur [technologie/librairie]"
- "Recherche la documentation de [outil]"
- "Quelles sont les meilleures pratiques pour [tâche]?"
- "Compare [option A] et [option B]"
