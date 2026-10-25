---
name: adobe-commerce-events-and-observers
description: "Apply when writing or reviewing events.xml, observer classes or custom event dispatch in an Adobe Commerce module. Covers the event manager dispatch call, observer declaration attributes (name, instance, disabled, shared), event areas from global to webapi_soap, observer naming and merge, disabling another module's observer, observer best practices, and the documented rules for choosing a plugin or an observer. Use for reacting to core events, exposing custom events, or auditing observers that slow down or loop."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Events and observers

## When this skill applies

Use this skill when code in an Adobe Commerce (Magento) module reacts to an event or dispatches one.

- Writing an observer that runs when a core or custom event is dispatched
- Declaring observers in `etc/events.xml` or `etc/<area>/events.xml`
- Dispatching a custom event from your own class so other modules can hook in
- Disabling or replacing an observer declared by another module
- Choosing between an observer and a plugin
- Reviewing observers for performance, area scope, loops and order assumptions

Do not use this skill for:

- Plugins and `di.xml` (use `adobe-commerce-di-and-plugins`)
- Module registration, `module.xml` and load order (use `adobe-commerce-module-contract`)
- Scheduled jobs in `crontab.xml` and message queue consumers (use `adobe-commerce-cron-and-queues`)
- Adobe I/O Events, Adobe Commerce Webhooks and App Builder, which send events out of the process (use the official `adobe/skills`)

## Decision rules

Plugin or observer, as the documentation states it:

- To **modify** the input or output of a function, use a plugin. Values (including objects) passed to an event must not be modified in the observer, and events should not change the state of observable objects.
- To **run your own code in response to** an event dispatched by a module (or by your own code), use an observer.
- Plugins only reach public methods of classes and interfaces; they cannot intercept final, non-public or static methods, constructors or virtual types. Events exist only where a module dispatches them: check the list of events for the name and the arguments passed.
- Prefer either of them over a `preference` that overrides a core method, and never edit core code.

Other rules:

- Declare observers in the narrowest area: `etc/frontend/events.xml`, `etc/adminhtml/events.xml`, `etc/crontab/events.xml`, `etc/graphql/events.xml`, `etc/webapi_rest/events.xml` or `etc/webapi_soap/events.xml`. Use `etc/events.xml` (global) only when the observer must run in several areas.
- To change another module's observer logic, disable it rather than override it, and register your own observer.
- To expose an extension point in your own code, dispatch a uniquely named event through `Magento\Framework\Event\ManagerInterface`.
- Look up core event names and the arguments each one passes in the list of events reference before writing the observer.
- If module A observes events of module B, the coding standard says to declare B in A's `composer.json` `suggest` section.

## Hard constraints

### Constraint: Implement ObserverInterface in the Observer directory and declare it in events.xml

Place the class under `<module-root>/Observer`, implement `Magento\Framework\Event\ObserverInterface` and its `execute(Observer $observer)` method. Subscribe it with an `<observer>` whose `name` and `instance` are both set.

**Why this matters**

`name` and `instance` are the required attributes of the `observer` element; `instance` is the fully qualified class name the event manager runs. `disabled` defaults to false and `shared` (the object lifestyle) defaults to `true`.

**Detection**

An observer class that does not implement `ObserverInterface`; an `<observer>` without `name` or with a short class name in `instance`; an `events.xml` without the `urn:magento:framework:Event/etc/events.xsd` schema.

**Correct**

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Event/etc/events.xsd">
    <event name="vendor_module_export_after">
        <observer name="vendor_module_export_notify" instance="Vendor\Module\Observer\NotifyExport"/>
    </event>
</config>
```

**Wrong**

```xml
<config>
    <event name="vendor_module_export_after">
        <observer instance="NotifyExport"/>
    </event>
</config>
```

### Constraint: Give each observer a name that is unique within its event

Observer names must be unique per event definition. The same name may be reused under a different event.

**Why this matters**

If you declare an observer with a name already in use within the same event, the application merges the declarations into a single observer, respecting the module load order in `app/etc/config.php`. That is how another module's observer is disabled on purpose, and how an accidental name clash silently replaces someone else's observer.

**Detection**

Two `<observer>` nodes with the same `name` under the same `<event name>` across modules, where the second is not meant to disable or alter the first.

**Correct**

```xml
<!-- Disable another module's observer on purpose, then add your own -->
<event name="vendor_other_event_before">
    <observer name="otherObserverName" disabled="true"/>
    <observer name="vendor_module_replacement" instance="Vendor\Module\Observer\Replacement"/>
