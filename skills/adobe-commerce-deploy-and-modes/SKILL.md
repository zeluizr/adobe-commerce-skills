---
name: adobe-commerce-deploy-and-modes
description: "Apply when deploying Adobe Commerce code or changing how the application runs. Covers the default, developer, production and maintenance modes, deploy:mode:set, setup:upgrade and setup:db:status, setup:di:compile and generated code, setup:static-content:deploy with its strategies, the production command order, pipeline deployment with development, build and production systems, config.php versus env.php, app:config:dump and app:config:import, and marking module settings as sensitive or environment-specific. Use for release scripts and CI pipelines."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Deployment and application modes

## When this skill applies

Use this skill when you ship module or theme code to an Adobe Commerce (Magento) installation, or write the scripts that do it.

- Choosing and switching the application mode
- Deciding which `bin/magento` commands a release needs, and in which order
- Compiling code and deploying static view files
- Updating the database after installing, enabling or updating a module
- Splitting the work between development, build and production systems (pipeline deployment)
- Keeping shared configuration in source control and sensitive or system-specific values out of it
- Declaring a module setting as sensitive or environment-specific

Do not use this skill for:

- `registration.php`, `module.xml` and `composer.json` of a module (use `adobe-commerce-module-contract`)
- Writing data and schema patches (use `adobe-commerce-db-schema`)
- How factories, proxies and interceptors are used in code (use `adobe-commerce-di-and-plugins`)
- Cache types, full page cache and reindexing (use `adobe-commerce-performance-and-cache`)
- Cron installation details and queue consumers (use `adobe-commerce-cron-and-queues`)
- Protecting secrets beyond configuration placement (use `adobe-commerce-security`)
- Cloud infrastructure tooling (`ece-tools`): out of scope, the sources used here do not document it
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Development systems run `default` or `developer` mode. The live store runs `production` mode. The application runs in `default` mode if no other mode is specified, and `default` is not optimized for production.
- Use `developer` mode to extend and customize: static files are written on demand, code is compiled automatically, uncaught exceptions display in the browser, and `X-Magento-*` headers are shown.
- In `production` mode static files are served from the cache only, errors are logged and never displayed, some Admin fields are unavailable, and cache types can be enabled or disabled only from the CLI.
- On cloud infrastructure only `production` and `maintenance` are supported; deployment puts the site in maintenance mode, and `app/etc/env.php` is overwritten by the cloud tooling, so modes are not changed by editing it.
- Run `bin/magento setup:upgrade` whenever the database schema or data must change: after upgrading the application, or installing, updating, enabling or disabling a component (module, theme or language pack). Clean the cache afterwards.
- By default `setup:upgrade` clears compiled code and the cache, which is why `setup:di:compile` comes after it. `--keep-generated` keeps compiled code (the cache is still cleared).
- Use `bin/magento setup:db:status` to know whether an upgrade is needed: exit code `0` is up to date, `1` means code and database versions differ, `2` means `setup:upgrade` is required.
- Run `bin/magento setup:di:compile` for production. Code is generated on demand when a class is missing only when the application is not in production mode, so production relies on compiled code.
- Run `bin/magento setup:static-content:deploy` for production. By default it runs only in production mode; `-f` forces it in default or developer mode (the build system uses this).
- Keep the quick strategy (default) to minimize deployment time with several locales, use `-s compact` to save disk space, and `-s standard` to deploy all files for all packages.
- `bin/magento deploy:mode:set production` runs compilation and static content deployment for you, but does not let you set options on each step. Script the steps separately when you need options.
- With large sites that cannot afford downtime, use pipeline deployment: compile and deploy static assets on a build system, so production downtime is only the transfer.

## Hard constraints

### Constraint: Run the live store in production mode

Set `production` on the live store with `bin/magento deploy:mode:set production` (or `MAGE_MODE` in `env.php`), and never leave it in `developer` or `default`.

**Why this matters**

