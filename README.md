<div align="center">

# 📸 Instagram Data Viewer

**Application locale pour importer, parcourir et analyser des archives de données Instagram, avec une application de bureau et une interface web.**

![Statut](https://img.shields.io/badge/statut-en%20test-orange)
![Plateformes](https://img.shields.io/badge/plateformes-Windows%20%7C%20macOS%20%7C%20Linux-blue)

[Instagram du développeur](https://www.instagram.com/noaribote) · [FAQ de démarrage](FAQ.md)

</div>

---

## Sommaire

- [Pourquoi ce projet ?](#pourquoi-ce-projet-)
- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Démarrage rapide](#démarrage-rapide)
- [Application web locale](#application-web-locale)
- [Structure du projet](#structure-du-projet)
- [Stockage et confidentialité](#stockage-et-confidentialité)
- [Compilation](#compilation)
- [État du projet](#état-du-projet)
- [Usage de l’intelligence artificielle](#usage-de-lintelligence-artificielle)
- [Auteur et licence](#auteur-et-licence)

## Pourquoi ce projet ?

<!-- À compléter par l’auteur. -->

## Fonctionnalités

### Archives personnelles

- Importer les dossiers de données Instagram décompressés dans l’application de bureau, ou importer une archive ZIP ou un dossier dans l’application web.
- Parcourir les fichiers JSON de l’archive, les épingler, les filtrer et les rechercher par mots ou expressions.
- Consulter des statistiques calculées à partir de l’archive, notamment les abonnés et abonnements, les relations réciproques, les conversations, les messages envoyés, les stories et diverses interactions lorsque les fichiers correspondants sont présents.
- Comparer les abonnés et abonnements et consulter les contacts, les conversations et les médias importés.
- Copier des fichiers et dossiers vers le répertoire de données dans l’application de bureau; supprimer les fichiers non JSON pour libérer de l’espace.

### Profils publics

- Rechercher des informations accessibles sur les profils Instagram publics et conserver les résultats en cache local.
- Dans l’application de bureau, consulter le profil et télécharger les stories, contenus À la une, publications et reels accessibles via le service StoriesIG piloté avec Playwright.

La disponibilité des données dépend d’Instagram et des services tiers utilisés. Le téléchargement de stories, contenus À la une, publications et reels est une fonction de l’application de bureau; l’interface web ne propose pas ce téléchargement automatisé.

## Stack technique

| Partie | Technologies et rôle |
| --- | --- |
| Application de bureau | Electron, HTML, CSS et JavaScript; interface locale et accès aux fichiers via IPC sécurisé avec `contextIsolation`. |
| Interface web | HTML, CSS et JavaScript vanilla; application responsive servie par un petit serveur HTTP Node.js. |
| Stockage web | IndexedDB dans le navigateur pour les archives importées, leur index et les préférences de navigation. |
| Services de profils | Node.js et Python avec Instaloader pour récupérer les informations de profil accessibles; cache JSON dans `model/users/`. |
| Téléchargement de médias de profils (bureau) | Playwright et Chromium pour piloter StoriesIG; `ffmpeg` est utilisé pour convertir certains médias HEIC. |
| Packaging bureau | `electron-builder`, avec des cibles Windows (NSIS), macOS (DMG et ZIP) et Linux (AppImage et DEB). |

## Démarrage rapide

### Prérequis

- Node.js avec npm.
- Python **3.10 ou plus récent**.
- Une connexion Internet lors du premier lancement pour installer les dépendances Python et, si nécessaire, Node.js ainsi que Chromium pour Playwright.

### Lancer l’application de bureau

1. Extrayez le projet téléchargé.
2. Sous Windows 10 ou 11, lancez `start.bat`.
3. Sous macOS ou Linux, ouvrez un terminal à la racine du projet et lancez :

   ```sh
   ./start.sh
   ```

   Si nécessaire, utilisez `chmod +x start.sh`, puis relancez la commande, ou lancez directement `bash start.sh`.

Les scripts vérifient les prérequis, créent `.venv`, installent `instaloader` et `playwright`, installent Chromium pour Playwright, installent les dépendances npm avec `npm ci` si `node_modules` est absent, puis démarrent Electron. Ils utilisent Python 3.10 ou plus récent. La variable d’environnement `PYTHON` permet de préciser l’interpréteur Python.

Pour démarrer directement sans script, installez les dépendances npm avec `npm ci`, puis lancez `npm start`. Dans ce cas, les dépendances Python doivent être installées pour l’interpréteur utilisé par l’application; configurez `PYTHON` au besoin.

Consultez [FAQ.md](FAQ.md) pour les problèmes d’installation. La conversion et l’aperçu HEIC nécessitent également `ffmpeg`, qui n’est pas installé par les scripts de démarrage.

## Application web locale

L’interface web est une application distincte de la fenêtre Electron, située dans `.web/`. Elle est servie par un serveur Node.js sans framework externe et s’utilise dans un navigateur sur le même ordinateur.

### Lancer le site

Depuis la racine du dépôt :

```sh
node .web/server.js
```

Le serveur écoute par défaut sur `127.0.0.1:8000`. Ouvrez <http://127.0.0.1:8000>. Vous pouvez modifier le port en définissant la variable d’environnement `PORT` avant le lancement.

### Importer et consulter une archive

Depuis l’accueil, choisissez un fichier ZIP ou un dossier Instagram décompressé; sur ordinateur, vous pouvez aussi déposer les fichiers dans la zone d’import. Le contenu de l’archive est traité dans le navigateur : les fichiers JSON sont indexés pour la consultation et la recherche, tandis que les autres fichiers sont conservés pour l’affichage et le téléchargement des médias importés. Les archives ne sont pas téléversées au serveur local.

Après l’import, l’interface permet de rechercher dans les données, consulter des vues de statistiques, parcourir les conversations et contacts, afficher les médias, filtrer et épingler des fichiers, supprimer des fichiers et libérer l’espace occupé. L’index et les données importées sont conservés dans IndexedDB pour l’origine du site; l’interface affiche une progression de la préparation de cet index au démarrage.

### Profils publics dans la version web

La section **Autres utilisateurs** appelle l’API fournie par `.web/server.js`. Le serveur utilise les scripts et modules Python du projet principal pour récupérer des informations accessibles sur un profil, puis conserve le cache dans `model/users/`. Le cache des profils est partagé avec l’application de bureau lorsque les deux versions utilisent le même dossier de projet. Python et `instaloader` doivent donc être disponibles; le serveur choisit `.venv` s’il existe, ou l’interpréteur indiqué par `PYTHON`.

Le serveur écoute uniquement sur l’interface locale `127.0.0.1`. Cette API concerne les profils publics; elle ne reçoit pas les archives importées dans IndexedDB.

### Limites et données du navigateur

Le téléchargement automatisé des stories, contenus À la une, reels et publications repose sur les services Python/Playwright de l’application de bureau et n’est pas proposé dans l’interface web. La consultation des archives déjà importées, les statistiques, la recherche dans les JSON, les contacts, les conversations et les médias importés fonctionnent dans le navigateur.

Les archives web sont associées au navigateur et à l’adresse du site. Elles ne sont synchronisées ni avec Electron ni avec d’autres appareils. Effacer les données du site dans les paramètres du navigateur supprime également ces archives et leur index.

## Structure du projet

```text
.
├── .web/                        # Interface navigateur et serveur HTTP/API local
│   ├── assets/                  # Styles et images propres à l’interface web
│   ├── controllers/             # Contrôleur de l’application web
│   ├── models/                  # Import, stockage IndexedDB et recherche côté navigateur
│   ├── views/                   # Construction et rendu des vues web
│   ├── index.html               # Point d’entrée web
│   └── server.js                # Serveur statique local et API de profils
├── assets/                      # Styles, images et icônes de l’application de bureau
├── controllers/                 # Contrôleurs Electron et vues de bureau
├── models/                      # Accès au modèle local, copie, runtime Python et médias
├── services/                    # Scripts Python de profils et téléchargement de médias
├── views/                       # Pages et scripts de l’interface Electron
│   ├── js/                      # Vues de l’interface de bureau
│   └── pages/                   # Pages statistiques, contacts, messages et profils
├── FAQ.md                       # Dépannage du démarrage
├── main.js                      # Entrée de l’application Electron
├── preload.js                   # API sécurisée entre Electron et l’interface
├── renderer.js                  # Assemblage des contrôleurs de rendu
├── package.json                 # Dépendances et commandes npm
├── start.bat                    # Installation et lancement sous Windows
└── start.sh                     # Installation et lancement sous macOS/Linux
```

Les données importées par l’application de bureau se trouvent dans `model/`; ce dossier est créé à l’usage et est ignoré par Git. Le cache des profils est notamment dans `model/users/`.

## Stockage et confidentialité

Les archives importées dans l’application de bureau sont copiées dans le dossier local `model/`. Elles ne sont pas téléversées par l’application. Vous pouvez ouvrir ce dossier depuis l’application et supprimer les données de votre appareil.

Dans l’application web, les archives et leur index restent dans IndexedDB du navigateur pour l’adresse utilisée. Le serveur local ne reçoit pas ces archives. Les recherches et statistiques sur les archives importées se font dans le navigateur.

La recherche de profils publics et le service StoriesIG nécessitent toutefois un accès Internet : ils contactent Instagram ou le service tiers concerné. Les informations récupérées et les médias téléchargés sont conservés dans le dossier local du projet. L’affirmation « aucune donnée ne quitte l’appareil » ne s’applique donc pas à ces fonctions en ligne.

## Compilation

Depuis la racine du projet, installez les dépendances si nécessaire, puis lancez la commande voulue :

```sh
npm ci
npm run build
```

Commandes ciblées par système :

```sh
npm run build:win
npm run build:mac
npm run build:linux
```

Pour demander une compilation pour les trois systèmes :

```sh
npx electron-builder --mac --win --linux
```

Le temps de compilation dépend de la machine et du système. Consultez la documentation d’[electron-builder](https://www.electron.build/).

## État du projet

Le logiciel est en phase de test. Une version stable est disponible, mais des imprévus peuvent survenir. La première version officielle d’**Instagram Data Viewer** est annoncée pour le **1er décembre 2026**.

Suivez les nouveautés sur Instagram : [@noaribote](https://www.instagram.com/noaribote).

## Usage de l’intelligence artificielle

Ce logiciel a été conçu et pensé par un humain. Chacun de ses programmes a été créé de manière indépendante par l’auteur.

L’intelligence artificielle a toutefois constitué un atout majeur dans le développement de cette application. Elle a réutilisé l’ensemble des codes indépendants produits par l’auteur, ainsi que ses instructions, afin de concevoir le logiciel « Instagram Data Viewer » avec les technologies choisies par ce dernier.

## Auteur et licence

**RIBOTE--MORAL Noa** : [Portfolio](https://noaribote.fr) · [LinkedIn](https://www.linkedin.com/in/ribote-noa)

Le projet déclare la licence de **license.md** dans `package.json`. Consultez [license.md](license.md) pour les conditions de licence détaillées.
