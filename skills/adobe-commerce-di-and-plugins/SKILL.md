---
name: adobe-commerce-di-and-plugins
description: "Apply when writing or reviewing di.xml or constructor dependencies in an Adobe Commerce module. Covers constructor injection, the object manager usage rules, preferences, type and virtualType arguments and their xsi:type values, shared lifestyle, global versus area di.xml and how arguments merge, before/after/around plugins with sortOrder and disabling, proxies, factories and generated code. Use for customizing core behavior without editing it, lazy-loading heavy dependencies, or debugging plugin order."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Dependency injection and plugins

## When this skill applies

Use this skill when the change is about how Adobe Commerce (Magento) builds objects or intercepts public methods.

- Adding constructor dependencies to a class
- Writing `etc/di.xml` or `etc/<area>/di.xml`: `preference`, `type`, `virtualType`, `arguments`, `plugin`
- Writing a plugin class with `before`, `after` or `around` methods
- Deciding between a plugin, a preference and an observer
- Lazy-loading an expensive dependency with a proxy
- Creating model instances through a factory instead of `new` or the object manager
- Diagnosing plugin execution order or stale generated classes

Do not use this skill for:

- `registration.php`, `module.xml` and `composer.json` (use `adobe-commerce-module-contract`)
- `events.xml` and observer classes (use `adobe-commerce-events-and-observers`)
- Sensitive and environment configuration paths in depth (use `adobe-commerce-security` and `adobe-commerce-deploy-and-modes`)
- Running `setup:di:compile` in a deployment pipeline (use `adobe-commerce-deploy-and-modes`)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Never edit core code: changes are overwritten between upgrades. Reach for plugins, interface preferences and event observers instead.
- Declare every dependency, required or optional, in the constructor. Use method injection only for objects that cannot be injected (the example in the docs is a command passed to `processCommand()`).
- Depend on interfaces, not concrete classes, and map implementations in `di.xml`.
- Need a newable object (a model such as `Product` that needs an id or input)? Inject its factory (`<ClassName>Factory`) and call `create()`. Factories are generated; write one only for specific behavior.
- An expensive dependency used only in some methods: inject `<ClassName>\Proxy` through `di.xml` arguments, never by type-hinting the proxy in the constructor.
- Want to change one constructor argument for one consumer without affecting others: `virtualType` plus a `type` argument pointing to it, not a subclass.
- Want to change the input or the result of a public method: `before` or `after` plugin. Since 2.2 `after` methods receive the observed method's arguments, so access to arguments is no longer a reason for `around`.
- Use `around` only when the original method and the rest of the chain must be substituted or terminated in some scenarios.
- Use a `preference` to replace an implementation. Overriding a core method with a preference is not recommended: it can cause conflicts and makes upgrades harder; prefer observers and plugins when possible.
- Presentation-layer DI goes in `etc/<area>/di.xml`; everything else in the module's global `etc/di.xml`. `app/etc/di.xml` holds only framework-level settings.
- Need to see what applies to a class? `bin/magento dev:di:info "<Class>"` prints the preference, constructor parameters and plugins for the global area.

## Hard constraints

### Constraint: Do not use the ObjectManager directly

Classes must not ask for `ObjectManager` in the constructor or call `create()`/`get()` on it. Let the framework inject dependencies, and move object creation into a factory or proxy.

**Why this matters**

Direct use hides the real dependencies of a class and bypasses the type validation and type hinting that a factory provides. Direct instantiation with `new` also breaks rewrites: a class created directly does not get preferences applied. Core classes that still call the object manager exist for backward compatibility and are not an endorsement.

**Detection**

`ObjectManagerInterface` or `ObjectManager::getInstance()` in a class that is not a factory, proxy, integration-test fixture, static magic method (`__wakeup()`, `__sleep()`) or backward-compatible constructor shim.

**Correct**

```php
public function __construct(\Magento\Cms\Model\BlockFactory $blockFactory)
{
    $this->blockFactory = $blockFactory;
}

public function build(): \Magento\Cms\Model\Block
{
    return $this->blockFactory->create();
}
```

**Wrong**

```php
public function build()
{
    $om = \Magento\Framework\App\ObjectManager::getInstance();
    return $om->create(\Magento\Cms\Model\Block::class);
}
```

### Constraint: Avoid around plugins unless the chain must be stopped or substituted

Use `before` and `after` plugins by default. When an `around` method is justified, it must call the `callable` and forward the arguments, matching the original signature's defaults and type hints.

**Why this matters**

Around plugins increase stack traces and affect performance. If an around method does not call the `callable`, every plugin later in the chain and the original method are skipped. A plugin that omits `= null` on a nullable parameter makes PHP throw a fatal error when the original method is called with `null`.

**Detection**

An `around*` method that only adds code before or after `$proceed()`; an `around*` method that never calls `$proceed`; a signature that drops defaults or nullability of the observed method.

**Correct**