Developer mode displays uncaught exceptions in the browser and shows custom `X-Magento-*` headers. Default mode is not optimized for production because of the adverse performance impact of static files.

**Detection**

`bin/magento deploy:mode:show` on the live system, `'MAGE_MODE' => 'developer'` in a production `env.php`, or `SetEnv MAGE_MODE developer` in server configuration.

**Correct**

```shell
bin/magento deploy:mode:set production
bin/magento deploy:mode:show
```

**Wrong**

```php
// app/etc/env.php on the live store
'MAGE_MODE' => 'developer',
```

### Constraint: Run setup:upgrade after any module change, and use --keep-generated only in production

Installing, updating, enabling or disabling a module requires `bin/magento setup:upgrade` followed by `bin/magento cache:clean`.

**Why this matters**

The command is required anytime an action causes the database schema or data to change. `--keep-generated` skips updating static view files; it is meant only for experienced integrators, only in production mode, and never in developer mode or a development environment; improper use can cause errors during code execution.

**Detection**

Release scripts that pull new module code without `setup:upgrade`, or that pass `--keep-generated` on development systems.

**Correct**

```shell
bin/magento setup:upgrade
bin/magento cache:clean
```

**Wrong**

```shell
# developer machine
bin/magento setup:upgrade --keep-generated
```

### Constraint: Regenerate code when classes change, and clear generated code when leaving production mode

Run `bin/magento setup:di:compile` after code changes for production, and delete `generated/code` and `generated/metadata` before switching from production to developer mode.

**Why this matters**

Generated classes are not regenerated while they exist on the file system. A proxy generated before new methods were added to its class is incomplete. Compilation also aggregates DI configuration per area and generates interceptors, factories and the `generated/metadata/global.php` map.

**Detection**

Production releases that add methods to classes with proxies, or add plugins, without running `setup:di:compile`; or a switch from production to developer mode without clearing `generated/`.

**Correct**

```shell
rm -rf generated/metadata/* generated/code/*
bin/magento deploy:mode:set developer
```

**Wrong**

```shell
# production: new plugin added, compilation skipped
git pull && bin/magento cache:clean
```

### Constraint: Deploy static content with the .htaccess files intact

Before `setup:static-content:deploy`, delete the contents of `pub/static` except `.htaccess`. On multiple nodes pass the same `--content-version` everywhere.

**Why this matters**

The documentation says not to delete `pub/static/.htaccess`, and warns that deleting `.htaccess` in `generated` or `pub` may cause issues. `--content-version` keeps the static content version identical across nodes so caching works properly.

**Detection**

`rm -rf pub/static` or `rm -rf pub/static/*` in scripts (the documented command is `rm -r pub/static/*/*`), or nodes that each deploy static content with a different version.

**Correct**

```shell
rm -r pub/static/*/* var/view_preprocessed/*
bin/magento setup:static-content:deploy en_US es_ES -j 4 --content-version=20261025
```

**Wrong**

```shell
rm -rf pub/static
bin/magento setup:static-content:deploy
```

### Constraint: Commit config.php, never env.php

`app/etc/config.php` (modules, scopes, themes, shared system configuration) goes into source control. `app/etc/env.php` (system-specific and sensitive values) does not.

**Why this matters**

Shared configuration must stay consistent across development, build and production systems. Sensitive values (keys, usernames, passwords, emails, personal data) must not be in source control; set them on production with `bin/magento config:sensitive:set` or environment variables. Values in `config.php` or `env.php` are locked in the Admin.

**Detection**

`app/etc/env.php` tracked by Git, or `config.php` missing from the repository.

**Correct**

```shell
bin/magento app:config:dump          # development: writes config.php and env.php
git add app/etc/config.php
bin/magento app:config:import        # production: imports the shared changes
bin/magento config:sensitive:set payment/vendor/api_key <value>
```

**Wrong**

```shell
git add app/etc/env.php
```

### Constraint: Declare module secrets and per-environment settings in TypePool

