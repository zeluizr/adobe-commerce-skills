---
name: adobe-commerce-module-contract
description: "Apply when creating, renaming, packaging or reviewing an Adobe Commerce module skeleton: registration.php, etc/module.xml, the sequence node, composer.json (name, type, require, suggest, autoload), global versus area-specific etc folders, and the module folder layout. Covers component registration, module naming, load order, hard and soft dependencies, enabling and disabling modules, and config.php. Use for scaffolding a new module or fixing load-order and dependency problems."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Module contract: registration, module.xml, sequence and composer.json

## When this skill applies

Use this skill when the task touches the files that make a folder into an Adobe Commerce (Magento) module and declare how it relates to other modules.

- Creating a new module under `app/code/<Vendor>/<Module>` or as a Composer package
- Writing or fixing `registration.php`, `etc/module.xml` or the module `composer.json`
- Declaring dependencies (`require`, `suggest`) and load order (`<sequence>`)
- Deciding whether a configuration file goes in `etc/` or in `etc/<area>/`
- Enabling or disabling a module and reading `app/etc/config.php`
- Reviewing a module whose layout, configuration or setup classes load in the wrong order

Do not use this skill for:

- The content of `di.xml`: preferences, plugins, virtual types, arguments (use `adobe-commerce-di-and-plugins`)
- The content of `events.xml` and observers (use `adobe-commerce-events-and-observers`)
- `db_schema.xml` and data or schema patches (use `adobe-commerce-db-schema`)
- `setup:upgrade`, `setup:di:compile` and deployment pipelines in depth (use `adobe-commerce-deploy-and-modes`)
- Themes and language packages beyond their registration line (use `adobe-commerce-frontend-luma`)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Every component needs `registration.php` and `composer.json` in its root. A module also needs `etc/module.xml`. A theme needs `theme.xml`, a language package needs `language.xml`.
- The module name is `<VendorName>_<ModuleName>`. The same string goes in `ComponentRegistrar::register()`, in `<module name="...">` and in any `urn:magento:module:<Vendor_Module>:...` schema reference.
- Avoid `Ui` as a custom module name: the `%Vendor%_Ui` notation required when specifying paths might cause issues.
- Develop modules in `app/code/<Vendor>/<Module>`. Components added to `vendor/` are ignored by Git, because the application adds `vendor` to `.gitignore`.
- The Composer package name is `{vendor-name}/{package-name}`, all lowercase, words separated by dashes. Use `"type": "magento2-module"` for modules (`magento2-theme`, `magento2-language`, `magento2-component` for the other types).
- If you plan to submit to Commerce Marketplace, the `vendor-name` part must be the Vendor Name of your Marketplace profile.
- Hard dependency (your code uses class constants, static methods, interfaces, traits, class names in strings, or the other module's tables) goes in `require`. Soft dependency (you check another module's availability, or extend its configuration or layout) goes in `suggest`, and `<sequence>` also holds soft dependencies.
- The coding standard is more specific: if module A uses the behavior of module B, B goes in A's `require`; if A customizes B through its customization points (layout handles, plugins, events), B goes in A's `suggest`.
- Use `<sequence>` when your configuration files, view files (CSS, Less, templates, layout) or setup classes need another module's files loaded first. It does not affect the loading of regular (non-setup) classes, and `suggest` does not affect load order at all.
- Omit `setup_version` in `module.xml` when the module uses declarative schema. Add it only when you do not use declarative schema.
- Put configuration that applies everywhere in `etc/`. Put configuration that applies only to one functional area in `etc/adminhtml/`, `etc/frontend/`, `etc/graphql/`, `etc/webapi_rest/` or `etc/webapi_soap/`; a file there overrides the global one for that area only.
- Version constraints in `require`: depend on the MAJOR version of a module whose API you call, MAJOR plus MINOR when you implement its API or SPI. Never depend on metapackages such as `product-community-edition`.

## Hard constraints

### Constraint: Register the module through ComponentRegistrar and autoload registration.php

Each component has a `registration.php` in its root that calls `ComponentRegistrar::register()` with the component type, the component name and `__DIR__`. The `composer.json` lists that file under `autoload.files`.

**Why this matters**

Components must be registered in the system through `ComponentRegistrar`. The file also specifies the directory in which the component is installed in production environments, where Composer installs packages under `vendor`.

**Detection**

A module root without `registration.php`, a `register()` call with a type other than `ComponentRegistrar::MODULE` for a module, or a `composer.json` whose `autoload` lacks `"files": ["registration.php"]`.

**Correct**

```php
<?php
use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::MODULE, 'Vendor_Module', __DIR__);
```

**Wrong**

```php
<?php
// Theme constant and a name that does not match etc/module.xml
use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::THEME, 'vendor/module', __DIR__);
```

### Constraint: Declare the module in etc/module.xml with the exact same name

`etc/module.xml` declares the module's name and existence. The `name` attribute is required for all components and must match the name registered in `registration.php`.

