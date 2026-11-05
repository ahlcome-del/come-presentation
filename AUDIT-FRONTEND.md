# Côme Presentation — audit front-end (revue « Apple / HIG », 5 nov. 2026)

Portée : `index.html`, `css/main.css`, `js/main.js`, `js/glass.js`, `js/library.js`, `js/scene.js`,
`js/post.js`, `js/maps.js`, `js/textures.js`, `js/vendor/*`, `assets/`, `README.md`.
Méthode : lecture intégrale du code, mesure du poids réel (gzip), calcul des contrastes WCAG sur les
tokens, revue des états d'interaction, du cycle de vie WebGL, du budget de chargement et de
l'accessibilité clavier/lecteur d'écran.

> **Limite de cet audit** : aucun navigateur n'était disponible dans l'environnement d'exécution
> (téléchargement Chromium bloqué). Tout ce qui suit vient du **code** et de **mesures
> reproductibles** (gzip, ratios de contraste, comptages), pas d'une session de captures. Les
> constats sont donc vérifiables ligne par ligne ; les coûts GPU sont des estimations argumentées.

---

## 1. Verdict

| Critère (grille « Apple front-end ») | Note | Commentaire |
|---|---|---|
| Idée & direction artistique | 9,5 / 10 | Le fil narratif livre → cartes → époques → bibliothèque est original et cohérent. La palette (encre crème sur brun umber, accent brique) est tenue du premier au dernier pixel. |
| Exécution technique (3D, shaders, matériaux) | 9 / 10 | Une scène three.js pilotée par un seul scalaire `p`, tout construit avant le rideau, warm-up des shaders/upload, décision ombres mesurée, DPR adaptatif, fallback WebGL en 4 tentatives. C'est du niveau production. |
| Système de design / CSS | 8 / 10 | Tokens propres, rayons concentriques, `env(safe-area-inset-*)`, `svh/dvh`, focus visible. Manque la couche « preferences » (transparence, contraste, forced-colors) et quelques états. |
| Liquid glass (le cœur du sujet) | 7,5 / 10 | Le filtre SVG par élément (carte de déplacement + spéculaire) est une vraie bonne idée, bien dégradée. Mais l'effet est instable (resize), absent sur Safari/mobile — donc absent chez une grande partie du public — et non désactivable par l'utilisateur. |
| Performance & budget de chargement | 6,5 / 10 | ~1,09 Mo sur le chemin critique, dont 164 Ko de code mort, des textures 2048², des reflows forcés à chaque frame. Sur un profil « Apple », c'est le poste le plus perfectible. |
| Accessibilité | 6,5 / 10 | Landmarks, skip link, `inert`, annonces `aria-live`, clavier complet : très au-dessus de la moyenne. Mais contraste de l'accent à 3,86:1, cibles de navigation à ~30 px de haut, `overflow:hidden` + zoom, absence de `prefers-*`. |
| Cohérence éditoriale / finition | 8 / 10 | Excellente micro-typographie (’ , espaces insécables, `text-wrap: balance`). Quelques traces de chantier : un commentaire « Placeholder » visible dans le HTML livré, section about encore générique. |

**Note globale : ~8 / 10.** C'est un site *remarquable* pour un projet statique sans build : la
partie 3D est meilleure que la plupart des sites d'agence, et le soin apporté aux détails
(loader qui ne ment pas, `?nofx / ?reduced / ?nowebgl / ?glass=fallback`, reprise exacte
d'un vol) montre une vraie culture produit. Les points faibles sont ceux d'un site qui a été
optimisé « pour la démo Chromium desktop » : le glass, la perf et l'accessibilité y sont calibrés
pour ce seul cas.

Ce qui distingue un 8 d'un 9,5 chez Apple, ce n'est pas d'ajouter des effets : c'est
**qu'aucun état ne casse** (resize, Safari, vieux GPU, lecteur d'écran, mode contraste élevé) et
que **la performance est tenue comme une fonctionnalité**.

---

## 2. Mesures (chiffres réels, `gzip -9`)

