---
name: adobe-commerce-frontend-luma
description: "Apply when creating, registering or customizing an Adobe Commerce storefront theme based on Blank or Luma, or when writing its LESS, RequireJS configuration, JavaScript mixins, jQuery widgets, Knockout HTML templates or UI components. Covers theme.xml and parent inheritance, registration.php, the fallback of static files, templates and layouts, _extend.less versus _theme.less, server-side and client-side LESS compilation, @magento_import, requirejs-config.js (map, paths, shim, deps, mixins) and declarative JavaScript initialization. Use for theme scaffolding, style changes and JavaScript customization."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Luma and Blank themes: inheritance, LESS and JavaScript

## When this skill applies

Use this skill when working on the native storefront frontend of Adobe Commerce (Magento): a theme that inherits from
`Magento/blank` or `Magento/luma`, its styles and its JavaScript.

- Creating a theme under `app/design/frontend/<Vendor>/<theme>/` with `theme.xml`, `registration.php` and
  `etc/view.xml`
- Replacing an image, font, script or Knockout `.html` template of a parent theme or module through the fallback
- Adding styles with `_extend.less`, changing UI library variables with `_theme.less`, or overriding a module's
  `_module.less`
- Choosing between server-side and client-side LESS compilation and cleaning generated files
- Writing `requirejs-config.js`: aliases, replacements, third-party libraries and mixins
- Initializing JavaScript from templates with `data-mage-init` or `text/x-magento-init`
- Extending a jQuery widget or a UI component JavaScript class

Do not use this skill for:

- Layout XML instructions, blocks, view models and `.phtml` escaping (use `adobe-commerce-layout-and-templates`)
- XSS in general and Content Security Policies (use `adobe-commerce-security`)
- `setup:static-content:deploy` in a production pipeline and application modes (use `adobe-commerce-deploy-and-modes`)
- Module registration and `module.xml` sequence (use `adobe-commerce-module-contract`)
- Page Builder content types (not covered by these sources)
- Hyvä or other non-Luma storefronts (not in these sources)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- A theme needs `theme.xml` (at least `<title>`; `<parent>` when it inherits) and `registration.php` registering
  `ComponentRegistrar::THEME` with `'frontend/<Vendor>/<theme>'`. `composer.json` is optional
  (`"type": "magento2-theme"`, name in the form `<vendor-name>/theme-<area>-<theme-name>`). `etc/view.xml` is required unless the
  parent has one; a child `view.xml` extends the parent's.
- A new theme is not applied automatically: select it in Admin, **Content** > Design > **Configuration**, per store
  view. If `theme.xml` title or parent changes after registration, open any Admin page to save it to the database.
- Inheritance depth is unlimited and is based on fallback: a file missing in the current theme is looked up in
  ancestors, then in module view files, then in `lib/web`.
- Static files without module context resolve `<theme_dir>/web/i18n/<locale>`, `<theme_dir>/web/`, each ancestor's
  same pair, then `lib/web/`. With module context: `<theme_dir>/<Vendor>_<Module>/web/`, ancestors, then
  `<module_dir>/view/<area>/web/` (`frontend`, then `base`). `.less` files follow this fallback too.
- Templates (`.phtml`) fall back from theme to ancestors to `<module_dir>/view/frontend/templates`. Layouts do not use
  fallback: they are collected and merged, so extend them rather than copy them.
- Knockout HTML templates are static files: override one by copying it to the same path under
  `<theme_dir>/<Vendor>_<Module>/web/template/`.
- Styles: add rules in `<theme_dir>/web/css/source/_extend.less` (simplest, keeps everything from the parent). To change
  UI library variables, override `_theme.less`, copying every variable from the parent's file, including the
  unchanged ones. Rules and variables in `_extend.less` take precedence over `_theme.less`.
- A grandchild theme's `_extend.less` overrides its parent's instead of extending it. To chain, import an
  `_extend-child.less` at the end of the parent's `_extend.less`, keep it empty in the parent and fill it in the child.
- Module styles in a theme: `<theme_dir>/<Vendor>_<Module>/web/css/source/_extend.less` to add, `_module.less` to
  replace. Overriding a UI library file goes in `web/css/source/lib/`; an empty override of `_responsive.less` breaks
  compilation, and an empty component override such as `_buttons.less` removes that component's styles.
