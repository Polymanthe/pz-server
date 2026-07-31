# Project Zomboid Dedicated Server

Déploiement Docker Compose portable d'un serveur dédié Project Zomboid. Le même dépôt fonctionne sur Linux amd64 et macOS Apple Silicon.

Chaque déploiement possède ses propres volumes et son propre monde. Le projet ne synchronise ni les sauvegardes ni les données entre les déploiements.

## Architecture

- Un service Project Zomboid basé sur une image communautaire maintenue et épinglée.
- Deux ports de jeu publiés en UDP.
- RCON utilisé en interne pour les arrêts gracieux, sans publication sur l'hôte.
- Un healthcheck RCON qui vérifie que le serveur répond réellement.
- Deux volumes Docker nommés pour les binaires et les données du monde.
- Une configuration `.env` locale par déploiement.
- Une limite de mémoire Docker distincte de la mémoire maximale de la JVM.

Le serveur officiel Linux est un workload amd64. `platform: linux/amd64` reste donc défini, y compris sur un hôte ARM.

## Prérequis

- Docker Engine avec Docker Compose v2 ou Docker Desktop.
- `mise` pour installer la version de Task épinglée par le projet.
- OpenSSL pour générer les mots de passe initiaux.
- Au moins 10 Go de RAM Docker disponibles pour le pack complet actuel.
- Au moins 15 Go d'espace disque disponible pour le serveur et les mods.
- Les ports `16261/udp` et `16262/udp` disponibles.

Docker est un prérequis système et n'est pas installé par mise.

## Démarrage Rapide

```bash
mise install
task init
task doctor
task up
```

`task init` crée un `.env` non commité avec des mots de passe administrateur et RCON aléatoires. Vérifier ensuite les valeurs de capacité dans `.env`, en particulier :

```dotenv
MAX_PLAYERS=8
MEMORY_XMX_GB=6
CONTAINER_MEMORY_LIMIT=10G
CONTAINER_CPU_LIMIT=4.0
```

Le premier démarrage télécharge automatiquement les fichiers du serveur dans le volume `server-files`, puis génère la configuration et le monde dans `server-data`. Il peut prendre plusieurs minutes.

Suivre l'initialisation :

```bash
task logs
```

Afficher l'état du serveur :

```bash
task status
```

## Commandes

| Commande | Description |
|---|---|
| `task init` | Crée `.env` sans écraser une configuration existante |
| `task doctor` | Vérifie Docker, Compose et la compatibilité de l'hôte |
| `task config` | Valide la configuration Compose résolue |
| `task pull` | Télécharge l'image épinglée |
| `task up` | Démarre le serveur et attend son état healthy |
| `task logs` | Suit les logs du serveur |
| `task status` | Affiche le statut et le healthcheck |
| `task rcon COMMAND=players` | Exécute une commande RCON sans exposer RCON sur l'hôte |
| `task stop` | Sauvegarde et arrête proprement le serveur |
| `task down` | Retire le conteneur sans supprimer les volumes |
| `task update` | Met à jour explicitement les fichiers du serveur |
| `task reset CONFIRM=reset` | Supprime définitivement le monde local et réinitialise le serveur |

Ne jamais utiliser `docker compose down --volumes` pour un serveur contenant un monde à conserver.

## Configuration

`.env.example` documente toutes les variables prises en charge. Chaque déploiement utilise son propre `.env` et peut adapter ses ressources sans modifier `compose.yaml`.

Réglages indicatifs :

| Profil | JVM | Limite Docker | Joueurs |
|---|---:|---:|---:|
| Pack complet | 6 Go | 10 Go | 4 à 12 |
| Pack réduit | 4 Go | 6 Go | 4 à 8 |
| Grande capacité | 8 à 16 Go | 12 à 20 Go | 16 à 32 |

`MEMORY_XMX_GB` contrôle le heap Java. `CONTAINER_MEMORY_LIMIT` doit être supérieur afin de laisser de la mémoire aux allocations natives, à Steam et au système du conteneur.

`SERVER_BRANCH` vide utilise la branche stable. `UPDATE_ON_START=false` évite une mise à jour surprise d'un monde existant. Les fichiers manquants sont néanmoins toujours téléchargés au premier démarrage.

## Mods Steam Workshop

Le pack de mods est une configuration déclarative versionnée dans Git. Steam n'est utilisé que sur une machine avec le client Steam installé pour inventorier les abonnements ; chaque déploiement télécharge ensuite les mêmes items dans ses propres volumes serveur.

Project Zomboid distingue deux identifiants :

- Un **Workshop ID** numérique identifie un item Steam à télécharger.
- Un **modId** active un module PZ. Un item Workshop peut contenir plusieurs `modId` et un `modId` peut dépendre d'autres modules.

