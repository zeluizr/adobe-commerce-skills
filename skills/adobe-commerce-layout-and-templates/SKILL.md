---
name: adobe-commerce-layout-and-templates
description: "Apply when writing or reviewing layout XML (page layouts, page configurations, generic layouts), layout handles, blocks, containers, block arguments, view models or .phtml templates in an Adobe Commerce module or theme. Covers the layout instructions (block, container, referenceBlock, referenceContainer, move, remove, update, argument), extending versus overriding layout files, the template fallback, view models with ArgumentInterface, and context-specific escaping with $escaper in templates. Use for adding, moving or removing page elements, passing data to templates and rendering it safely."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Layout XML, blocks, view models and templates

## When this skill applies

Use this skill when a change in Adobe Commerce (Magento) touches the server-rendered view layer: which blocks and
containers a page has, where they sit, which template renders them and what data reaches that template.

- Adding a block or container to every page (`default.xml`) or to one page type (a handle such as
  `catalog_product_view.xml`)
- Moving, hiding or removing an existing element with `<move>`, `display` or `remove`
- Passing arguments or a view model to a block, and reading them in the `.phtml` file
- Declaring or changing a page layout (`1column`, `2columns-left`, ...) and `layouts.xml`
- Overriding a module template from a theme, or a parent theme template from a child theme
- Escaping dynamic output in a `.phtml` template

Do not use this skill for:

- Creating or registering a theme, LESS, RequireJS, mixins, Knockout or UI component JavaScript (use
  `adobe-commerce-frontend-luma`)
- Plugins on layout-related classes and `di.xml` (use `adobe-commerce-di-and-plugins`)
- XSS in general, CSP, form keys and admin ACL (use `adobe-commerce-security`)
- Full page cache, private content and cache tags beyond the `cacheable` attribute (use
  `adobe-commerce-performance-and-cache`)
- Page Builder content types and templates (not covered by these sources)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Layout changes for every page go in `default.xml`; changes for one page go in the file named after its handle. A
  page-type handle is the full action name of the controller (`catalog_product_view`).
- There are three layout file types. A page layout (`page_layout/`) declares the wireframe inside `<body>` and only
  allows `<container>`, `<referenceContainer>`, `<move>` and `<update>`. A page configuration (`layout/`, root
  `<page>`) adds blocks, containers and `<head>` content. A generic layout (`layout/`, root `<layout>` with a
  `<container name="root">`) is for AJAX responses, emails and HTML snippets.
- Use a block for anything that renders HTML through a PHP class and a template; use a container to group children
  and optionally wrap them in an `htmlTag`. An empty container renders nothing.
- Prefer an extending layout file (same file name in the theme `<Vendor>_<Module>/layout/` or in the module
  `view/frontend/layout/`) that contains only the changes. Override (`layout/override/base/` or
  `layout/override/theme/<Vendor>/<theme>/`) only when extending cannot do it: removing block arguments, cancelling
  handle inclusion, or dropping all instructions of a handle.
- To remove a block or container, use `remove="true"` on `<referenceBlock>` or `<referenceContainer>`. `<remove>` is
  only for static resources in `<head>`.
- `display="false"` stops rendering but still generates the PHP objects. `remove="true"` wins over `display`.
- `<move>` runs before removal: an element moved into a removed parent is removed too. A `<move>` of an undefined
  element is skipped.
- `<action>` is deprecated. Use `<arguments>` on `<block>` or `<referenceBlock>` whenever the method allows it.
- When a template is set in more than one way, `<action method="setTemplate">` wins, then the `template` attribute,
  then a `template` argument.
- Put logic that a template needs in a view model (a class implementing
  `Magento\Framework\View\Element\Block\ArgumentInterface`, passed as an `xsi:type="object"` argument). Helpers in
  templates are discouraged. View model instances are shared by default since 2.3.2; add `shared="false"` to get a
  new instance.
- Always give blocks and containers a `name`; a block needs one to be made non-cacheable.
- One block with `cacheable="false"` makes the whole page uncacheable. Never do this on catalog, product or CMS pages.
- To customize a template, copy it to the same relative path under `<theme_dir>/<Vendor>_<Module>/templates/`. Theme
  templates override module templates, and child theme templates override parent ones.

## Hard constraints

### Constraint: Never edit core layout files or templates in place

Customize through extending or overriding files in a custom theme or module.

**Why this matters**

The documentation states that edits to out-of-the-box layouts and templates can be overwritten by new versions of the
default files during upgrades.

**Detection**

A diff touching files under `vendor/magento/` or `app/code/Magento/`, or under the shipped `Magento/blank` and
`Magento/luma` theme directories.

**Correct**

```xml
<!-- app/design/frontend/Vendor/theme/Magento_Theme/layout/default.xml -->
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <body>
        <referenceBlock name="copyright" remove="true"/>
    </body>
</page>
```

**Wrong**