### Chemin critique au premier rendu
| Fichier | Brut | gzip | Chargé |
|---|---:|---:|---|
| `js/vendor/three.js` | 538 Ko | 137,3 Ko | oui (import statique depuis `scene.js`) |
| `js/vendor/libs.js` | 164 Ko | 61,7 Ko | oui (d3-geo + topojson ; **GSAP + Lenis morts**) |
| `js/scene.js` | 61 Ko | 20,3 Ko | oui |
| `js/props.js` | 44 Ko | 14,1 Ko | oui |
| `js/dioramas.js` | 39 Ko | 12,3 Ko | oui |
| `js/maps.js` | 29 Ko | 8,9 Ko | oui |
| `js/textures.js` | 23 Ko | 6,8 Ko | oui |
| `js/main.js` | 19 Ko | 6,6 Ko | oui |
| `js/library3d.js` | 21 Ko | 7,2 Ko | oui |
| `js/terrain.js` | 10 Ko | 3,9 Ko | oui |
| `js/glass.js` + `library.js` + `post.js` | 15 Ko | 6,6 Ko | oui |
| `css/main.css` | 28 Ko | 7,6 Ko | oui |
| `index.html` | 17 Ko | 6,7 Ko | oui |
| **Total JS+CSS+HTML** | **~1 010 Ko** | **~300 Ko** | |
| Polices (3 familles, `display=swap`) | — | ~120–200 Ko | oui, hors origine |
| `assets/data/*.json` (fallback cartes) | 644 Ko | 208 Ko | **après** le rideau (OK) |

Auxquels s'ajoutent **~25–40 Mo de textures GPU** générées à l'exécution (5 planches de carte en
2048×1418 + une trentaine de canvas 256–1024 px de matière), et un `PMREMGenerator` sur 512×256.

### Contrastes (WCAG 2.2, sur `--bg #191613`)