Le projet génère donc séparément `WorkshopItems` et `Mods` dans `Server/${SERVER_NAME}.ini`. RCON et les fichiers de sauvegarde ne sont pas exposés.

### Synchroniser Les Abonnements

Après avoir ajouté ou retiré un abonnement dans Steam sur le Mac :

```bash
task mods:sync
task mods:list
task mods:plan
```

`task mods:list` affiche les Workshop IDs, les `modId`, les dépendances et une URL Steam par item :

```text
3152529790 [installed] 93chevySuburban, 93chevySuburbanExpanded
https://steamcommunity.com/sharedfiles/filedetails/?id=3152529790
  - 93chevySuburban: 93 Chevrolet Suburban / Silverado (requires: damnlib)
```

Les fichiers suivants doivent être relus puis commités :

| Fichier | Rôle |
|---|---|
| `mods/catalog.lock.json` | Inventaire généré depuis Steam |
| `mods/enabled.toml` | Sélection humaine du pack |
| `mods/resolved.env` | Valeurs PZ générées, injectées par Compose |
| `mods/resolved.json` | Vue lisible du pack résolu et de ses URL |

### Sélectionner Le Pack

La configuration initiale active tous les items installés localement :

```toml
[selection]
mode = "all"
include = []
exclude = []
```

Pour désactiver temporairement un item tout en restant en mode `all`, ajouter son Workshop ID à `exclude`, puis lancer `task mods:generate`.

Le pack initial exclut Neat Building (`3536052310`) et son addon (`3540503606`) : le premier fournit un fichier de tiles legacy rejeté par Build 42.20.

Pour maintenir une liste stricte, basculer vers `explicit` et renseigner `include` :

```toml
[selection]
mode = "explicit"
include = ["3152529790", "3171167894"]
exclude = []
```

La résolution ajoute automatiquement les dépendances de chaque `modId`, refuse les dépendances absentes, les cycles et les `modId` présents dans plusieurs Workshop items.

### Appliquer Un Changement

```bash
task mods:plan
task mods:apply CONFIRM=mods
task mods:verify
```

`mods:apply` reconstruit la surcouche locale, applique le manifeste avant le démarrage de Project Zomboid, attend le healthcheck RCON et laisse le jeu télécharger les Workshop items nécessaires. La confirmation est obligatoire : l'ajout, la suppression ou la mise à jour d'un mod peut rendre un monde existant incompatible.

Sur un monde à conserver, effectuer une sauvegarde du volume `server-data` avant de retirer un mod. Les mods de carte ne sont pas pris en charge par ce flux : ils nécessitent une gestion explicite de `Map=` et des régions de spawn.

Steam Workshop ne permet pas de verrouiller facilement une version précise d'un mod. `mods/catalog.lock.json` permet de voir les changements de catalogue, mais redémarrer le serveur peut télécharger une mise à jour publiée par un auteur de mod. Tester les mises à jour sur le monde de développement avant de les appliquer au serveur de jeu.

## Données

| Volume | Contenu |
|---|---|
| `server-files` | Installation du serveur et fichiers Workshop |
| `server-data` | Configuration, joueurs, base de données et sauvegarde du monde |

Les volumes sont locaux au Docker Engine. Des déploiements distincts peuvent utiliser les mêmes noms de volumes et les mêmes ports sans collision. Aucun nom de projet Compose ou namespace propre à la machine n'est nécessaire.

## Apple Silicon

L'image et Project Zomboid sont amd64. Sur un Mac Apple Silicon, configurer Docker Desktop ainsi :

1. Ouvrir **Settings > General**.
2. Sélectionner **Apple Virtualization framework** comme Virtual Machine Manager.
3. Activer **Use Rosetta for x86_64/amd64 emulation on Apple Silicon**.
4. Appliquer les changements et redémarrer Docker Desktop.

Docker VMM ne prend actuellement pas en charge Rosetta. L'émulation QEMU peut être lente et DepotDownloader peut segfault pendant l'installation. `task doctor` détecte une désactivation explicite de Rosetta.

## Réseau

Ouvrir ou rediriger les ports suivants sur l'hôte et le routeur :

| Port | Protocole | Usage |
|---|---|---|
| `16261` | UDP | Connexion principale |
| `16262` | UDP | Connexion directe des joueurs |

RCON écoute dans le conteneur sur `27015/tcp`, mais n'est pas publié sur l'hôte.

## Connexion

Dans Project Zomboid, ajouter un favori avec l'adresse IP de l'hôte et le port `16261`. Sur un réseau local, utiliser l'adresse privée de la machine ; depuis Internet, utiliser son IPv4 publique et configurer la redirection UDP correspondante.
