# Logiciel en phase de TEST

**Version stable** disponible. Néanmoins, des potentielles imprévisibilités peuvent survenir.
- La première version officielle de **Instagram Data Viewer** vous sera disponible le **1er décembre 2026**.
> Tenez-vous informé des nouveautés sur l'Instagram du développeur ( @noaribote )

# Fonctionnalités

- Voir et télécharger les **Stories**, les contenus **À la une**, les **Reels** et les **Publications** des comptes publics en **anonyme**.
- Visualiser les informations des comptes et de leurs mises à jour.
- Visualiser l'historique de l'ensemble de l'activité de votre compte depuis sa création. (Notes, stories, messages, commentaires, réels vues...)
> Vous pouvez par exemple rechercher un message datant de plusieurs années dans une conversation même si l'utilisateur vous a bloqué et inversement.

# Instagram Data Viewer — version web locale

Cette version reprend le projet dans une interface responsive web. Les données importées sont désormais stockées dans le IndexedDB du navigateur. Le scraper de profils s’exécute dans un petit serveur local Node.js et enregistre son cache dans le même dossier `model/users/` que l’application Electron.

### Avertissement: Phase de développement

La version web d'Instagram Data Viewer est actuellement en phase de développement et peut contenir des problèmes, bugs ou manques.

### Lancer le site

Depuis la racine du projet, démarrez le serveur web local :

```sh
node server.js
```

Ouvrez ensuite `http://127.0.0.1:8000` dans le navigateur. Le serveur ne reçoit pas les archives importées. Pour lancer le scraper, Python et `instaloader` doivent être installés; le serveur utilise automatiquement `.venv` s’il existe, ou l’interpréteur indiqué par la variable `PYTHON`.

### Fonctions nécessitant encore un service local

Le téléchargement automatisé de stories, highlights, reels et publications repose sur les services Python/Playwright de l’application de bureau; il n’est pas disponible dans cette version web. La consultation des archives, les statistiques locales, la recherche dans les JSON, les contacts et les conversations restent dans le navigateur.

### Importer les données

Choisissez une archive ZIP de données Instagram ou un dossier décompressé. L’import ZIP est traité dans le navigateur. Les fichiers JSON deviennent consultables et cherchables; les autres fichiers sont conservés localement. Pour libérer l’espace, utilisez le bouton en bas de la barre latérale.

Les données sont rattachées au navigateur et à l’adresse du site. Elles ne sont pas synchronisées avec l’application Electron ni avec les autres appareils. Effacer les données du site dans les paramètres du navigateur les supprimera aussi.

# Lancer le projet (~10 minutes) :

1) Installez [Python](https://www.python.org/downloads/)
2) Installez [Node.js](https://nodejs.org/en/download)
3) Extrayez le projet de l'archive téléchargée
4) Si vous êtes sur **Windows 10, 11**, lancez le fichier ``start.bat``. Autrement exécutez ``start.sh``

Sur macOS et Linux, ouvrez un terminal dans le dossier du projet et lancez `./start.sh`. Si le système refuse son exécution, lancez d'abord `chmod +x start.sh` ou utilisez `bash start.sh`. Le script crée `.venv` pour isoler les dépendances Python. Consultez [FAQ.md](FAQ.md) en cas de problème.

[Plus d'informations concernant Electron.js](https://www.electronjs.org/)

# Compiler le projet (~1 minute) :

1) Ouvrez le terminal courant ou ouvrez-en un nouveau
2) Exécutez la commande ``npm i --save-dev electron-builder`` dans ce dernier
3) Exécutez la commande ``npm run build`` OU selon votre système d'exploitation :
    - Windows : ``npm run build:win``
    - MacOS : ``npm run build:mac``
    - Linux : ``npm run build:linux``
- Vous pouvez compiler le projet pour tous les OS simultanéments via la commande ``npx electron-builder --mac --win --linux``

[Plus d'informations concernant la compilation](https://www.electron.build/)

# Sécurité de vos données

**Tout se passe sur votre ordinateur.** Vos données ne quittent jamais votre machine : elles ne sont ni envoyées sur internet, ni stockées sur un serveur, ni transmises à un tiers.

**Ce que cela signifie pour vous :**

- **Vous gardez le contrôle total.** Vos fichiers sont enregistrés uniquement sur votre appareil, et vous seul y avez accès.
- **Aucun transfert, donc aucune interception possible.** Sans circulation sur le réseau, il n’y a rien à intercepter ni à pirater à distance.
- **Aucun compte requis, aucun suivi.** Nous ne collectons ni ne consultons vos informations.
- **Vous décidez de tout.** Vous pouvez supprimer vos données à tout moment, simplement en les effaçant de votre machine.


# Avertissement relatif à l'usage de l'IA

Ce logiciel a été conçu et pensé par un humain. Chacun de ses programmes a été créé de manière indépendante par l'auteur.

L'intelligence artificielle a toutefois constitué un atout majeur dans le développement de cette application. Elle a réutilisé l'ensemble des codes indépendants produits par l'auteur, ainsi que ses instructions, afin de concevoir le logiciel "Instagram Data Viewer" avec les technologies choisies par ce dernier.