```xml
<!-- edited directly in vendor/magento/module-theme/view/frontend/layout/default.xml -->
<!-- <block class="Magento\Theme\Block\Html\Footer" name="copyright" .../> deleted by hand -->
```

### Constraint: Remove blocks with the remove attribute, not with remove

`<remove src="..."/>` only removes CSS, JS and font resources from `<head>`.

**Why this matters**

Using `<remove>` against a block name does not remove the block, so the element keeps rendering.

**Detection**

A `<remove>` element inside `<body>`, or one with a `name` instead of `src`.

**Correct**

```xml
<referenceContainer name="sidebar.additional" remove="true"/>
```

**Wrong**

```xml
<remove name="sidebar.additional"/>
```

### Constraint: Do not instantiate objects inside templates

Templates must only display data received from the block; objects come from the block or from a view model passed in
layout.

**Why this matters**

The documentation requires stateless templates so they have no side effects, stay testable and keep a clear
separation between logic and presentation.

**Detection**

`ObjectManager::getInstance()`, `new SomeClass(` or helper calls in a `.phtml` file.

**Correct**

```xml
<block name="vendor.product.note" template="Vendor_Module::product/note.phtml">
    <arguments>
        <argument name="view_model" xsi:type="object">Vendor\Module\ViewModel\ProductNote</argument>
    </arguments>
</block>
```

**Wrong**

```php
<?php $note = \Magento\Framework\App\ObjectManager::getInstance()->get(\Vendor\Module\Model\Note::class); ?>
```

### Constraint: Escape every dynamic value with the method for its context

Use `$escaper->escapeHtml()` for tag content, `escapeHtmlAttr()` for attributes, `escapeUrl()` for URLs in `href`
and similar attributes, and `escapeJs()` for JavaScript strings.

**Why this matters**

Output escaping is, per the documentation, the main protection against XSS, and the `Magento2.Security.XssTemplate`
sniff fails on unescaped `echo` output. Values that need no escaping are only casts (`(int)`, `(bool)`), `count()`, literal strings and
methods whose name says the result is already HTML (`getTitleHtml()`).

**Detection**

`<?= $block->get...() ?>` or `<?= $viewModel->...() ?>` without an `$escaper` call, a cast, or an `Html` method name.

**Correct**

```php
<a href="<?= $escaper->escapeUrl($block->getUrl()) ?>"><?= $escaper->escapeHtml($block->getLabel()) ?></a>
```

**Wrong**

```php
<a href="<?= $block->getUrl() ?>"><?= $block->getLabel() ?></a>
```

### Constraint: Do not make content pages uncacheable

`cacheable="false"` belongs only on blocks of pages that are personal by nature (cart, checkout, customer forms).

**Why this matters**

If any block in a layout is uncacheable, the entire page is uncacheable. The documentation warns that doing this on
catalog, product or CMS pages harms performance.

**Detection**

`cacheable="false"` in `default.xml`, `catalog_product_view.xml`, `catalog_category_view.xml` or `cms_*` handles.

**Correct**

```xml
<block class="Magento\Customer\Block\Form\Edit" name="customer_edit" template="Magento_Customer::form/edit.phtml" cacheable="false"/>
```

**Wrong**

```xml
<!-- Vendor/Module/view/frontend/layout/default.xml -->
<block class="Vendor\Module\Block\Greeting" name="vendor.greeting" cacheable="false"/>
```

## Preferred pattern

A module that adds a note below the product price, with the logic in a view model.

```text
app/code/Vendor/Module/
├── ViewModel/ProductNote.php
└── view/frontend/
    ├── layout/catalog_product_view.xml
    └── templates/product/note.phtml
```

```xml
<!-- view/frontend/layout/catalog_product_view.xml -->
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <body>
        <referenceContainer name="product.info.main">
            <block name="vendor.product.note" template="Vendor_Module::product/note.phtml" after="product.info.price">
                <arguments>
                    <argument name="css_class" xsi:type="string">product-note</argument>
                    <argument name="view_model" xsi:type="object">Vendor\Module\ViewModel\ProductNote</argument>
                </arguments>
            </block>
        </referenceContainer>
    </body>
</page>
```

```php
<?php
namespace Vendor\Module\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;

class ProductNote implements ArgumentInterface
{
    public function getTitle(): string
    {
        return 'Free returns';
    }
}
```

```php
<?php
/** @var \Magento\Framework\View\Element\Template $block */
/** @var \Magento\Framework\Escaper $escaper */
/** @var \Vendor\Module\ViewModel\ProductNote $viewModel */
$viewModel = $block->getViewModel();
?>
<p class="<?= $escaper->escapeHtmlAttr($block->getCssClass()) ?>">
    <?= $escaper->escapeHtml($viewModel->getTitle()) ?>
</p>
```

