# Changelog

Todos los cambios de adobe-commerce-skills. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones siguen [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0] - 2026-10-25

### Agregado

- Once skills para el desarrollo PHP de Adobe Commerce: `adobe-commerce-module-contract`,
  `adobe-commerce-di-and-plugins`, `adobe-commerce-events-and-observers`, `adobe-commerce-layout-and-templates`,
  `adobe-commerce-frontend-luma`, `adobe-commerce-db-schema`, `adobe-commerce-webapi`, `adobe-commerce-security`,
  `adobe-commerce-performance-and-cache`, `adobe-commerce-cron-and-queues` y `adobe-commerce-deploy-and-modes`.
- Las fuentes, fijadas por commit en `data/fonte.json`: `commerce-php`, `commerce-frontend-core` y `commerce-webapi`
  (Apache-2.0) y `commerce-operations.en` (MIT). Las atribuciones, en `NOTICE`.
- `scripts/verificar.sh`, el gate: frontmatter y secciones de cada skill, que cada ruta citada exista en el commit
  fijado (en clones locales con `FONTES_DIR` o en `raw.githubusercontent.com`) y que el enlace público corresponda a
  la ruta, Prettier, `bash -n` y la búsqueda de rastros. El CI lo corre en push y pull request de `dev`, `qa` y `main`.