| Token | Valeur | Ratio | Verdict |
|---|---|---:|---|
| `--ink` | `#EEE6D4` | 14,50:1 | excellent |
| `--ink-2` | `#D2C7B2` | 10,77:1 | excellent |
| `--muted` | `#9C907D` | 5,75:1 | ok (AA) |
| `--accent` | `#B9573E` | **3,86:1** | **échoue AA pour du texte**, ok seulement en 3:1 « grand texte / composant » |
| `--hairline` | `rgba(238,230,212,.17)` | ~1,3:1 | volontairement décoratif (déconseillé pour une bordure porteuse d'info) |

Sur un fond glass éclairci (le `.card` à `--glass-tint: rgba(22,19,16,.62)` par-dessus une scène
claire), `--ink-2` descend sous 9:1 et `--muted` autour de 4,5:1 : la marge reste acceptable mais
elle n'est plus confortable en plein soleil / écran de bureau bas de gamme.

---

## 3. Bugs et fragilités avérées (à corriger en priorité)

### 3.1 Le filtre « liquid » n'est jamais régénéré quand la forme change
`js/glass.js` — la clé de cache est `offsetWidth × offsetHeight` :

```js
const key = `${w}x${h}`;
if (el.dataset.liquidKey === key) continue;
```

Le rayon, lui, n'entre pas dans la clé. Or `.glass { border-radius: var(--glass-radius) }` passe de
`28px` à `24px` à 768 px, `.pill`/`.nav`/`.era-pill` forcent `999px`, et la hauteur du nav change
(`--nav-h`) au même breakpoint. Résultat : à un resize qui ne modifie pas exactement la boîte,
le filtre conserve l'ancien rayon, alors que la carte de déplacement a été dessinée pour l'ancien.
Le `feImage` est en `preserveAspectRatio="none"` et étiré de `w × h` (arrondi) vers la vraie taille :
tout sous-pixel décale la réfraction par rapport au bord.

**Correctif** : inclure rayon *et* DPR dans la clé, écouter `matchMedia('(resolution)')` en plus,
et vérifier la géométrie dans la boucle de frame (coût : un `getBoundingClientRect` toutes les
~200 ms, pas plus).

### 3.2 Le reflet ne suit pas la carte quand elle est retournée
`initGlassPointer` ne gère que `pointerout` :

```js
document.addEventListener('pointerout', (e) => { … el.style.removeProperty('--hl'); })
```

Il n'y a pas de `pointerleave`, et surtout pas de mise à jour de `--mx/--my` quand l'élément bouge
sous un curseur immobile (scroll du panneau Bibliothèque, ouverture d'un panneau). Le reflet reste
« collé » à un point de l'écran. Par ailleurs `--hl: .13` s'écrit dans le style inline et écrase le
`--hl: .16` de `.pill:hover` (spécificité inline > feuille) : l'état hover des pills est inopérant
dès que la souris est passée dessus.

**Correctif** : `pointerleave` + `ResizeObserver`/frame qui rafraîchit le reflet si l'élément bouge,
et passer par une variable distincte (`--hover-hl`) ou un attribut plutôt que d'écrire `--hl`.

### 3.3 La scène 3D tourne derrière les panneaux
`openPanel()` ne met pas la boucle en pause (`closePanel()` non plus). Quand `#bibliotheque` ou
`#a-propos` est ouvert sur mobile, la bibliothèque 3D, le post-process et les ombres continuent d'être
rendus à 60 fps sous un overlay `blur(22px)` — sur un GPU intégré, c'est de la batterie brûlée pour
0 pixel visible. Le canvas est bien flouté par CSS, mais le coût GPU est intégral.

**Correctif** : `app.scene?.stop()` à l'ouverture, `start()` à la fermeture (et un `frame()` unique
pour garder le fond figé). Idéalement idem quand `document.hidden` (déjà fait) et quand le panneau
est `inert`.

### 3.4 Deux reflows forcés par frame
`js/main.js → onSceneFrame` lit `c.el.offsetWidth / offsetHeight` à chaque frame pour positionner les
chips d'époque, juste après `anchors()` qui vient de muter des matrices. C'est une lecture de layout
synchrone dans le callback de `rAF`, donc un « layout thrashing » garanti à chaque image sur toutes
les époques affichées. Les largeurs de chips ne dépendent que du texte et du viewport : les mesurer
une fois par resize (débouncé) et les mémoriser.

### 3.5 164 Ko de code mort dans le chemin critique
`js/vendor/libs.js` annonce lui-même : « gsap@3.12.5 + ScrollTrigger … lenis@1.3.27 … legacy
gsap/Lenis unused ». Seuls `d3-geo` et `topojson-client` sont importés (par `js/maps.js`). Et
`maps.js` n'est utile qu'**après** le rideau (`scene.loadMaps()` est appelé 300 ms après
`finishBoot`). Reconstruire un `libs-geo.js` ne contenant que d3-geo + topojson ferait tomber
`libs.js` de 164 Ko à ~35–45 Ko bruts, et un `import()` dynamique dans `loadMaps()` le sortirait
entièrement du chemin critique. Idem pour `js/textures.js`, `props.js`, `dioramas.js`, `library3d.js`
et `terrain.js` : ils ne sont utiles qu'après le premier pixel, mais sont tirés statiquement par
`scene.js`.

### 3.6 `modulepreload` sur le point d'entrée de tout l'arbre
`<link rel="modulepreload" href="js/main.js">` demande au navigateur de précharger `main.js` — puis,
en cascade, ses 12 dépendances *avant* que le parseur n'ait fini. Sur une connexion lente, cela
retarde le premier rendu du loader (qui n'a besoin d'aucun JS pour être visible) au profit de code
qui ne sera exécuté qu'après `DOMContentLoaded`. `defer`/`type=module` normal suffit ;
le `modulepreload` a un intérêt pour `main.js` *et* ses dépendances directes si et seulement si on
veut paralléliser les fetch — ce qui est déjà le cas. À supprimer, ou à réserver au seul
`js/main.js` sans le préchargement transitif.

### 3.7 « 2,4 s de loader » non informatif
`finishBoot()` impose `minTime = 2400 ms` **même si tout est prêt en 400 ms** (desktop, cache
chaud). Sur un retour sur le site, l'utilisateur attend donc le même rideau qu'au premier soir. Le
commentaire du code est honnête (« the bar never waits on anything »), mais l'UX ne l'est pas :
un loader qui ne mesure rien transforme un boot de 300 ms en 2,4 s perçues.

**Correctif** : `minTime` conditionné à la première visite (`sessionStorage`), 800 ms chaud /
2400 ms froid ; et `prefers-reduced-motion` → 400 ms.

### 3.8 `overflow: hidden` sur `html` + `body` fige le zoom mobile
```css
html { height: 100%; overflow: hidden; … }
body { … overflow: hidden; }
```
`overflow: hidden` sur la racine bloque le *scroll*, pas le zoom : mais combiné à
`height: 100%` et à un `height: 100dvh` sur `.voyage`, il empêche le navigateur mobile de dézoomer
librement après un pincer-zoomer sur les titres, et il neutralise le « scroll into view » du
focus clavier quand la barre d'adresse apparaît. Préférer `overflow: clip` sur `body` uniquement
(la racine reste scrollable d'un pixel) ou `position: fixed` sur `.stage` avec un `body` de
hauteur `100dvh`.

### 3.9 Historique : chaque navigation interne est un `replaceState` vide
`setupNav()` et `openPanel()` font `history.replaceState(null, '', location.pathname + location.search)`
— donc l'URL ne change jamais, mais un clic sur un lien `#bibliotheque` **écrase** la position
d'historique. Conséquence : sur mobile, le bouton « retour » quitte le site au lieu de fermer le
panneau. C'est un écart classique avec les HIG (le back doit défaire la dernière action de
navigation). Utiliser `pushState('#bibliotheque')` à l'ouverture et `popstate` pour fermer.

### 3.10 Deux réseaux tierces sur le chemin critique
`<link rel="preconnect">` + `stylesheets.googleapis.com` pour 3 familles. Trois familles = 3
requêtes CSS + ~6–10 fichiers `.woff2`, et une dépendance à Google (RGPD, latence, indisponibilité).
`UnifrakturCook` (blackletter) ne sert qu'au wordmark ; `Source Serif 4` qu'à des italiques
secondaires. Deux familles suffiraient, sous-ensemblées et auto-hébergées (`woff2`, latin + latin-ext,
`font-display: swap`), avec le blackletter remplacé par une image SVG du wordmark (il est déjà
tracé : `assets/logo.svg`). Gain : un aller-retour DNS/TLS, ~100 Ko, et la disparition du FOUT sur
le wordmark.

### 3.11 Petites dettes certaines
- `index.html` : `<!-- Placeholder: replace these two sentences … -->` livré en production.
- `.grain` : le `background-image` est répété par défaut (donc pas de trou), mais l'animation
  `steps(4)` déplace en boucle un calque plein écran à `opacity:.05` : c'est de la composition
  permanente pour un effet quasi invisible. À figer, ou à limiter aux 3 premières secondes.
- `.card` (cartes de la bibliothèque) : `backdrop-filter` + `border-radius` + `overflow` sur un
  élément de 1000×700 px → un blur de backdrop coûteux par carte visible. La marge de perf est
  d'autant plus mince que la grille est longue.
- `html.reduced-motion .atmos { --grain-op: 0; }` : variable jamais lue (le `grain` a une `opacity`
  en dur).
- Les règles `.lenis*` (lignes 36–39) sont mortes : plus aucun JS Lenis.
- `.card` a `transition: box-shadow` et `.card:hover` change `box-shadow` : quatre ombres animées
  (dont deux `inset`) = repaint coûteux sur la carte entière. `outline`/`::after` serait gratuit.
- README : « Run locally … `cd site` », « Push the contents of `site/` », « 1,41 Mo » — le dépôt
  n'a plus de dossier `site/` ni ce poids. Les 17 sections de versions (v2 → v17) sont un journal
  de chantier : précieux pour vous, mais elles noient l'information utile (comment ajouter une
  présentation, comment déployer). À déplacer dans `CHANGELOG.md`.