The `template` attribute carries the module prefix (`Vendor_Module::`), which the documentation recommends to avoid
rendering failures. Without a `class`, the block is `Magento\Framework\View\Element\Template`. Arguments are read with
`getData('css_class')` or the magic `getCssClass()`, and checked with `hasData()`. Text is wrapped in `__()` for
translation. After changing layout files, clean the `layout` and `full_page` cache types
(`bin/magento cache:clean layout full_page`).

## Common failure modes

- Blocks without `name`: they get an `ANONYMOUS_n` name that nothing else can reference, and cannot be made
  non-cacheable.
- `before` and `after` that point to an element outside the same parent: the element lands at a random position.
  When both are set, `after` wins.
- A theme override placed in `layout/` instead of `layout/override/base/`, so it extends instead of replacing (or the
  reverse).
- Changing a block name or alias, or a page type parent handle, in an overriding file: the documentation lists both as
  customization mistakes.
- Expecting a missing `template` to render: a block without `template` renders nothing unless its class defines
  `$_template`.
- Layout XML that only fails in developer mode: there, XSD validation halts the request; in production and default
  modes errors only go to `var/log` and XSD validation is skipped.
- Treating JSON inside an HTML attribute like tag content: it needs `escapeHtmlAttr()`. JavaScript inside an attribute
  needs `escapeJs()` and then `escapeHtmlAttr()`.
- Allowing tags in `escapeHtml($text, ['a'])` and expecting `img`, `iframe` or `script` to pass: those tags are never
  allowed.

## Review checklist

- [ ] No file under `vendor/magento/`, `app/code/Magento/` or the shipped themes is edited
- [ ] Every new block and container has a unique `name`
- [ ] Templates use the `Vendor_Module::path.phtml` form
- [ ] Removals use `remove="true"` on a reference; `<remove>` only appears in `<head>`
- [ ] No `<action>` where an `<argument>` can do the same
- [ ] Logic needed by the template lives in a view model implementing `ArgumentInterface`, not in a helper or in the
      `.phtml`
- [ ] Every dynamic `echo` in templates goes through the right `$escaper` method, a cast or an `Html` method
- [ ] No `cacheable="false"` on catalog, product, CMS or `default` handles
- [ ] Overrides exist only for changes that extending cannot express
- [ ] Layout validated in developer mode before shipping

## Related skills

- [`adobe-commerce-frontend-luma`](../adobe-commerce-frontend-luma/SKILL.md): themes, fallback of static files, LESS
  and JavaScript
- [`adobe-commerce-security`](../adobe-commerce-security/SKILL.md): XSS beyond templates, CSP and form keys
- [`adobe-commerce-performance-and-cache`](../adobe-commerce-performance-and-cache/SKILL.md): full page cache and
  private content
- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): plugins that change layout from PHP

## Reference

- [Layouts](https://developer.adobe.com/commerce/frontend-core/guide/layouts/) (source: `commerce-frontend-core/src/pages/guide/layouts/index.md`)
- [Layout file types](https://developer.adobe.com/commerce/frontend-core/guide/layouts/types) (source: `commerce-frontend-core/src/pages/guide/layouts/types.md`)
- [Layout instructions](https://developer.adobe.com/commerce/frontend-core/guide/layouts/xml-instructions) (source: `commerce-frontend-core/src/pages/guide/layouts/xml-instructions.md`)
- [Common layout customization tasks](https://developer.adobe.com/commerce/frontend-core/guide/layouts/xml-manage) (source: `commerce-frontend-core/src/pages/guide/layouts/xml-manage.md`)
- [Extend a layout](https://developer.adobe.com/commerce/frontend-core/guide/layouts/extend) (source: `commerce-frontend-core/src/pages/guide/layouts/extend.md`)
- [Override a layout](https://developer.adobe.com/commerce/frontend-core/guide/layouts/override) (source: `commerce-frontend-core/src/pages/guide/layouts/override.md`)
- [Templates](https://developer.adobe.com/commerce/frontend-core/guide/templates/) (source: `commerce-frontend-core/src/pages/guide/templates/index.md`)
- [Basic template concepts](https://developer.adobe.com/commerce/frontend-core/guide/templates/override) (source: `commerce-frontend-core/src/pages/guide/templates/override.md`)
- [Theme inheritance](https://developer.adobe.com/commerce/frontend-core/guide/themes/inheritance) (source: `commerce-frontend-core/src/pages/guide/themes/inheritance.md`)
- [Page caching](https://developer.adobe.com/commerce/frontend-core/guide/caching) (source: `commerce-frontend-core/src/pages/guide/caching.md`)
- [View models](https://developer.adobe.com/commerce/php/development/components/view-models) (source: `commerce-php/src/pages/development/components/view-models.md`)
- [Cross-site scripting (XSS)](https://developer.adobe.com/commerce/php/development/security/cross-site-scripting) (source: `commerce-php/src/pages/development/security/cross-site-scripting.md`)