Mark your module's configuration paths as `sensitive`, `environment`, or both, through `Magento\Config\Model\Config\TypePool` in `di.xml`.

**Why this matters**

After `bin/magento cache:clean`, `bin/magento app:config:dump` reports that the configuration file does not contain the sensitive data and names the environment variable that can carry each value (for example `CONFIG__DEFAULT__PAYMENT__TEST__PASSWORD` for `payment/test/password`). Sensitive values hold keys, usernames, passwords, emails or personal data; environment values are URLs, IPs, ports, hostnames, paths and modes such as sandbox or debug.

**Detection**

Module `system.xml` fields that hold API keys, passwords, URLs, hosts or modes with no matching `TypePool` item.

**Correct**

```xml
<type name="Magento\Config\Model\Config\TypePool">
    <arguments>
        <argument name="sensitive" xsi:type="array">
            <item name="payment/vendor/api_key" xsi:type="string">1</item>
        </argument>
        <argument name="environment" xsi:type="array">
            <item name="payment/vendor/sandbox_mode" xsi:type="string">1</item>
        </argument>
    </arguments>
</type>
```

**Wrong**

```php
// app/etc/config.php, committed to source control
'system' => [
    'default' => [
        'payment' => ['vendor' => ['api_key' => 'live-key-123']],
    ],
],
```

## Preferred pattern

Single machine (Composer install, some downtime acceptable):

```shell
bin/magento maintenance:enable
composer update
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy
bin/magento cache:clean
bin/magento maintenance:disable
```

When you also optimize the autoloader, keep this order:

```shell
composer install --no-dev
bin/magento setup:di:compile
composer dump-autoload -o
bin/magento setup:static-content:deploy
```

Pipeline deployment:

1. Development system (default or developer mode): set configuration in the Admin, run `bin/magento app:config:dump`, commit code and `app/etc/config.php`. Keep `vendor`, `generated`, `pub/static` and `app/etc/env.php` out of source control.
2. Build system (default or developer mode, codebase only, no database needed if `config.php` already holds the configuration): pull, `composer install`, `bin/magento setup:di:compile`, `bin/magento setup:static-content:deploy -f`, and commit `generated` and `pub/static` for production.
3. Production system (production mode): enable maintenance mode, pull code and configuration, stop queue workers (Adobe Commerce), `bin/magento app:config:import`, `bin/magento setup:upgrade --keep-generated` if the schema changed, set system-specific values with `config:set` and sensitive values with `config:sensitive:set` or environment variables, clean the cache, disable maintenance mode.

Configuration precedence: environment variables, then `env.php` over `config.php`, then the database, then the default. `env.php` keys can also come from `MAGENTO_DC_` variables (lower priority than `env.php`) or a JSON `MAGENTO_DC__OVERRIDE` (bypasses the listed `env.php` sections).

## Common failure modes

- Changing modes and losing `var/cache`, `generated/code`, `generated/metadata`, `var/view_preprocessed` and `pub/static`: switching to developer or production clears them.
- Expecting the Admin Developer settings (minify, merge, LESS compilation) or locale changes to be editable in production mode.
- Expecting `setup:static-content:deploy` to run in developer mode without `-f`.
- Using `--no-parent` while the store still uses the parent theme.
- Running `setup:upgrade --keep-generated` on a developer system.
- Committing `env.php` to share database credentials between systems.
- Skipping a reindex and cache flush before launch, then serving inconsistent data.
- Editing `env.php` on cloud infrastructure, where the tooling overwrites it.

## Review checklist

- [ ] Live store reports `production` in `deploy:mode:show`
- [ ] Release runs `setup:upgrade` when modules are added, updated, enabled or disabled
- [ ] `setup:db:status` used to gate the upgrade where useful
- [ ] `setup:di:compile` runs after code changes; `generated/` cleared when going back to developer mode
- [ ] Static content deploy keeps `.htaccess` files and uses one `--content-version` across nodes
- [ ] `--keep-generated` appears only in production steps
- [ ] `app/etc/config.php` committed; `app/etc/env.php` not tracked
- [ ] Module secrets and per-environment paths declared in `TypePool`
- [ ] Production steps run inside maintenance mode, with queue workers stopped and cache cleaned