- Aucun `LICENSE`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`. Le README crédite des
  polices et des libs (GSAP « standard license ») sans fichier de licence correspondant : à clarifier
  avant de présenter le site comme un portfolio public.
- `assets/icons/*.png` : vérifier qu'ils sont bien en 32×32 / 180×180 (le favicon SVG est présent,
  c'est le principal).
- `lang` : `index.html` est en `fr`, et les titres des cartes portent `lang="de"` — bien. Mais
  `renderLibrary` enveloppe le *résumé* (français) dans le même `<li>` que le titre allemand :
  correct, le `lang` n'est posé que sur `h3`/`subtitle`. Bon point, à conserver si le contenu
  grandit.

---

## 4. Liquid glass : ce qui manque pour être « Apple-grade »

Le glass actuel est **une somme de trois effets** : teinte + `backdrop-filter: blur/saturate`, liseré
spéculaire en `mask-composite`, et un filtre SVG optionnel (Chromium) qui déplace les pixels sur une
bande de bord. C'est une très bonne imitation, mais l'HIG de Liquid Glass (iOS 26 / macOS 26) décrit
un matériau *adaptatif* :

1. **Il s'adapte au contenu derrière.** Ici, l'opacité de la teinte est fixe par composant
   (`rgba(22,19,16,.38)`, `.5`, `.62`, `.68`). Résultat : sur une zone claire de la scène (ciel,
   pagode de la bibliothèque), les cartes sont moins lisibles que sur une zone sombre. Apple fait
   varier l'épaisseur du matériau selon le contraste local. Piste réaliste sans shader : prélever la
   luminance moyenne derrière chaque panneau en lisant un `readRenderTargetPixels` 8×8 toutes les
   ~500 ms, et ajuster `--glass-tint` en CSS (`opacity: clamp()`), ou plus simplement ajouter un
   `--glass-scrim` sous les textes longs (les cartes de la bibliothèque), comme le `.stage::before`
   déjà présent pour les titres.
2. **Il a une hiérarchie.** Aujourd'hui `.nav`, `.era-pill`, `.chip`, `.card`, `.pill`, `.panel`
   partagent le même vocabulaire. Apple distingue *chrome* (nav, contrôles : flou fort, teinte
   sombre, liseré 1 px) et *contenu sur verre* (cartes : flou plus doux, teinte plus opaque). Deux
   jeux de tokens (`--glass-chrome-*`, `--glass-surface-*`) rendraient le système plus lisible.
3. **Il respecte les préférences.** Il n'y a **ni** `prefers-reduced-transparency` **ni**
   `prefers-contrast` **ni** `forced-colors`. Un utilisateur qui a activé « Réduire la transparence »
   (macOS/iOS) doit voir des surfaces opaques : c'est explicitement demandé par Apple. Trois blocs
   CSS suffisent :
   ```css
   @media (prefers-reduced-transparency: reduce) {
     .glass { -webkit-backdrop-filter: none; backdrop-filter: none;
              background: #221e1a; box-shadow: none; }
     .glass::before { opacity: .35; }
   }
   @media (prefers-contrast: more) { .glass { background: #1b1815; } .glass::before { opacity: 1; } }
   @media (forced-colors: active) { .glass { border: 1px solid CanvasText; } }
   ```
4. **Il est cohérent sur tous les navigateurs.** Le filtre SVG n'est appliqué que sur Chromium
   desktop (`supportsLiquid()` exclut Safari *et* tout mobile). Donc **les utilisateurs iPhone — le
   public le plus « glass » qui soit — voient la version dégradée**. Deux options : (a) assumer et
   documenter le fallback, en renforçant le liseré et le grain pour qu'il tienne seul ; (b) tenter un
   `backdrop-filter: url()` derrière un test `CSS.supports` *et* un rendu de contrôle (une image de
   référence + `readPixels`), avec repli silencieux. Je recommande (a) + un `@supports` propre :
   ```css
   @supports not (backdrop-filter: blur(1px)) { .glass { background: rgba(34,30,26,.9); } }
   ```
5. **Il coûte cher.** `buildMaps()` dessine deux canvas en JS (boucle pixel par pixel, `hypot` par
   pixel) et produit deux `toDataURL('image/png')` — donc deux encodages PNG synchrones sur le main
   thread, pour chaque élément glass, à chaque changement de taille. Sur la Bibliothèque (cartes
   1000×700), c'est ~0,7 M pixels × 2 canvas × N cartes. À 60 fps pendant un resize, c'est un gel.
   **Correctifs** : générer les cartes une seule fois par *classe de taille* (arrondir les dimensions
   à 32 px), mettre en cache les `data:` produits, et remplacer `toDataURL` par `canvas.transferToImageBitmap`
   ou un `feImage` alimenté par un `<canvas>` en `data` (impossible en SVG) → la voie pragmatique
   reste le cache. Bonus : `will-change`/`contain: paint` sur les cartes glass évite de recalculer le
   backdrop des voisins.

---

## 5. Accessibilité : la liste concrète

| # | Constat | Gravité | Correctif |
|---|---|---|---|
| A1 | `--accent #B9573E` sur `#191613` = 3,86:1 → utilisé pour le `dot` décoratif (OK) mais aussi pour `:focus-visible` et le trait de survol des liens de nav (l'info de focus est alors à 3,86:1, sous le 3:1 exigé… à la limite) | moyenne | Passer l'accent à `#C9654A` (~4,6:1) pour le texte/anneau, garder `#B9573E` pour les aplats décoratifs. Vérifier aussi `#B9573E` sur `--raised` (3,2:1). |
| A2 | Cibles de navigation : `.nav__links a { padding: 8px 14px; font-size: 12.5px }` → hauteur ≈ 30 px, sous les 44 px recommandés (et sous les 24 px AA de la WCAG 2.2 pour la cible *minimale*… 30 px passe le minimum mais pas le confort) | moyenne | `padding-block: 13px` (ou `min-height: 44px; display:grid; place-items:center`) — le nav ne bouge pas visuellement si on garde `height: var(--nav-h)` et un `line-height` adapté. |
| A3 | Le voyage est un unique `<button class="stage__advance">` plein écran **sous** les chapitres : au clavier, `Tab` atteint ce bouton avant les liens du nav (ordre DOM) et son libellé change à chaque étape — bien — mais **il n'y a aucune indication visuelle du nombre d'étapes restantes** (« 3 / 6 »), et `aria-busy` sur un bouton n'est pas restitué par tous les lecteurs d'écran | faible | Ajouter un compteur visuel discret (6 points de progression) + `aria-live` déjà présent ; remplacer `aria-busy` par `aria-disabled` + `data-state`. |
| A4 | `#sr-status` annonce le nom du chapitre à chaque changement de `p` (donc pendant un vol de 3,6 s, plusieurs fois) : la file `aria-live` peut saturer et lire des fragments | moyenne | N'annoncer qu'à l'**arrivée** (`flyToStation` le fait déjà avec `announce()`), et supprimer l'annonce dans `updateOverlays`. |
| A5 | `html { overflow: hidden }` + `height: 100%` : le zoom texte iOS (Dynamic Type) agrandit la police mais le stage ne peut pas défiler → les `.display` en `6.5rem` et les chips peuvent être rognés sur un iPhone en taille de texte XXL | moyenne | `@media (max-width: 768px) { html { overflow: auto } }` en mode statique, ou passer les tailles display en `clamp()` avec `dvh` et autoriser `overflow-y: auto` sur `.chapter` quand `p` est élevé. Tester à 200 % de zoom. |
| A6 | Pas de `prefers-reduced-transparency`, `prefers-contrast`, `forced-colors` (voir §4.3) | moyenne | 3 blocs CSS (fournis ci-dessus). |
| A7 | Le `loader` annonce « Chargement… » via `.visually-hidden` mais reste `role="status"` pendant 2,4 s minimum : au lecteur d'écran, la page semble bloquée | faible | Passer `role="status"` en `aria-busy` sur `main`, et retirer le `role` du loader après `is-done`. |
| A8 | Le skip-link pointe `#bibliotheque`, qui est `inert` + `aria-hidden` au chargement : le lien mène donc à une section inaccessible tant qu'on n'a pas cliqué | moyenne | Pointer `#voyage` et, au clic, ouvrir le panneau Bibliothèque (le `setupNav` le fait déjà pour ce hash) — ou cibler `#main`. |
| A9 | Les images générées (`coverSVG`) ont un `role="img"`/`aria-label` correct, mais `preserveAspectRatio="slice"` recadre le millésime : sur une carte étroite, le grand « 1884 » peut être coupé sans que le texte alternatif le signale | faible | Dupliquer le millésime dans un `<title>`/`<desc>` ou passer `meet` sur les petits écrans. |
| A10 | Conformité WCAG AA « 1.4.11 » : le liseré `.glass::before` à 1 px joue un rôle de contour de composant mais son opacité tombe à `.03` en bas à droite → contour effectif < 3:1 sur une partie du périmètre | faible | Rendre le liseré uniforme sur les éléments **interactifs** (nav, pills, thumb), décoratif seulement sur les cartes. |

---

## 6. Performance : plan d'action chiffré

| Action | Gain estimé | Effort |
|---|---|---|
| Découpler `libs.js` (retirer GSAP/ScrollTrigger/Lenis, garder d3-geo + topojson) | **−120 Ko bruts / −50 Ko gzip** sur le chemin critique | 1 h (rebuild esbuild) |
| `import()` dynamique de `maps.js` (+ libs-geo) dans `loadMaps()` | ces 50 Ko sortent du chemin critique ; les cartes arrivent de toute façon après le rideau | 30 min |
| Idem `textures.js`/`props.js`/`dioramas.js`/`terrain.js`/`library3d.js` derrière l'`await import('./scene.js')` qui existe déjà : en faire un chunk unique `scene.bundle` | −90 Ko sur le premier rendu, parallélisation des fetch | 1 h |
| Cartes en 1536×1063 (au lieu de 2048×1418) + `generateMipmaps` déjà présent | −45 % de VRAM pour les planches (−15 à −20 Mo) | 15 min |
| Cacher les cartes de déplacement `buildMaps` par dimensions arrondies + `requestIdleCallback` | supprime le gel au resize ; −80 % des encodages PNG | 2 h |
| Mémoïser `offsetWidth/Height` des chips (cf. 3.4) | supprime 2 reflows/frame | 20 min |
| `app.scene.stop()` quand un panneau est ouvert (cf. 3.3) | −100 % de GPU sous la Bibliothèque et l'About | 15 min |
| Remplacer l'animation `.grain` en boucle par un grain statique (ou l'activer 3 s au chargement) | −5 à −8 % de GPU permanent | 10 min |
| Polices : auto-hébergement, 2 familles, sous-ensembles latin/latin-ext, `font-display: swap` | −100 à −150 Ko + 2 origines en moins | 1 h |
| `minTime` adaptatif (cf. 3.7) | −1,6 s perçues au retour | 10 min |
| `content-visibility: auto` sur `.card` hors écran | −N recalculs de backdrop-filter dans une longue bibliothèque | 10 min |

Résultat visé : **~180 Ko gzip avant le premier pixel** (contre ~300 aujourd'hui), **~0 reflow par
frame**, **0 rendu GPU sous un panneau**, **VRAM des planches −50 %**.

---

## 7. Design, motion et micro-interactions (niveau « détail Apple »)

1. **Le motion a deux grammaires.** En 3D, les vols utilisent un `smoothstep` (`u*u*(3-2u)`) et une
   durée fixe ; en CSS, tout est en `cubic-bezier(.28,.11,.32,1)` / `(.16,1,.3,1)`. Le premier est
   un ease-in-out « brut » : sur un vol de 1,8 s, l'accélération initiale est perceptible comme un
   « coup ». Utiliser les mêmes courbes que la CSS (`bezier(.16,1,.3,1)` en sortie, `.28,.11,.32,1`
   en entrée) rendrait le toucher plus « Apple » — d'autant que `bezier()` est déjà exporté par
   `scene.js`.
2. **Rien n'annonce qu'on peut cliquer.** `stage__advance` est un bouton invisible plein écran. Il y a
   bien un `cursor: pointer` sur desktop, mais rien sur mobile (le `era-pill` nomme le chapitre, pas
   l'action). Un chevron/« touche pour continuer » en bas, qui s'efface après le premier clic, est le
   pattern standard. (README v16 mentionne un « Défiler » retiré en v17 : le remplacer par
   « Continuer ».)
3. **Le chrome ne se replie pas.** La nav est toujours visible ; sur la Bibliothèque (panneau
   plein écran avec son propre bouton « Retour au voyage » et son titre), elle est redondante avec le
   bouton de retour. Un repli de la nav au scroll du panneau (ou un vrai `header` collant avec
   ombre à l'approche du contenu) clarifierait la hiérarchie.
4. **États manquants** : `.pill` n'a pas d'`:active` (pression), `.nav__links a` pas d'`:active`, les
   cartes n'ont pas d'état « visité ». Trois lignes de CSS suffisent et changent la sensation.
5. **Le loader raconte une histoire, mais pas la bonne.** La silhouette se trace en 2,1 s puis se
   remplit : très beau. Mais la barre `barfill` est en `animation ... forwards` et atteint `.9` à 3,2 s
   : si le boot dure 6 s (mobile lent), la barre est **immobile à 90 %** pendant 3 s — l'anti-pattern
   classique. Faire boucler une navette (`animation-iteration-count: infinite` sur un segment court)
   au-delà de 3 s, ou passer en `indeterminate` (trois points) après 4 s.
6. **Le glass sur du texte long.** Le `.card__summary` (15 px, `--ink-2`) est posé sur un verre à 62 %
   et un fond 3D vivant : c'est le seul endroit où la lisibilité peut réellement souffrir. Une teinte
   montée à 78 % dans `.card` (et un `text-shadow` à 0/1px/12px, déjà utilisé ailleurs) réglerait
   le problème une fois pour toutes.
7. **Typographie** : `--font-black` (UnifrakturCook) est utilisé pour le wordmark **et** pour le
   texte du faux livre de secours (`text` dans le SVG). Or UnifrakturCook n'a pas de chiffres
   « blackletter » cohérents et son rendu à 24 px dans le footer est nettement plus léger que le
   tracé vectoriel : utiliser `assets/logo.svg` (déjà là) comme wordmark garantirait un rendu
   identique partout, et retirerait une famille de polices.
8. **Palette** : `--accent` (brique) est le seul accent, utilisé pour les `dot`, le focus, le survol.
   Il est sous le seuil AA en texte. Sur un site « historique », une déclinaison
   `--accent-ink` (plus clair, pour le texte) + `--accent` (pour les aplats) est le pattern Apple
   (cf. `systemBlue` vs `label`).

---

## 8. Contenu & produit

- La section **À propos** contient encore deux phrases génériques et un commentaire « Placeholder »
  dans le HTML public. C'est la page qu'un recruteur lit en premier : elle doit porter un nom, un
  rôle, une méthode, et un contact (le seul lien est un profil GitHub générique).
- **Bibliothèque** : une seule entrée + un fantôme « Bientôt ». Le `card--featured` est très
  réussi ; mais la grille 3 colonnes avec 1 carte + 1 fantôme laisse deux trous ingrats en 1440 px.
  Passer à une grille `auto-fit`/`repeat(auto-fit, minmax(320px, 1fr))` en dessous de 2 cartes, ou
  centrer le fantôme.
- **Filtres / tri** : `presentations.json` porte déjà `tags`, `years`, `language` — rien ne les
  exploite. Trois puces de filtre (par siècle, par langue) en haut de la bibliothèque transformeraient
  la page en vrai outil éditorial, pour ~40 lignes de JS.
- **SEO/partage** : `og:image` est absolue (bien), `canonical` aussi, mais il n'y a **ni** `robots.txt`
  **ni** `sitemap.xml`, et un site 100 % canvas pour le contenu principal n'a **aucun texte
  indexable** hors `index.html`. Les résumés des présentations sont dans un JSON non rendu au
  serveur : pour un moteur de recherche, la bibliothèque est vide. Correctif minimal : un
  `<noscript>` enrichi (déjà présent, à compléter avec la liste des présentations) ou une page
  `bibliotheque.html` statique générée à partir du JSON.
- **Pas de `manifest.webmanifest`** : sur iOS, « Ajouter à l'écran d'accueil » ouvrira une capture
  d'onglet au lieu d'une app plein écran. 10 lignes de JSON + `apple-mobile-web-app-capable` et le
  site s'installe proprement.
- **Le README est un journal de bord.** v2 → v17 occupe 70 % du fichier, et les instructions
  (`cd site`, poids mesurés) sont périmées. Restructurer en : *Qu'est-ce que c'est* / *Lancer* /
  *Ajouter une présentation* / *Déployer* / *Architecture* / *Accessibilité* — et déplacer l'historique
  dans `CHANGELOG.md`.

---

## 9. Plan de correction proposé (par ordre de rentabilité)

**Aujourd'hui (2–4 h, gains visibles)**
1. `app.scene.stop()` à l'ouverture d'un panneau, `start()` à la fermeture. *(15 min)*
2. Clé de cache du filtre glass : `w×h×rayon×dpr` + invalidation sur `matchMedia('(resolution)')`. *(1 h)*
3. Reflows : mémoriser `offsetWidth/Height` des chips. *(20 min)*
4. `pointerleave` + `--hl` distinct de `--hover-hl`. *(30 min)*
5. `minTime` adaptatif (sessionStorage) et barre de loader en navette après 3 s. *(30 min)*
6. Skip-link vers `#voyage`, retrait du commentaire « Placeholder », retrait des règles `.lenis`,
   `--grain-op`, `background-repeat` sur `.grain`. *(30 min)*
7. `pushState`/`popstate` pour les panneaux (bouton retour mobile). *(45 min)*

**Cette semaine (une demi-journée, gains structurels)**
8. Split `libs.js` + `import()` de `maps.js` hors chemin critique. *(1 h)*
9. Polices auto-hébergées, 2 familles, wordmark en SVG. *(1 h)*
10. Blocs `prefers-reduced-transparency` / `prefers-contrast` / `forced-colors`. *(30 min)*
11. Cibles ≥ 44 px dans la nav, `--accent` AA pour le texte/focus. *(30 min)*
12. Cache des cartes de déplacement glass par taille arrondie. *(2 h)*
13. Cartes 1536 px + `content-visibility: auto` sur les cartes de la bibliothèque. *(30 min)*

**Ensuite (qualité « produit »)**
14. Matériau glass hiérarchisé (chrome vs surface) + teinte adaptative selon le fond.
15. `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `LICENSE`.
16. Filtres de la bibliothèque (siècle / langue / thème).
17. À propos rédigée + contact réel.
18. `CHANGELOG.md` + README restructuré.
19. Test réel Safari/iOS (le README dit explicitement que seul Chromium a été testé).

---

## 10. Ce qu'il ne faut surtout pas casser

- Le **geste central** : un clic = une étape, pas de scroll dans le voyage. C'est rare, c'est
  identifiable, c'est la signature du site.
- Le **contrat de chargement** : tout est construit et préchauffé avant le rideau ; aucun pop
  d'objet à l'arrivée d'une époque. C'est ce qui donne l'impression de « produit » plutôt que de
  démo.
- Les **modes de repli** et les paramètres de QA (`?nofx`, `?reduced`, `?nowebgl`,
  `?glass=fallback`, `?noadapt`, `?noshadow`) : c'est une pratique de professionnel, à conserver et
  à documenter comme telle.
- La **micro-typographie française** déjà faite (apostrophes courbes, espaces insécables, tirets
  cadratins) : elle est de niveau éditeur, c'est un vrai marqueur de qualité.

---

*Audit réalisé par lecture statique du dépôt (aucun navigateur disponible dans cet environnement :
le rendu visuel n'a pas été rejoué). Les ratios de contraste et les poids gzip sont mesurés ; les
coûts GPU sont des estimations qualitatives fondées sur le code (draw calls, tailles de canvas,
reflows par frame).*