**Why this matters**

A module URN such as `urn:magento:module:Vendor_Module:...` must be exactly the same as the module specified by ComponentRegistrar. The name in `module.xml` is also the key that appears in `app/etc/config.php` and in `bin/magento module:status`.

**Detection**

`registration.php` and `module.xml` disagree on case or spelling, `module.xml` without the `urn:magento:framework:Module/etc/module.xsd` schema, or a `setup_version` attribute in a module that ships `db_schema.xml`.

**Correct**

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="Vendor_Module"/>
</config>
```

**Wrong**

```xml
<config>
    <!-- No schema; name differs from registration.php -->
    <module name="vendor_module"/>
</config>
```

### Constraint: Pair every sequence entry with a composer.json dependency

If you specify a component in `<sequence>`, also add it to the `require` section of your `composer.json`. All dependencies must be declared in the component's `composer.json`; a component must not rely on dependencies of its dependencies or of the project it is installed in.

**Why this matters**

`<sequence>` only orders the loading of configuration, view and setup files. Composer is what declares that the dependency must be present. Undeclared dependencies are listed as inappropriate dependencies, and the enable and disable commands build their dependency graph from the `require` (and `conflict`) fields of each module's `composer.json`.

**Detection**

A module name in `<sequence>` whose package is missing from `require`; code that uses another module's classes with no Composer declaration; a constraint on a metapackage.

**Correct**

```xml
<module name="Vendor_ComponentB">
    <sequence>
        <module name="Vendor_ComponentA"/>
    </sequence>
</module>
```

```json
{
	"name": "vendor/module-component-b",
	"type": "magento2-module",
	"require": {
		"vendor/module-component-a": "1.0.*"
	},
	"autoload": {
		"files": ["registration.php"],
		"psr-4": { "Vendor\\ComponentB\\": "" }
	}
}
```

**Wrong**

```json
{
	"name": "Vendor/ComponentB",
	"require": { "magento/product-community-edition": "*" }
}
```

### Constraint: Regenerate the module list after changing sequence

When you change the load order with `<sequence>`, regenerate the component list in `app/etc/config.php`, otherwise the new order does not take effect. The documented way is `bin/magento module:enable <module-list>` for the modules you changed.

**Why this matters**

`app/etc/config.php` is where the resolved load order lives, and you can read it there to check that the dependency loads first. On cloud projects you cannot enable or disable modules directly: run the commands locally and push the changed `app/etc/config.php`.

**Detection**

A diff that edits `<sequence>` but not `app/etc/config.php`; `config.php` listing the dependent module before its dependency.

**Correct**

```bash
bin/magento module:enable Vendor_ComponentB
bin/magento setup:upgrade
bin/magento cache:clean
```

**Wrong**

```bash
# Edited <sequence>, then only flushed cache: config.php keeps the old order
bin/magento cache:clean
```

### Constraint: Do not create circular dependencies

Avoid circular (direct and indirect), undeclared and incorrect dependencies. Take care when using `<sequence>` in several modules.

**Why this matters**

If a circular dependency is defined through `<sequence>`, the application aborts the installation when it detects it.

**Detection**

Module A lists B in `<sequence>` (or `require`) and B, directly or through C, lists A.

**Correct**

```xml
<!-- Only Vendor_Extension depends on Vendor_Core -->
<module name="Vendor_Extension">
    <sequence>
        <module name="Vendor_Core"/>
    </sequence>
</module>
```

**Wrong**

```xml
<!-- Vendor_Core/etc/module.xml -->
<module name="Vendor_Core">
    <sequence>
        <module name="Vendor_Extension"/>
    </sequence>