```php
namespace Vendor\Module\Plugin;

use Magento\Catalog\Model\Product;

class ProductNamePlugin
{
    public function afterGetName(Product $subject, $result)
    {
        return '|' . $result . '|';
    }
}
```

**Wrong**

```php
public function aroundGetName(Product $subject, callable $proceed)
{
    $result = $proceed();
    return '|' . $result . '|'; // an after plugin does this without around
}
```

### Constraint: Only intercept what plugins can intercept, and keep plugins stateless

Plugins work on public methods of classes and interfaces. They cannot be used on final methods, final classes, non-public methods, static methods, `__construct` and `__destruct`, virtual types, objects instantiated before `Magento\Framework\Interception` is bootstrapped, or objects that implement `Magento\Framework\ObjectManager\NoninterceptableInterface`.

**Why this matters**

A plugin declared on one of those targets does not run. The technical guidelines add: plugins must be stateless, should not change the state of `$subject`, should not be added to data objects, should not be used within their own module, and must only throw exceptions declared by the intercepted method (or derived ones).

**Detection**

A `<plugin>` whose `type name` is a virtual type or a final class; a plugin method targeting a protected method or `__construct`; plugin properties that cache per-call data; `$subject->set...()` inside a plugin.

**Correct**

```xml
<type name="Magento\Catalog\Model\Product">
    <plugin name="vendor_module_product_name" type="Vendor\Module\Plugin\ProductNamePlugin" sortOrder="10"/>
</type>
```

**Wrong**

```xml
<!-- Virtual types cannot be intercepted -->
<type name="vendorModuleCustomLogger">
    <plugin name="vendor_module_logger" type="Vendor\Module\Plugin\LoggerPlugin"/>
</type>
```

### Constraint: Declare DI in the narrowest area and mind how arguments merge

Put presentation-layer configuration in `etc/adminhtml/`, `etc/frontend/`, `etc/graphql/`, `etc/webapi_rest/`, `etc/webapi_soap/` or `etc/crontab/` `di.xml`, and use the global `etc/di.xml` only when the behavior must apply in several areas.

**Why this matters**

Configuration loads in stages: initial (`app/etc/di.xml`), global (`<moduleDir>/etc/di.xml`), then area-specific. Arguments declared on the same stage merge; arguments declared on a higher stage replace the existing ones, and array arguments loaded later from a more specific scope replace instead of merging. Registering everything in `global` makes bootstrapping heavier.

**Detection**

A storefront-only plugin or argument in `etc/di.xml`; an area `di.xml` that redefines an array argument expecting its items to be appended to the global ones.

**Correct**

```xml
<!-- Vendor/Module/etc/frontend/di.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:ObjectManager/etc/config.xsd">
    <type name="Magento\Checkout\Block\Onepage\Success">
        <plugin name="vendor_module_success" type="Vendor\Module\Plugin\SuccessPlugin"/>
    </type>
</config>
```

**Wrong**

```xml
<!-- Vendor/Module/etc/di.xml: runs in adminhtml, crontab and every API area too -->
<type name="Magento\Checkout\Block\Onepage\Success">
    <plugin name="vendor_module_success" type="Vendor\Module\Plugin\SuccessPlugin"/>
</type>
```

### Constraint: Never request proxies or interceptors in constructors

Type-hint the original class or interface in the constructor. Swap in `\Proxy` through a `di.xml` argument; interceptors are generated and never referenced.

**Why this matters**

Proxies and interceptors must never be explicitly requested in constructors. Because the proxy is injected by DI configuration, it can be added or removed without touching application code. Interceptors work behind the scenes and are not directly referenced in application code.

**Detection**

`\Proxy` or `\Interceptor` in a constructor type hint or a `use` statement.

**Correct**

```xml
<type name="Vendor\Module\Model\FastLoading">
    <arguments>
        <argument name="slowLoading" xsi:type="object">Vendor\Module\Model\SlowLoading\Proxy</argument>
    </arguments>
</type>
```

**Wrong**

```php
public function __construct(\Vendor\Module\Model\SlowLoading\Proxy $slowLoading)
{
    $this->slowLoading = $slowLoading;
}
```

## Preferred pattern

Constructor injection plus DI configuration, with argument types from the documented set (`object`, `string`, `boolean`, `number`, `init_parameter`, `const`, `null`, `array`):

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:ObjectManager/etc/config.xsd">
    <preference for="Vendor\Module\Api\ExporterInterface" type="Vendor\Module\Model\Exporter"/>

    <virtualType name="vendorModuleExportConfig" type="Vendor\Module\Model\Config">
        <arguments>
            <argument name="type" xsi:type="string">export</argument>
        </arguments>
    </virtualType>

    <type name="Vendor\Module\Model\Exporter">
        <arguments>
            <argument name="config" xsi:type="object">vendorModuleExportConfig</argument>
            <argument name="client" xsi:type="object">Vendor\Module\Model\HttpClient\Proxy</argument>
            <argument name="batchSize" xsi:type="number">100</argument>
        </arguments>
    </type>

    <type name="Vendor\Module\Model\Buffer" shared="false"/>
