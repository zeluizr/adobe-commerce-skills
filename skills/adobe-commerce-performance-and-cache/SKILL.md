---
name: adobe-commerce-performance-and-cache
description: "Apply when writing or reviewing Adobe Commerce module code that affects the full page cache, Varnish, cache types or indexers. Covers cacheable and uncacheable blocks, public versus private content (customer-data sections and sections.xml), HTTP context variables and X-Magento-Vary, IdentityInterface cache tags for invalidation, ESI blocks with ttl, custom cache types in cache.xml, and custom indexers with indexer.xml and mview.xml. Use for keeping storefront pages cacheable while showing per-customer data."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Performance and cache for module developers

## When this skill applies

Use this skill when a module in Adobe Commerce (Magento) renders storefront output, stores data in the application cache, or needs data reorganized by an indexer.

- Adding a block to a layout and deciding whether the page stays cacheable
- Showing customer-specific data (cart, wishlist, name, comparison list) on a cached page
- Making cached pages invalidate when your entity changes
- Declaring a custom cache type that merchants can clean in Cache Management
- Declaring a custom indexer that runs on save or by schedule

Do not use this skill for:

- Layout XML structure, templates and ViewModels in general (use `adobe-commerce-layout-and-templates`)
- Knockout, RequireJS and UI component details beyond the customer-data pattern (use `adobe-commerce-frontend-luma`)
- GraphQL `@cache` directives and resolver identity classes (use `adobe-commerce-webapi`)
- Cron groups that run indexers and consumers (use `adobe-commerce-cron-and-queues`)
- Modes, static content deployment and production deploy steps (use `adobe-commerce-deploy-and-modes`)
- Installing and tuning the Varnish, Redis or Valkey servers themselves (see the configuration guide pages in Reference)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- All pages are cacheable by default. A single block with `cacheable="false"` makes the whole page uncacheable.
- Use `cacheable="false"` only for pages that are inherently uncacheable (cart, checkout, compare products, payment return pages, debug pages, AJAX data sources). Never on catalog, product or CMS pages.
- Public content (header, footer, category listing) is cached server side and shared. Private content (cart, wishlist, customer name, address) is stored client side and must stay a small part of the page.
- Per-customer data goes through the customer-data JS library: a section source class, a `SectionPoolInterface` entry in `di.xml`, a block and template with Knockout placeholders, and a `sections.xml` that names the actions that invalidate the section.
- Only `GET` and `HEAD` are cacheable. Every state change (add to cart, add to wishlist) uses `POST` or `PUT`.
- If the same URL must show different public content to groups of visitors, add an HTTP context variable in a `before` plugin on `Magento\Framework\App\Http\Context::getVaryString`, calling `$subject->setValue('CONTEXT_AGE', $value, $default)`. Never make the variable per user: context variables are part of the public cache key, so one per user stores a copy of the content per user. Always pass the default value, which keeps the cache key equal for newcomers and for visitors who already have the `X-Magento-Vary` cookie.
- Entities and the blocks that render them implement `Magento\Framework\DataObject\IdentityInterface` so the application knows which cache to clear. Keep tags few, and do not use invalidation for store setup actions.
- A controller that does not use layouts sets `no-cache` HTTP headers itself.
- A block that must refresh on its own schedule inside a cached page can use the `ttl` attribute; with Varnish as the caching application this produces an ESI include.
- Data your module caches itself goes in a custom cache type (`etc/cache.xml`) so merchants can clean it in Cache Management. When storefront queries need precomputed data that default indexers do not cover, write a custom indexer (`etc/indexer.xml` plus `etc/mview.xml`).
- With Varnish hosts configured through `bin/magento setup:config:set --http-cache-hosts`, cleaning the cache also purges Varnish, and saving categories, prices, products and price rules purges it automatically.
- Prefer `bin/magento cache:clean` over `cache:flush`. Cleaning touches only enabled Adobe Commerce cache types; flushing purges the whole storage, which other applications may share.

## Hard constraints