</event>
```

**Wrong**

```xml
<!-- Generic name that collides with another module's observer on the same event -->
<event name="vendor_other_event_before">
    <observer name="observer" instance="Vendor\Module\Observer\Something"/>
</event>
```

### Constraint: Declare observers in the area where they are needed

Use the area-specific `events.xml` that matches where the behavior is required. A global subscription should not be used when only the `frontend` is impacted.

**Why this matters**

An observer in `etc/events.xml` runs in all areas: `adminhtml`, `crontab`, `frontend`, `graphql`, `webapi_rest` and `webapi_soap`. Registering everything in `global` is not recommended because bootstrapping becomes heavier: the application must run and process additional checks for the observer.

**Detection**

A storefront-only observer (for example one reading the customer session for display) declared in `etc/events.xml`.

**Correct**

```text
Vendor/Module/etc/frontend/events.xml
```

**Wrong**

```text
Vendor/Module/etc/events.xml   (observer only matters on the storefront)
```

### Constraint: Do not modify event data or observed objects in an observer

Treat what the event passes as read-only. Use a plugin to change a function's input or output.

**Why this matters**

The technical guidelines forbid modifying values (including objects) passed to an event inside the observer: other observers could change the data, and the platform could move to always sending immutable objects. Events should not change the state of observable objects.

**Detection**

`$observer->getData('transport')->setData(...)` or `$observer->getEvent()->get...()->set...()` intended to send a value back to the dispatcher.

**Correct**

```php
public function execute(Observer $observer)
{
    $exportId = $observer->getData('export_id');
    $this->notifier->notify($exportId); // side effect in a separate class
}
```

**Wrong**

```php
public function execute(Observer $observer)
{
    $transport = $observer->getData('transport');
    $transport->setData('output_return_value', true); // expects the dispatcher to read it back
}
```

### Constraint: Keep observers thin, order-independent and free of loops

Keep only the logic needed to run the observer; put business logic in other classes it uses. Do not assume invocation order and do not dispatch an event your observer listens to, directly or down the chain.

**Why this matters**

Observers are injected dynamically into the execution flow; complex computations slow down the process, especially for events dispatched often. Observers on the same event may be invoked in any order. A chain that re-dispatches the initial event runs the observer recursively. Observers must only throw exceptions declared by the method that triggers the event, or derived ones.

**Detection**

Large `execute()` methods with queries or remote calls; comments like "runs after X observer"; an observer that saves the same entity whose save event it observes.

**Correct**

```php
class NotifyExport implements ObserverInterface
{
    public function __construct(private ExportNotifier $notifier) {}

    public function execute(Observer $observer)
    {
        $this->notifier->notify((int) $observer->getData('export_id'));
    }
}
```

**Wrong**

```php
public function execute(Observer $observer)
{
    $product = $observer->getData('product');
    $product->setData('flag', 1);
    $this->productRepository->save($product); // dispatches the save event again
}
```

### Constraint: Dispatch custom events from methods, never from constructors

Inject `Magento\Framework\Event\ManagerInterface` and call `dispatch('<unique_event_name>', [<key> => <value>])` inside a method.

**Why this matters**

The event manager is obtained through dependency injection, and the unique name you pass is what other modules reference in their `events.xml`. The technical guidelines state that events must not be triggered in constructors, where constructors may only assign dependencies and validate arguments.

**Detection**

`$eventManager->dispatch(...)` inside `__construct`; an event name shared with a core or third-party event for a different purpose.

**Correct**

```php
public function export(int $exportId): void
{
    // ... export work
    $this->eventManager->dispatch('vendor_module_export_after', ['export_id' => $exportId]);
}
```

**Wrong**

```php
public function __construct(ManagerInterface $eventManager)
{
    $eventManager->dispatch('vendor_module_config_read_after');
}
```

## Preferred pattern

```text
Vendor/Module/
├── Model/Exporter.php               (dispatches vendor_module_export_after)
├── Model/ExportNotifier.php         (business logic)
├── Observer/NotifyExport.php        (thin observer)
└── etc/adminhtml/events.xml         (only the Admin triggers exports)
```

```php
<?php
namespace Vendor\Module\Model;