</config>
```

Plugin rules to remember:

- Name methods `before`, `after` or `around` plus the observed method name with its first letter capitalized (`beforeSetName`); a leading underscore stays as is (`before_construct`).
- A `before` method returns an array of modified arguments, or `null` to leave them unchanged.
- An `after` method must return a value; it receives `$result` and then only the arguments it uses plus the ones before them. If an argument is optional in the observed method, declare it optional too.
- `sortOrder` runs `before` and the first half of `around` from lowest to highest; `after` methods run in the same order once the chain completes. With equal or missing `sortOrder`, the module load order in `app/etc/config.php` and the area decide.
- Disable another module's plugin with `<plugin name="..." disabled="true"/>` under the same `type name`, written with the same leading-slash format it was declared with.
- Plugins on a parent class or interface are inherited by its implementations and subclasses.

Lifestyle: objects are shared (singleton) by default; `shared="false"` on a `type` or `argument` makes them transient.

Generated code: factories, proxies and interceptors are generated when a class cannot be found, unless the application is in production mode. A generated proxy is not regenerated when the original class gains methods, so regenerate it. The compiler writes `generated/metadata/global.php`.

## Common failure modes

- Injecting a model (`Product`) directly instead of its factory, which yields an incomplete object or a creation error.
- An `around` plugin that does what `after` could do, adding stack depth for nothing.
- An `around` plugin that forgets to call `$proceed`, silently skipping the original method and later plugins.
- Plugin signature missing `= null` or a type hint of the observed method.
- Plugins declared on virtual types, final classes, static or protected methods, which never run.
- Disabling a plugin with a different class-name format (with or without leading slash) from the declaration.
- An area `di.xml` array argument that wipes the global items because the higher stage replaces rather than merges.
- Overriding a core method with a `preference` when a plugin would do.
- Business logic or argument validation in a constructor: constructors may only assign dependencies and validate arguments.
- Injecting Request, Session or Cookie objects in a constructor; the guidelines say to pass them as method arguments.
- Stale proxies after the original class changed.

## Review checklist

- [ ] No `ObjectManager` use outside the documented exceptions; no `new` for replaceable services
- [ ] Interfaces in constructors, mapped with `preference`
- [ ] Newable objects come from factories
- [ ] Proxies only through `di.xml` arguments
- [ ] `before`/`after` preferred; every `around` justified, calls `$proceed`, matches the signature
- [ ] Plugin targets are public, non-final, non-static, not virtual types
- [ ] Plugins stateless and do not mutate `$subject`
- [ ] Plugin `name` is unique and `sortOrder` set where order matters
- [ ] DI in the narrowest area; `app/etc/di.xml` untouched
- [ ] Argument `xsi:type` values from the documented list; argument names match constructor parameters

## Related skills

- [`adobe-commerce-module-contract`](../adobe-commerce-module-contract/SKILL.md): where `di.xml` lives and how load order affects plugin order
- [`adobe-commerce-events-and-observers`](../adobe-commerce-events-and-observers/SKILL.md): when an observer fits better than a plugin
- [`adobe-commerce-deploy-and-modes`](../adobe-commerce-deploy-and-modes/SKILL.md): compiling generated code for production

## Reference

- [Dependency injection](https://developer.adobe.com/commerce/php/development/components/dependency-injection) (source: `commerce-php/src/pages/development/components/dependency-injection.md`)
- [Dependency injection configuration](https://developer.adobe.com/commerce/php/development/build/dependency-injection-file) (source: `commerce-php/src/pages/development/build/dependency-injection-file.md`)
- [Plugins](https://developer.adobe.com/commerce/php/development/components/plugins) (source: `commerce-php/src/pages/development/components/plugins.md`)
- [Proxies](https://developer.adobe.com/commerce/php/development/components/proxies) (source: `commerce-php/src/pages/development/components/proxies.md`)
- [Factories](https://developer.adobe.com/commerce/php/development/components/factories) (source: `commerce-php/src/pages/development/components/factories.md`)
- [Object manager](https://developer.adobe.com/commerce/php/development/components/object-manager/) (source: `commerce-php/src/pages/development/components/object-manager/index.md`)
- [Code generation](https://developer.adobe.com/commerce/php/development/components/code-generation) (source: `commerce-php/src/pages/development/components/code-generation.md`)
- [Extension coding](https://developer.adobe.com/commerce/php/best-practices/extensions/) (source: `commerce-php/src/pages/best-practices/extensions/index.md`)
- [Working with the architecture](https://developer.adobe.com/commerce/php/best-practices/extensions/architecture) (source: `commerce-php/src/pages/best-practices/extensions/architecture.md`)
- [Security, performance, and data handling](https://developer.adobe.com/commerce/php/best-practices/extensions/security) (source: `commerce-php/src/pages/best-practices/extensions/security.md`)
- [Technical guidelines](https://developer.adobe.com/commerce/php/coding-standards/technical-guidelines) (source: `commerce-php/src/pages/coding-standards/technical-guidelines.md`)
