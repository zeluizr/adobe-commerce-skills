# adobe-commerce-skills

**Once skills de agente para el desarrollo PHP de Adobe Commerce (Magento): módulos, inyección de dependencias,
eventos, layout y templates, el frontend de Luma, el esquema declarativo, la web API, la seguridad, el cache, cron y
colas, y el deploy. Para la edición open source y para Adobe Commerce, en la nube (PaaS) o en servidor propio.**

Cada regla sale de la documentación oficial de Adobe Commerce, fijada en un commit, y cada skill termina con la lista
de las páginas de donde salió. Gratis y de código abierto.

[![licencia](https://badgen.net/github/license/zeluizr/adobe-commerce-skills?color=142032)](./LICENSE)
[![último commit](https://badgen.net/github/last-commit/zeluizr/adobe-commerce-skills)](https://github.com/zeluizr/adobe-commerce-skills/commits)
[![estrellas](https://badgen.net/github/stars/zeluizr/adobe-commerce-skills)](https://github.com/zeluizr/adobe-commerce-skills/stargazers)

Versión 0.1.0, según [CHANGELOG.md](CHANGELOG.md).

---

## Por qué existe

Las skills oficiales de Adobe, [adobe/skills](https://github.com/adobe/skills), traen para Adobe Commerce solo las de
App Builder (`commerce-app-*`, sobre `aio-commerce-sdk`): extensiones que corren fuera de la tienda. Nada cubre el
código PHP que vive dentro de ella: el módulo, el `di.xml`, el layout, los templates, el `db_schema.xml`, el
`webapi.xml`, el cache, cron y las colas, el deploy. Este repositorio llena ese hueco y no repite lo de App Builder:
para eso, las oficiales.

```bash
npx skills add adobe/skills
```

Las skills siguen el formato Agent Skills (`skills/<nombre>/SKILL.md`) y la estructura de
[vtex/skills](https://github.com/vtex/skills): cuándo aplica y cuándo no, reglas de decisión, restricciones con el
porqué, cómo detectarlas y un ejemplo correcto y uno incorrecto, el patrón recomendado, los errores comunes, una lista
de revisión y la referencia. Están en inglés, como la documentación de donde salen.

## Qué incluye

| Skill                                                                                          | Cuándo se usa                                                                                                                    | Fuentes |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [`adobe-commerce-module-contract`](skills/adobe-commerce-module-contract/SKILL.md)             | El esqueleto del módulo: `registration.php`, `etc/module.xml`, `sequence`, `composer.json`, áreas y estructura de carpetas.      | 15      |
| [`adobe-commerce-di-and-plugins`](skills/adobe-commerce-di-and-plugins/SKILL.md)               | `di.xml`: inyección por constructor, preferences, arguments, `virtualType`, plugins before, after y around, proxies y factories. | 11      |
| [`adobe-commerce-events-and-observers`](skills/adobe-commerce-events-and-observers/SKILL.md)   | `events.xml`, observers, eventos propios y cuándo un plugin y no un observer.                                                    | 8       |
| [`adobe-commerce-layout-and-templates`](skills/adobe-commerce-layout-and-templates/SKILL.md)   | Layout XML (handles, blocks, containers, `referenceBlock`, `move`, `remove`), `.phtml`, escaping y ViewModels.                   | 12      |
| [`adobe-commerce-frontend-luma`](skills/adobe-commerce-frontend-luma/SKILL.md)                 | Temas sobre Blank o Luma, LESS, RequireJS, mixins, Knockout y UI components de la tienda.                                        | 18      |
| [`adobe-commerce-db-schema`](skills/adobe-commerce-db-schema/SKILL.md)                         | `db_schema.xml`, la whitelist y los data patches y schema patches.                                                               | 9       |
| [`adobe-commerce-webapi`](skills/adobe-commerce-webapi/SKILL.md)                               | `webapi.xml`, service contracts, recursos ACL de la API, REST y GraphQL (`schema.graphqls`, resolvers).                          | 21      |
| [`adobe-commerce-security`](skills/adobe-commerce-security/SKILL.md)                           | ACL del admin, form key y CSRF, XSS, mass assignment, secretos, uploads, SSRF y CSP.                                             | 17      |
| [`adobe-commerce-performance-and-cache`](skills/adobe-commerce-performance-and-cache/SKILL.md) | Full page cache, Varnish, contenido privado, cache tags e identities, cache types e indexers.                                    | 14      |
| [`adobe-commerce-cron-and-queues`](skills/adobe-commerce-cron-and-queues/SKILL.md)             | `crontab.xml`, cron groups, message queues, consumers y bulk operations.                                                         | 11      |
| [`adobe-commerce-deploy-and-modes`](skills/adobe-commerce-deploy-and-modes/SKILL.md)           | Los modos, `setup:upgrade`, `setup:di:compile`, static content deploy, `config.php` y `env.php`, y el pipeline de deploy.        | 19      |

La columna Fuentes cuenta las páginas de la documentación que cita la sección Reference de cada skill.

## Instalación

```bash
npx skills add zeluizr/adobe-commerce-skills
```

o, con el CLI de GitHub:

```bash
gh skill install zeluizr/adobe-commerce-skills
```

`--scope user` las deja disponibles en todos los proyectos. El repositorio no es un plugin de Claude Code a
propósito: instaladas como plugin, las skills ganan el nombre del plugin adelante y los agentes que las precargan por
nombre (como el futuro `adobe-commerce-agents`) dejan de encontrarlas.

## De dónde vienen las reglas

Cuatro repositorios de documentación de [AdobeDocs](https://github.com/AdobeDocs), cada uno fijado en un commit en
[data/fonte.json](data/fonte.json):

| Repositorio                                                                   | Publicado en                                                                                                                                          | Licencia           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [commerce-php](https://github.com/AdobeDocs/commerce-php)                     | [developer.adobe.com/commerce/php](https://developer.adobe.com/commerce/php/)                                                                         | Apache-2.0         |
| [commerce-frontend-core](https://github.com/AdobeDocs/commerce-frontend-core) | [developer.adobe.com/commerce/frontend-core](https://developer.adobe.com/commerce/frontend-core/)                                                     | Apache-2.0         |
| [commerce-webapi](https://github.com/AdobeDocs/commerce-webapi)               | [developer.adobe.com/commerce/webapi](https://developer.adobe.com/commerce/webapi/)                                                                   | Apache-2.0         |
| [commerce-operations.en](https://github.com/AdobeDocs/commerce-operations.en) | [experienceleague.adobe.com/en/docs/commerce-operations](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/overview) | MIT (`license.md`) |

Las reglas:

- **Lo que la documentación no dice, la skill no lo afirma.** Nada de memoria ni de "buenas prácticas" sin fuente.
- **Cada skill cita sus fuentes.** La sección Reference de cada `SKILL.md` lista el archivo de origen
  (`<repositorio>/<ruta>`) y el enlace a la página pública.
- **Ningún código de `magento/magento2`.** Su licencia (OSL-3.0) es recíproca e incompatible con la MIT de este
  repositorio. Los ejemplos están adaptados de los de la documentación, con nombres genéricos (`Vendor_Module`).

Las atribuciones están en [NOTICE](NOTICE).

## Pendiente

- **Hyvä.** El tema y sus módulos de compatibilidad no están en la documentación de Adobe Commerce; una skill de Hyvä
  necesita otra fuente, con su propia licencia.

- **Adobe Commerce en la nube, la parte propia.** Las herramientas de la nube (`ece-tools`, `.magento.env.yaml`, los
  hooks de build y deploy) tienen su propia documentación, que no está entre las fuentes. La skill de deploy dice solo
  lo que las fuentes dicen de la nube.
- **Page Builder** y el **admin con UI components** (forms y listings) quedan fuera de esta versión: están en las
  fuentes, pero son temas grandes para otra skill.
- **Divisiones posibles.** Si crecen, el GraphQL puede salir de `adobe-commerce-webapi`, el JavaScript de
  `adobe-commerce-frontend-luma` y los indexers de `adobe-commerce-performance-and-cache`, cada uno en una skill propia.

## Desarrollo

Se requiere Node >= 20.

```bash
git clone https://github.com/zeluizr/adobe-commerce-skills.git
cd adobe-commerce-skills
npm ci
npm run verificar
```

`scripts/verificar.sh` es el gate, el mismo que corre el CI: JSON válido; el frontmatter de cada skill (`name` igual a
la carpeta, kebab-case, prefijo `adobe-commerce-`, `description` de hasta 1024 caracteres, `license` y
`compatibility`); las siete secciones; una sección Reference con al menos una fuente y, en la misma línea, el enlace
público que corresponde a esa ruta; que **cada ruta citada exista en el commit fijado**; Prettier; `bash -n`, y una
búsqueda de rastros (rutas de una máquina, correos personales, nombres de clientes).

Para comprobar las fuentes sin red, contra clones de los cuatro repositorios que contengan el commit fijado:

```bash
FONTES_DIR=~/fuentes npm run verificar
```

Sin `FONTES_DIR`, el gate pregunta a `raw.githubusercontent.com`; sin red, lo informa como "no verificado", nunca
como verde (en el CI, es una falla).

## Contribuir

Conventional Commits. Las ramas salen de `dev` y el pull request va contra `dev`, nunca contra `qa` ni contra `main`;
la promoción es merge de la rama entera.

Una regla nueva necesita su página en la documentación oficial: se lee la página, se escribe la regla y se cita la
página en Reference. Para actualizar una fuente, se cambia el commit en [data/fonte.json](data/fonte.json), se releen
las páginas citadas y se corre el gate.

## Licencia

[MIT](./LICENSE). Las fuentes y sus licencias, en [NOTICE](NOTICE).

_Hecho con amor y café por [commente.me](https://commente.me)_
