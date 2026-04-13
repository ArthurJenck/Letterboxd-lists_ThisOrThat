# Letterboxd-lists_ThisOrThat

App locale pour reclasser une liste Letterboxd en mode "this or that".

## Lancer le projet

```bash
pnpm install
pnpm dev
```

## Scripts utiles

```bash
pnpm test
pnpm build
```

## Ce que fait l'app

- importe un CSV Letterboxd list export v7
- sauvegarde automatiquement la session en local
- trie les films via des duels et une insertion binaire
- ajoute une passe de vérification entre films voisins
- réexporte un CSV trié, proche du format Letterboxd source
