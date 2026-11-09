# FAQ de `start.sh`

Cette FAQ concerne le lancement du projet sur macOS et Linux. Lancez les commandes depuis un terminal ouvert dans le dossier du projet. Le script `start.sh` installe les dépendances Python dans `.venv` et les dépendances Node.js dans `node_modules`.

## « Permission denied » ou le script ne se lance pas

Rendez le script exécutable une fois, puis relancez-le :

```sh
chmod +x start.sh
./start.sh
```

Vous pouvez aussi le lancer sans modifier ses permissions avec `bash start.sh`.

## « Node.js est introuvable » ou « npm est introuvable »

Installez une version LTS récente de Node.js depuis [nodejs.org](https://nodejs.org/), puis fermez et rouvrez le terminal. Vérifiez avec :

```sh
node --version
npm --version
```

Les deux commandes doivent afficher un numéro de version.

## « Python 3 est introuvable » ou version trop ancienne

Installez Python 3.10 ou plus récent. Sur macOS/Linux, la commande attendue est généralement `python3`. Si elle porte un autre nom ou se trouve dans un emplacement personnalisé, indiquez son chemin avant de lancer le script :

```sh
PYTHON=/chemin/vers/python3 ./start.sh
```

Contrôlez la version avec `python3 --version`.

## La création de `.venv` échoue

Certaines distributions Linux séparent le module `venv` de Python. Installez le paquet `venv` correspondant à votre version de Python avec le gestionnaire de paquets de votre distribution, puis relancez `./start.sh`. Vérifiez aussi que le dossier du projet est accessible en écriture et que Python 3.10 ou plus récent est utilisé.

## Échec de pip ou téléchargement bloqué

L'installation initiale nécessite une connexion Internet. Vérifiez votre connexion, votre proxy et les restrictions du réseau, puis relancez `./start.sh`. En environnement réseau administré, configurez le proxy pour pip/npm ou réessayez depuis un réseau autorisant l'accès à leurs registres.

Si `.venv` a été créé avec un Python différent de celui que vous voulez utiliser, supprimez uniquement le dossier `.venv`, puis relancez le script avec `PYTHON=/chemin/vers/python3 ./start.sh`.

## Chromium Playwright manque ou ne démarre pas

Relancez son installation depuis l'environnement du projet :

```sh
./.venv/bin/python -m playwright install chromium
```

Sur Linux, Playwright peut aussi demander des bibliothèques système. Le message d'erreur indique généralement leur nom ; installez-les avec le gestionnaire de paquets de votre distribution, puis relancez `./start.sh`.

## Electron ne démarre pas sous Linux

Vérifiez que votre session graphique est ouverte (X11 ou Wayland) et que les bibliothèques système nécessaires à Electron sont présentes. Sur certaines distributions, le lancement dans une machine virtuelle ou un conteneur sans affichage graphique n'est pas pris en charge.

## `npm ci` échoue ou les dépendances semblent endommagées

Relancez `./start.sh` après avoir vérifié la connexion. Si le dossier `node_modules` est incomplet et que le problème persiste, supprimez ce dossier puis relancez le script ; npm le recréera depuis `package-lock.json`.

## L'application s'ouvre puis une fonctionnalité Python échoue

Lancez l'application avec `./start.sh` pour que les fonctionnalités utilisent le Python de `.venv`. Si vous la démarrez directement avec `npm start`, les modules `instaloader` et `playwright` doivent être installés dans le Python système ou configurez `PYTHON` vers l'interpréteur qui les contient.

## Les aperçus HEIC ne s'affichent pas

La conversion des photos HEIC utilise `ffmpeg`, qui n'est pas installé par `start.sh`. Installez `ffmpeg` avec le gestionnaire de paquets de votre système, puis relancez l'application. Les autres formats d'image ne dépendent pas de cet outil.