- Include CSS in layout (`<css src="css/custom.css"/>` in an extending `Magento_Theme/layout/default_head_blocks.xml`),
  not in templates. A missing `.css` makes the preprocessor look for the `.less` file with the same name.
- Server-side LESS compilation is the default and the only option in production mode. Client-side compilation (in
  `less.js`) is available outside production mode, recompiles on every page load and is slower.
- `@magento_import` only works in root source files and must be commented out with `//`.
- After changing static or `.less` sources, clear `pub/static/frontend/<Vendor>/<theme>/<locale>` and
  `var/view_preprocessed`, or old files keep being served; `cache:clean` alone does not remove them. In client-side
  mode this is also required after changing root files with `@magento_import` or extensionless `@import`, or after
  adding, renaming or removing imported files.
- Since 2.4.8, `'static_content_only_enabled_modules' => true` in `app/etc/env.php` or `app/etc/config.php` limits
  `styles-m.css` and `styles-l.css` to enabled modules.
- JavaScript: replace a component with `map` (`'*': {'<default>': '<custom>'}`); change or wrap its methods with a
  mixin; alias files or URLs with `paths`; give a non-AMD library its dependencies with `shim`; use top-level `deps`
  only for code that must load on every page.
- `requirejs-config.js` goes in `<theme_dir>`, `<theme_dir>/<Vendor>_<Module>` or `<module_dir>/view/<area>`. Files
  are merged in this order: library, modules, ancestor theme modules, current theme modules, ancestor themes, current
  theme.
- A mixin's area follows its directory: `view/frontend`, `view/adminhtml` or `view/base` (all areas). Its
  `requirejs-config.js` lives in the same area directory.
- Initialize components declaratively (`data-mage-init` for one element, `<script type="text/x-magento-init">` for a
  selector or `*`). Use imperative `require()` only for code that needs no initialization.
- Prefer UI components when the feature must interact with existing UI components. A UI component instance is
  declared with `<uiComponent name="..."/>` in layout and configured in `view/<area>/ui_component/<name>.xml`.

## Hard constraints

### Constraint: Never change out-of-the-box themes, core JavaScript or lib/web

Create a custom theme that inherits from Blank or Luma, and put custom JavaScript in a theme or module.

**Why this matters**

The documentation asks not to modify default themes, components or widgets for compatibility and upgradability, and
reserves `lib/web` for core resources only.

**Detection**

Edits under `app/design/frontend/Magento/`, `vendor/magento/theme-frontend-*`, `lib/web/`, or core module `web/js`.

**Correct**

```xml
<!-- app/design/frontend/Vendor/orange/theme.xml -->
<theme xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Config/etc/theme.xsd">
    <title>Orange</title>
    <parent>Magento/luma</parent>
</theme>
```

**Wrong**

```text
lib/web/js/vendor-carousel.js
app/design/frontend/Magento/luma/web/css/source/_theme.less   (edited in place)
```

### Constraint: Override `_theme.less` only with a complete copy of the parent's variables

Your `_theme.less` replaces the parent's file entirely; it does not merge with it.

**Why this matters**

The documentation says the theme's `_theme.less` overrides the parent's, and asks to copy every variable you need,
including the ones you do not change. The drawback it names: the copy must be updated by hand whenever the parent's
`_theme.less` changes. For additive rules, use `_extend.less`.

**Detection**

A `_theme.less` in the theme with a handful of variables, or new selectors and rules placed in `_theme.less`.

**Correct**

```less
// web/css/source/_extend.less
.action {
	&.primary {
		background-color: palevioletred;
		border-color: palevioletred;
	}
}
```

**Wrong**

```less
// web/css/source/_theme.less, only one variable instead of the full parent copy
@button-primary__background: @color-orange-red1;
```

### Constraint: Extend JavaScript components with mixins or map, declared in requirejs-config.js

Change behavior through a mixin (for UI components, jQuery widgets, objects and functions) or replace the whole
component with `map`. Never edit the original file.

**Why this matters**

Mixins return a modified version of the target to every module that requires it, which keeps the original intact.
A mixin cannot be disabled on its own; another module can only overwrite it (`false` for the old one, `true` for the
new one) and must list the original module in its `<sequence>`.

**Detection**