### Constraint: Do not mark blocks on content pages or in default.xml as uncacheable

`cacheable="false"` belongs only on blocks of pages that cannot be cached, never on catalog, product or CMS pages, and never in `default.xml`.

**Why this matters**

The application disables page caching when at least one non-cacheable block is in the layout. In `default.xml` that disables caching for all pages on the site, and on content pages it has an adverse effect on performance.

**Detection**

Search layout files for `cacheable="false"`. Flag any hit in `default.xml`, `catalog_product_view.xml`, `catalog_category_view.xml`, `cms_*.xml`, or any handle loaded on content pages.

**Correct**

```xml
<!-- view/frontend/layout/vendor_module_return_index.xml: a payment return page -->
<referenceContainer name="content">
    <block class="Vendor\Module\Block\ReturnPage" name="vendor.module.return"
           template="Vendor_Module::return.phtml" cacheable="false"/>
</referenceContainer>
```

**Wrong**

```xml
<!-- view/frontend/layout/default.xml -->
<referenceContainer name="header.panel">
    <block class="Vendor\Module\Block\Greeting" name="vendor.module.greeting"
           template="Vendor_Module::greeting.phtml" cacheable="false"/>
</referenceContainer>
```

### Constraint: Render customer-specific data through customer-data sections, not in the page HTML

A cacheable page must render without sensitive private data; session and customer DTO objects are empty there. Put per-customer data in a section source and render it client side.

**Why this matters**

Public content is served to many visitors from the reverse proxy. Customer data printed into that HTML leaks to other customers or forces the page uncacheable. The `$_isScopePrivate` block property is obsolete and does not work properly.

**Detection**

Look for blocks on cacheable pages that read `Magento\Customer\Model\Session`, the cart or the wishlist and print values in PHP. Look for `$_isScopePrivate`. A section source must implement `Magento\Customer\CustomerData\SectionSourceInterface` and be registered in `SectionPoolInterface`.

**Correct**

```xml
<!-- etc/frontend/di.xml -->
<type name="Magento\Customer\CustomerData\SectionPoolInterface">
    <arguments>
        <argument name="sectionSourceMap" xsi:type="array">
            <item name="vendor-favorites" xsi:type="string">Vendor\Module\CustomerData\Favorites</item>
        </argument>
    </arguments>
</type>
```

**Wrong**

```php
// Block on a cacheable page
public function getCustomerName(): string { return $this->customerSession->getCustomer()->getName(); }
```

### Constraint: Change state only with POST or PUT

Controllers that add, remove or update anything accept `POST` or `PUT`, and private sections are invalidated on those requests.

**Why this matters**

`GET` and `HEAD` are cacheable. A state change behind `GET` can be cached and prevents updates to private content, and `sections.xml` invalidation runs on `POST` or `PUT` requests.

**Detection**

Find controllers, links and AJAX calls that save data and check that they use `POST` or `PUT`, never `GET`. Check that every action that changes a section appears in `etc/frontend/sections.xml`.

**Correct**

```xml
<!-- etc/frontend/sections.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Customer:etc/sections.xsd">
    <action name="vendor_module/favorites/add">
        <section name="vendor-favorites"/>
    </action>
</config>
```

**Wrong**

```html
<!-- link that changes state with GET -->
<a href="/vendor_module/favorites/add?id=42">Add to favorites</a>
```

### Constraint: Implement IdentityInterface on the entity and on the block that renders it

The entity returns tags built from a `CACHE_TAG` constant and its ID, and the block returns the identities of what it renders.

**Why this matters**

The application uses `IdentityInterface` to link entities with cached content and to know what to clear when an entity changes. Without it, edits do not reach cached pages. Cache storage performance depends on the number of tags per record, so return only what the output depends on.

**Detection**

A model rendered on cacheable pages without `getIdentities()`, or a block that renders it without `getIdentities()`. Tags that include volatile data or store setup entities.

**Correct**