</module>
<!-- Vendor_Extension/etc/module.xml also lists Vendor_Core -->
```

## Preferred pattern

A minimal module that adds behavior to the storefront and the Admin:

```text
app/code/Vendor/Module/
├── registration.php
├── composer.json
├── etc/
│   ├── module.xml
│   ├── di.xml                 (global DI)
│   ├── adminhtml/
│   │   └── routes.xml         (Admin only)
│   └── frontend/
│       └── di.xml             (storefront only)
├── Api/                       (interfaces exposed to the API)
├── Block/  Controller/  Model/  ViewModel/  Observer/  Plugin/
├── i18n/
└── view/
```

```json
{
	"name": "vendor/module-example",
	"description": "Example module",
	"type": "magento2-module",
	"version": "1.0.0",
	"require": {
		"magento/module-catalog": "103.0.*"
	},
	"suggest": {
		"magento/module-graph-ql": "*"
	},
	"autoload": {
		"files": ["registration.php"],
		"psr-4": { "Vendor\\Example\\": "" }
	}
}
```

Enable it and check it:

```bash
bin/magento module:enable --clear-static-content Vendor_Example
bin/magento setup:upgrade
bin/magento cache:clean
bin/magento module:status Vendor_Example
```

For an extension repository: no `app/code/<Vendor>/` directories inside it, one extension type per repository (modules, themes and language packs cannot be mixed), several modules may share one repository, and with a single module the repository root is the module root.

## Common failure modes

- Naming the module `Vendor_Ui`, which collides with the `%Vendor%_Ui` path notation.
- Keeping `setup_version` in a module that uses declarative schema.
- Using `<sequence>` to try to order regular PHP class loading; it only orders configuration, view and setup files.
- Declaring a dependency in `suggest` and expecting it to change load order; `suggest` does not.
- Editing `<sequence>` and not regenerating `app/etc/config.php`.
- Putting Admin-only configuration in `etc/` so it applies globally, or depending on another module's area.
- Uppercase letters in the Composer vendor or package name.
- Using a Composer `path` repository pointing outside the application root, which is not supported.
- Disabling a module with `--force` despite dependencies; it can disable the store and block access to the Admin.
- Removing or disabling a module without storing its information elsewhere first, which can lose its historical data.

## Review checklist

- [ ] `registration.php` uses `ComponentRegistrar::MODULE` and `__DIR__`, and is in `autoload.files`
- [ ] The name in `registration.php`, `module.xml` and any module URN is identical
- [ ] `module.xml` references `urn:magento:framework:Module/etc/module.xsd`
- [ ] `setup_version` is absent if the module uses declarative schema
- [ ] Every `<sequence>` entry is also in `composer.json` `require`
- [ ] Customized-only modules (layout, plugins, events) are in `suggest`; used modules are in `require`
- [ ] No dependency on metapackages; no circular dependency
- [ ] Composer name is lowercase `{vendor-name}/{package-name}` with `"type": "magento2-module"`
- [ ] Area-specific files are in `etc/<area>/`
- [ ] `app/etc/config.php` was regenerated (and committed on cloud) after enabling or reordering

## Related skills

- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): what goes inside `etc/di.xml` and `etc/<area>/di.xml`
- [`adobe-commerce-events-and-observers`](../adobe-commerce-events-and-observers/SKILL.md): `etc/events.xml` per area
- [`adobe-commerce-db-schema`](../adobe-commerce-db-schema/SKILL.md): `db_schema.xml` and patches instead of `setup_version`
- [`adobe-commerce-deploy-and-modes`](../adobe-commerce-deploy-and-modes/SKILL.md): `setup:upgrade` and compilation in a pipeline

## Reference

- [Register a component](https://developer.adobe.com/commerce/php/development/build/component-registration) (source: `commerce-php/src/pages/development/build/component-registration.md`)
- [Name a component](https://developer.adobe.com/commerce/php/development/build/component-name) (source: `commerce-php/src/pages/development/build/component-name.md`)
- [Component load order](https://developer.adobe.com/commerce/php/development/build/component-load-order) (source: `commerce-php/src/pages/development/build/component-load-order.md`)
- [Component file structure](https://developer.adobe.com/commerce/php/development/build/component-file-structure) (source: `commerce-php/src/pages/development/build/component-file-structure.md`)
- [Required configuration files](https://developer.adobe.com/commerce/php/development/build/required-configuration-files) (source: `commerce-php/src/pages/development/build/required-configuration-files.md`)
- [Composer integration](https://developer.adobe.com/commerce/php/development/build/composer-integration) (source: `commerce-php/src/pages/development/build/composer-integration.md`)
- [Enable or disable a component](https://developer.adobe.com/commerce/php/development/build/component-management) (source: `commerce-php/src/pages/development/build/component-management.md`)
- [URN schema validation](https://developer.adobe.com/commerce/php/development/build/schema-validation) (source: `commerce-php/src/pages/development/build/schema-validation.md`)
- [About component file structure](https://developer.adobe.com/commerce/php/development/prepare/component-file-structure) (source: `commerce-php/src/pages/development/prepare/component-file-structure.md`)
- [Extension repository structure](https://developer.adobe.com/commerce/php/development/prepare/extension-repository-structure) (source: `commerce-php/src/pages/development/prepare/extension-repository-structure.md`)
- [Module dependencies](https://developer.adobe.com/commerce/php/architecture/modules/dependencies) (source: `commerce-php/src/pages/architecture/modules/dependencies.md`)
- [Modules and areas](https://developer.adobe.com/commerce/php/architecture/modules/areas) (source: `commerce-php/src/pages/architecture/modules/areas.md`)
- [Module version dependencies](https://developer.adobe.com/commerce/php/development/versioning/dependencies) (source: `commerce-php/src/pages/development/versioning/dependencies.md`)
- [Technical guidelines](https://developer.adobe.com/commerce/php/coding-standards/technical-guidelines) (source: `commerce-php/src/pages/coding-standards/technical-guidelines.md`)
- [Enable or disable modules](https://experienceleague.adobe.com/en/docs/commerce-operations/installation-guide/tutorials/manage-modules) (source: `commerce-operations.en/help/installation/tutorials/manage-modules.md`)