Copies of core JS files with small edits, or mixin files that exist without a `config.mixins` entry.

**Correct**

```javascript
// Vendor/Module/view/frontend/requirejs-config.js
var config = {
	config: {
		mixins: {
			"Magento_Checkout/js/proceed-to-checkout": {
				"Vendor_Module/js/proceed-to-checkout-mixin": true
			}
		}
	}
};
```

**Wrong**

```javascript
// mixin placed in view/frontend/web/js but declared in view/adminhtml/requirejs-config.js
var config = {
	config: { mixins: { "Magento_Checkout/js/proceed-to-checkout": { "Vendor_Module/js/x-mixin": true } } }
};
```

### Constraint: Initialize JavaScript declaratively, not with inline scripts

Use `data-mage-init` or `text/x-magento-init`, with configuration prepared by the backend.

**Why this matters**

The documentation strongly recommends against inline JavaScript. Imperative scripts lose access to existing JS classes
and can block page rendering.

**Detection**

`<script>` blocks in `.phtml` that call `$(...).widget()` directly or contain business logic.

**Correct**

```html
<div id="vendor-carousel" class="carousel">...</div>
<script type="text/x-magento-init">
	{ "#vendor-carousel": { "carousel": { "autoplay": true } } }
</script>
```

**Wrong**

```html
<script>
	jQuery("#vendor-carousel").carousel({ autoplay: true });
</script>
```

## Preferred pattern

```text
app/design/frontend/Vendor/orange/
├── theme.xml
├── registration.php
├── composer.json                     (optional)
├── etc/view.xml                      (only if image sizes differ from the parent)
├── media/preview.jpg
├── requirejs-config.js
├── web/
│   ├── css/source/_extend.less
│   ├── images/logo.svg
│   └── js/carousel.js
└── Magento_Checkout/web/template/minicart/content.html
```

```php
<?php
use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::THEME, 'frontend/Vendor/orange', __DIR__);
```

```javascript
// requirejs-config.js
var config = {
	map: { "*": { carousel: "js/carousel" } },
	paths: { slick: "js/slick.min" },
	shim: { slick: { deps: ["jquery"] } }
};
```

```javascript
// web/js/carousel.js
define(["jquery", "slick"], function ($) {
	"use strict";
	return function (config, element) {
		$(element).slick(config);
	};
});
```

A `logo.svg` in `web/images` is picked up as the theme logo with no declaration. To extend a jQuery widget, depend on
`jquery-ui-modules/widget` (individual jQuery UI components for frontend and base) and call
`$.widget('vendor.name', $.mage.<widget>, {...})`. To extend a UI component class, return
`Component.extend({ defaults: {...} })`. When markup with `data-mage-init` is injected by AJAX, call
`.trigger('contentUpdated')` on it. In Knockout templates, any property bound with `html` must end in
`UnsanitizedHtml`.

## Common failure modes

- Theme files created but the theme never selected in Design Configuration, so the storefront shows no change.
- A theme template saved at a different relative path from the module's: the path under `templates/` must match the
  original, or the fallback never finds it.
- `_extend.less` in a grandchild theme silently replacing the parent's `_extend.less`.
- `@magento_import` used in a partial file, or written without the leading `//`, so it is ignored.
- `@import` without extension: the processed file differs from the source, so client-side mode and Grunt publish copies
  instead of symlinks, and imported CSS may not be found.
- Client-side compilation left on: slow pages and flash of unstyled text; production mode always compiles server-side.
- Reloading a page to debug LESS: only the styles of that page compile, and errors are not shown. Use
  `bin/magento setup:static-content:deploy` (with `-f` in developer or default mode) and read `var/log/system.log`.
- Mixin declared in a different area directory from the mixin file, or the overwriting module without `<sequence>`.
- External `paths` URLs missing from the CSP allow list, raising console errors.
- UI component configured on the storefront without styles: they must be added manually there.

## Review checklist

