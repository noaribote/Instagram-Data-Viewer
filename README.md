# Logiciel en cours de développement !

Version instable, problèmes potentiels et imprévisibilités sur certaines fonctionnalités.
- Veuillez attendre la sortie d'une **version stable** avant de lancer ce logiciel. La première version stable devrait sortir aux alentours du **1 déc. 2026**
> Tenez-vous informé des nouveautés sur l'Instagram du développeur ( @noaribote )

# Fonctionnalités

- Voir et télécharger les **Stories**, les contenus **À la une**, les **Reels** et les **Publications** des comptes publics en **anonyme**.
- Visualiser les informations des comptes et de leurs mises à jour.
- Visualiser l'historique de l'ensemble de l'activité de votre compte depuis sa création. (Notes, stories, messages, commentaires, réels vues...)
> Vous pouvez par exemple rechercher un message datant de plusieurs années dans une conversation même si l'utilisateur vous a bloqué et inversement.

# Sécurité de vos données

**Tout se passe sur votre ordinateur.** Vos données ne quittent jamais votre machine : elles ne sont ni envoyées sur internet, ni stockées sur un serveur, ni transmises à un tiers.

**Ce que cela signifie pour vous :**

- **Vous gardez le contrôle total.** Vos fichiers sont enregistrés uniquement sur votre appareil, et vous seul y avez accès.
- **Aucun transfert, donc aucune interception possible.** Sans circulation sur le réseau, il n’y a rien à intercepter ni à pirater à distance.
- **Aucun compte requis, aucun suivi.** Nous ne collectons ni ne consultons vos informations.
- **Vous décidez de tout.** Vous pouvez supprimer vos données à tout moment, simplement en les effaçant de votre machine.

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

# Avertissement relatif à l'usage de l'IA

Ce logiciel a été conçu et pensé par un humain. Chacun de ses programmes a été créé de manière indépendante par l'auteur.

L'intelligence artificielle a toutefois constitué un atout majeur dans le développement de cette application. Elle a réutilisé l'ensemble des codes indépendants produits par l'auteur, ainsi que ses instructions, afin de concevoir le logiciel "Instagram Data Viewer" avec les technologies choisies par ce dernier.