```php
class Brand extends AbstractModel implements IdentityInterface
{
    public const CACHE_TAG = 'vendor_brand';

    public function getIdentities()
    {
        return [self::CACHE_TAG . '_' . $this->getId()];
    }
}

class BrandView extends Template implements IdentityInterface
{
    public function getIdentities()
    {
        return $this->getBrand()->getIdentities();
    }
}
```

**Wrong**

```php
class BrandView extends Template {} // renders brand data, declares no identities
```

### Constraint: Give every custom indexer the three reindex operations and a matching view

The indexer class implements `Magento\Framework\Indexer\ActionInterface` (`executeFull`, `executeList`, `executeRow`) and `Magento\Framework\Mview\ActionInterface` (`execute`), and `indexer.xml` references a `view_id` declared in `mview.xml`.

**Why this matters**

`id` and `view_id` are required in `indexer.xml`. In Update by Schedule mode, MySQL triggers on the subscribed tables write to the `<view_id>_cl` change log and cron calls `execute` with the changed IDs. Indexers in Update on Save mode need custom code (plugins or events) to trigger reindexing.

**Detection**

`indexer.xml` without `view_id`, a `view_id` with no `<view>` in `mview.xml`, or an indexer class that lacks one of the methods.

**Correct**

```xml
<!-- etc/indexer.xml -->
<indexer id="vendor_popular" view_id="vendor_popular_order" class="Vendor\Module\Model\Indexer\Popular">
    <title translate="true">Popular Products</title>
    <description translate="true">Sort products in a category by popularity</description>
</indexer>
<!-- etc/mview.xml -->
<view id="vendor_popular_order" class="Vendor\Module\Model\Indexer\Popular" group="indexer">
    <subscriptions>
        <table name="sales_order" entity_column="entity_id"/>
    </subscriptions>
</view>
```

**Wrong**

```xml
<!-- no view_id, no mview.xml: the indexer cannot run by schedule -->
<indexer id="vendor_popular" class="Vendor\Module\Model\Indexer\Popular"/>
```

## Preferred pattern

A custom cache type, declared in `etc/cache.xml` and backed by a `TagScope` model:

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Cache/etc/cache.xsd">
    <type name="vendor_module" translate="label,description" instance="Vendor\Module\Model\Cache\Type\CacheType">
        <label>Vendor Module</label>
        <description>Data cached by Vendor_Module</description>
    </type>
</config>
```

```php
namespace Vendor\Module\Model\Cache\Type;

use Magento\Framework\App\Cache\Type\FrontendPool;
use Magento\Framework\Cache\Frontend\Decorator\TagScope;

class CacheType extends TagScope
{
    public const TYPE_IDENTIFIER = 'vendor_module';
    public const CACHE_TAG = 'VENDOR_MODULE';