- [ ] The theme lives in `app/design/frontend/<Vendor>/<theme>/` with `theme.xml`, `registration.php` and a `parent`
- [ ] No edits to shipped themes, core module JavaScript or `lib/web`
- [ ] New rules are in `_extend.less`; `_theme.less` exists only as a full copy of the parent's
- [ ] CSS is included from layout, not from templates
- [ ] `requirejs-config.js` sits in the theme root, a theme module folder or `view/<area>` of a module
- [ ] Mixins are declared in the same area as their files; overwritten mixins have `<sequence>` on the original
- [ ] Components are initialized with `data-mage-init` or `text/x-magento-init`, without inline business logic
- [ ] Knockout `html` bindings use `UnsanitizedHtml` names
- [ ] `pub/static` and `var/view_preprocessed` were cleaned and the change verified in developer mode

## Related skills

- [`adobe-commerce-layout-and-templates`](../adobe-commerce-layout-and-templates/SKILL.md): layout XML, blocks and
  `.phtml` templates
- [`adobe-commerce-deploy-and-modes`](../adobe-commerce-deploy-and-modes/SKILL.md): static content deploy and modes
- [`adobe-commerce-security`](../adobe-commerce-security/SKILL.md): XSS and CSP

## Reference

- [Theme structure](https://developer.adobe.com/commerce/frontend-core/guide/themes/structure) (source: `commerce-frontend-core/src/pages/guide/themes/structure.md`)
- [Create a storefront theme](https://developer.adobe.com/commerce/frontend-core/guide/themes/create-storefront) (source: `commerce-frontend-core/src/pages/guide/themes/create-storefront.md`)
- [Apply and configure a storefront theme](https://developer.adobe.com/commerce/frontend-core/guide/themes/apply-storefront) (source: `commerce-frontend-core/src/pages/guide/themes/apply-storefront.md`)
- [Theme inheritance](https://developer.adobe.com/commerce/frontend-core/guide/themes/inheritance) (source: `commerce-frontend-core/src/pages/guide/themes/inheritance.md`)
- [Template customization example](https://developer.adobe.com/commerce/frontend-core/guide/templates/sample) (source: `commerce-frontend-core/src/pages/guide/templates/sample.md`)
- [Cascading style sheets (CSS)](https://developer.adobe.com/commerce/frontend-core/guide/css/) (source: `commerce-frontend-core/src/pages/guide/css/index.md`)
- [Include CSS](https://developer.adobe.com/commerce/frontend-core/guide/css/themes) (source: `commerce-frontend-core/src/pages/guide/css/themes.md`)
- [CSS and LESS preprocessing](https://developer.adobe.com/commerce/frontend-core/guide/css/preprocess) (source: `commerce-frontend-core/src/pages/guide/css/preprocess.md`)
- [Customize theme styles](https://developer.adobe.com/commerce/frontend-core/guide/css/quickstart/customize-styles) (source: `commerce-frontend-core/src/pages/guide/css/quickstart/customize-styles.md`)
- [Compilation mode](https://developer.adobe.com/commerce/frontend-core/guide/css/quickstart/compilation-mode) (source: `commerce-frontend-core/src/pages/guide/css/quickstart/compilation-mode.md`)
- [RequireJS in Commerce](https://developer.adobe.com/commerce/frontend-core/javascript/requirejs) (source: `commerce-frontend-core/src/pages/javascript/requirejs.md`)
- [JavaScript resources](https://developer.adobe.com/commerce/frontend-core/javascript/resources) (source: `commerce-frontend-core/src/pages/javascript/resources.md`)
- [JavaScript mixins](https://developer.adobe.com/commerce/frontend-core/javascript/mixins) (source: `commerce-frontend-core/src/pages/javascript/mixins.md`)
- [Custom JavaScript](https://developer.adobe.com/commerce/frontend-core/javascript/custom) (source: `commerce-frontend-core/src/pages/javascript/custom.md`)
- [Call and initialize JavaScript](https://developer.adobe.com/commerce/frontend-core/javascript/init) (source: `commerce-frontend-core/src/pages/javascript/init.md`)
- [Introduction to UI components](https://developer.adobe.com/commerce/frontend-core/ui-components/) (source: `commerce-frontend-core/src/pages/ui-components/index.md`)
- [XML declaration](https://developer.adobe.com/commerce/frontend-core/ui-components/concepts/xml-declaration) (source: `commerce-frontend-core/src/pages/ui-components/concepts/xml-declaration.md`)
- [Cross-site scripting (XSS)](https://developer.adobe.com/commerce/php/development/security/cross-site-scripting) (source: `commerce-php/src/pages/development/security/cross-site-scripting.md`)