## Related skills

- [`adobe-commerce-module-contract`](../adobe-commerce-module-contract/SKILL.md): what makes a module installable before deploy
- [`adobe-commerce-db-schema`](../adobe-commerce-db-schema/SKILL.md): the patches that `setup:upgrade` applies
- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): factories, proxies and interceptors that compilation generates
- [`adobe-commerce-performance-and-cache`](../adobe-commerce-performance-and-cache/SKILL.md): cache cleaning and reindexing after deploy
- [`adobe-commerce-cron-and-queues`](../adobe-commerce-cron-and-queues/SKILL.md): cron and consumers to stop and restart around a release
- [`adobe-commerce-security`](../adobe-commerce-security/SKILL.md): handling secrets in code and configuration

## Reference

- [Application modes](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/bootstrap/application-modes) (source: `commerce-operations.en/help/configuration/bootstrap/application-modes.md`)
- [Set the operation mode](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/set-mode) (source: `commerce-operations.en/help/configuration/cli/set-mode.md`)
- [Code compiler](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/code-compiler) (source: `commerce-operations.en/help/configuration/cli/code-compiler.md`)
- [Deploy static view files](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/static-view-file-deployment) (source: `commerce-operations.en/help/configuration/cli/static-view-file-deployment.md`)
- [Deployment strategies for static view files](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/static-view-file-strategy) (source: `commerce-operations.en/help/configuration/cli/static-view-file-strategy.md`)
- [Deployment overview](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/overview) (source: `commerce-operations.en/help/configuration/deployment/overview.md`)
- [Technical details](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/technical-details) (source: `commerce-operations.en/help/configuration/deployment/technical-details.md`)
- [Development system setup](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/development-system) (source: `commerce-operations.en/help/configuration/deployment/development-system.md`)
- [Build system setup](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/build-system) (source: `commerce-operations.en/help/configuration/deployment/build-system.md`)
- [Production system setup](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/production-system) (source: `commerce-operations.en/help/configuration/deployment/production-system.md`)
- [Single-machine deployment](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/deployment/single-machine) (source: `commerce-operations.en/help/configuration/deployment/single-machine.md`)
- [config.php reference](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/reference/config-reference-configphp) (source: `commerce-operations.en/help/configuration/reference/config-reference-configphp.md`)
- [env.php reference](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/reference/config-reference-envphp) (source: `commerce-operations.en/help/configuration/reference/config-reference-envphp.md`)
- [Deployment flow](https://experienceleague.adobe.com/en/docs/commerce-operations/performance-best-practices/deployment-flow) (source: `commerce-operations.en/help/performance/deployment-flow.md`)
- [Upgrade the database schema and data](https://experienceleague.adobe.com/en/docs/commerce-operations/installation-guide/tutorials/database-upgrade) (source: `commerce-operations.en/help/installation/tutorials/database-upgrade.md`)
- [Uninstall or reinstall Adobe Commerce](https://experienceleague.adobe.com/en/docs/commerce-operations/installation-guide/tutorials/uninstall) (source: `commerce-operations.en/help/installation/tutorials/uninstall.md`)
- [Check the database status](https://experienceleague.adobe.com/en/docs/commerce-operations/installation-guide/tutorials/database-status) (source: `commerce-operations.en/help/installation/tutorials/database-status.md`)
- [Code generation](https://developer.adobe.com/commerce/php/development/components/code-generation) (source: `commerce-php/src/pages/development/components/code-generation.md`)
- [Sensitive and environment-specific settings](https://developer.adobe.com/commerce/php/development/configuration/sensitive-environment-settings) (source: `commerce-php/src/pages/development/configuration/sensitive-environment-settings.md`)