    public function __construct(FrontendPool $cacheFrontendPool)
    {
        parent::__construct($cacheFrontendPool->get(self::TYPE_IDENTIFIER), self::CACHE_TAG);
    }
}
```

Save and load with `Magento\Framework\App\CacheInterface` and a serializer, tagging records with `CacheType::CACHE_TAG`. Invalidate with `Magento\Framework\App\Cache\TypeListInterface::invalidate(CacheType::TYPE_IDENTIFIER)` and clean with `cleanType()`.

For private content, the UI component reads the section with `customerData.get('vendor-favorites')`, which returns a Knockout observable, after calling `this._super()` in `initialize`.

While developing, `bin/magento cache:clean layout block_html full_page`, `bin/magento indexer:status`, `indexer:reindex <id>` and `indexer:set-mode {realtime|schedule} <id>` cover the usual checks.

## Common failure modes

- `cacheable="false"` added to fix a stale greeting, making every page uncacheable.
- Customer name printed in PHP on a cached page and shown to the next visitor.
- A section that never refreshes because the action that changes it is missing from `sections.xml`, or the change runs on `GET`.
- An `action` in `sections.xml` with no sections, overridden by another module that declares sections for the same action; use `<section name="*"/>` to reload all.
- Expecting product data in the cart section to update at once; it refreshes after `section_data_lifetime` (60 minutes by default) or the next action that updates the cart.
- Indexer set to `schedule` but the triggers are missing; switching to `realtime` and back to `schedule` resets them.
- Switching indexer modes while cron runs, causing database locks; use maintenance mode and disable cron first.

## Review checklist

- [ ] No `cacheable="false"` in `default.xml` or on catalog, product or CMS handles
- [ ] Cacheable pages use `GET`, render only cacheable blocks and contain no session data
- [ ] Per-customer data comes from a section source registered in `SectionPoolInterface`
- [ ] Every state-changing action is `POST` or `PUT` and listed in `etc/frontend/sections.xml`
- [ ] Entity models and their blocks implement `IdentityInterface` with minimal tags
- [ ] Context variables are group-level and set with a default value
- [ ] Controllers without layouts send `no-cache` headers
- [ ] Custom cache type declared in `cache.xml`, extends `TagScope`, invalidated through `TypeListInterface`
- [ ] Custom indexer implements `executeFull`, `executeList`, `executeRow` and `execute`, with `view_id` matching `mview.xml`
- [ ] All indexers of the module are in one `indexer.xml`, and all Mview declarations in one `mview.xml`

## Related skills

- [`adobe-commerce-layout-and-templates`](../adobe-commerce-layout-and-templates/SKILL.md): layout XML, blocks and templates where the cache attributes live
- [`adobe-commerce-frontend-luma`](../adobe-commerce-frontend-luma/SKILL.md): Knockout and UI components that render private sections
- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): the plugin on `Http\Context` and the `SectionPoolInterface` argument
- [`adobe-commerce-webapi`](../adobe-commerce-webapi/SKILL.md): GraphQL query caching with identity classes
- [`adobe-commerce-cron-and-queues`](../adobe-commerce-cron-and-queues/SKILL.md): the `index` cron group that runs scheduled indexers

## Reference

- [Page caching](https://developer.adobe.com/commerce/php/development/cache/page/) (source: `commerce-php/src/pages/development/cache/page/index.md`)
- [Public content](https://developer.adobe.com/commerce/php/development/cache/page/public-content) (source: `commerce-php/src/pages/development/cache/page/public-content.md`)
- [Private content](https://developer.adobe.com/commerce/php/development/cache/page/private-content) (source: `commerce-php/src/pages/development/cache/page/private-content.md`)
- [Partial caching](https://developer.adobe.com/commerce/php/development/cache/partial/) (source: `commerce-php/src/pages/development/cache/partial/index.md`)
- [Create a cache type](https://developer.adobe.com/commerce/php/development/cache/partial/cache-type) (source: `commerce-php/src/pages/development/cache/partial/cache-type.md`)
- [Indexing](https://developer.adobe.com/commerce/php/development/components/indexing/) (source: `commerce-php/src/pages/development/components/indexing/index.md`)
- [Create a custom indexer](https://developer.adobe.com/commerce/php/development/components/indexing/custom-indexer) (source: `commerce-php/src/pages/development/components/indexing/custom-indexer.md`)
- [Page caching (frontend)](https://developer.adobe.com/commerce/frontend-core/guide/caching) (source: `commerce-frontend-core/src/pages/guide/caching.md`)
- [Caching overview](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cache/caching-overview) (source: `commerce-operations.en/help/configuration/cache/caching-overview.md`)
- [Configure cache frontends and types](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cache/cache-types) (source: `commerce-operations.en/help/configuration/cache/cache-types.md`)
- [Configure Varnish ESI block](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cache/use-varnish-esi) (source: `commerce-operations.en/help/configuration/cache/use-varnish-esi.md`)
- [Cache clearing with Varnish](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cache/use-varnish-cache) (source: `commerce-operations.en/help/configuration/cache/use-varnish-cache.md`)
- [Manage the cache](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/manage-cache) (source: `commerce-operations.en/help/configuration/cli/manage-cache.md`)
- [Manage the indexers](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/manage-indexers) (source: `commerce-operations.en/help/configuration/cli/manage-indexers.md`)