use Magento\Framework\Event\ManagerInterface as EventManager;

class Exporter
{
    public function __construct(private EventManager $eventManager) {}

    public function export(int $exportId): void
    {
        $this->eventManager->dispatch('vendor_module_export_before', ['export_id' => $exportId]);
        // ... export work
        $this->eventManager->dispatch('vendor_module_export_after', ['export_id' => $exportId]);
    }
}
```

```php
<?php
namespace Vendor\Module\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Vendor\Module\Model\ExportNotifier;

class NotifyExport implements ObserverInterface
{
    public function __construct(private ExportNotifier $notifier) {}

    public function execute(Observer $observer)
    {
        $this->notifier->notify((int) $observer->getData('export_id'));
    }
}
```

Observers read the dispatched array with `$observer->getData('<key>')`.

## Common failure modes

- Using an observer to change a value the dispatcher reads back, where a plugin was the documented tool.
- Declaring every observer in global `etc/events.xml`.
- A generic observer `name` that merges with another module's observer on the same event.
- Overriding an observer class instead of disabling the observer and adding a new one.
- Heavy work inside `execute()` on a frequently dispatched event.
- Relying on another observer having run first.
- Saving the observed entity inside its own save observer, creating a loop.
- Dispatching an event inside a constructor.
- Throwing exception types the triggering method does not declare.

## Review checklist

- [ ] Class in `Observer/`, implements `ObserverInterface`, logic delegated to other classes
- [ ] `<observer>` has `name` and fully qualified `instance`; schema is `urn:magento:framework:Event/etc/events.xsd`
- [ ] Observer name unique within the event, unless deliberately disabling another
- [ ] `events.xml` in the narrowest area
- [ ] Event data and observed objects are not modified
- [ ] No order assumptions, no re-dispatch of the observed event
- [ ] Custom events dispatched from methods through injected `ManagerInterface`, with unique names
- [ ] Only exceptions declared by the triggering method are thrown
- [ ] The observed module is in `composer.json` `suggest`

## Related skills

- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): plugins, for modifying inputs and results
- [`adobe-commerce-module-contract`](../adobe-commerce-module-contract/SKILL.md): area folders, `suggest` and load order
- [`adobe-commerce-cron-and-queues`](../adobe-commerce-cron-and-queues/SKILL.md): moving heavy work out of the request

## Reference

- [Events and observers](https://developer.adobe.com/commerce/php/development/components/events-and-observers/) (source: `commerce-php/src/pages/development/components/events-and-observers/index.md`)
- [List of events](https://developer.adobe.com/commerce/php/development/components/events-and-observers/event-list) (source: `commerce-php/src/pages/development/components/events-and-observers/event-list.md`)
- [Observers best practices](https://developer.adobe.com/commerce/php/best-practices/extensions/observers) (source: `commerce-php/src/pages/best-practices/extensions/observers.md`)
- [Security, performance, and data handling](https://developer.adobe.com/commerce/php/best-practices/extensions/security) (source: `commerce-php/src/pages/best-practices/extensions/security.md`)
- [Working with the architecture](https://developer.adobe.com/commerce/php/best-practices/extensions/architecture) (source: `commerce-php/src/pages/best-practices/extensions/architecture.md`)
- [Plugins](https://developer.adobe.com/commerce/php/development/components/plugins) (source: `commerce-php/src/pages/development/components/plugins.md`)
- [Dependency injection configuration](https://developer.adobe.com/commerce/php/development/build/dependency-injection-file) (source: `commerce-php/src/pages/development/build/dependency-injection-file.md`)
- [Technical guidelines](https://developer.adobe.com/commerce/php/coding-standards/technical-guidelines) (source: `commerce-php/src/pages/coding-standards/technical-guidelines.md`)
