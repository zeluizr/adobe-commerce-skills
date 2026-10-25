---
name: adobe-commerce-webapi
description: "Apply when exposing or changing a REST, SOAP or GraphQL API in an Adobe Commerce module: etc/webapi.xml routes, service contracts in Api and Api/Data, ACL resources and the anonymous and self permissions, forced parameters, input limits, etc/schema.graphqls, resolvers, GraphQL exceptions and the resolver side of cacheable queries. Use for adding a custom endpoint, extending an existing GraphQL type, writing a batch resolver, or reviewing which caller can reach a service method."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Web APIs: REST, SOAP and GraphQL

## When this skill applies

Use this skill when a module of Adobe Commerce (Magento) exposes data or operations to API clients: integrations, headless storefronts or JavaScript widgets.

- Declaring a route in `etc/webapi.xml` that maps an HTTP method and URL to a service interface method
- Writing the service contract (`Api/*Interface.php`, `Api/Data/*Interface.php`) that the web API framework reflects
- Choosing the `resource` of a route: an ACL id, `self` or `anonymous`
- Adding a query, mutation or field in `etc/schema.graphqls` and its resolver class
- Throwing GraphQL errors the client is allowed to see
- Making a custom GraphQL query cacheable with an identity class

Do not use this skill for:

- Defining the ACL tree in `acl.xml` and protecting Admin controllers (use `adobe-commerce-security`)
- Full page cache, Varnish and cache tag invalidation behind GraphQL GET requests (use `adobe-commerce-performance-and-cache`)
- Asynchronous and bulk endpoints processed by consumers (use `adobe-commerce-cron-and-queues`)
- `preference` and `virtualType` mechanics in `di.xml` (use `adobe-commerce-di-and-plugins`)
- App Builder, API Mesh or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Expose a service interface, not a model. The framework uses reflection on the interface to build the request object from JSON or SOAP and to serialize the return value.
- Put data interfaces in `Api/Data` and service interfaces (repository, management, metadata) in `Api`. Bind them to implementations with `preference` in `etc/di.xml`.
- A repository interface provides `save`, `get` (by id), `getList` (search criteria, returns a search results interface), `delete` and `deleteById`. Define one search results interface per entity, so `getItems()` returns that exact type.
- Choose the route resource by caller: guests reach only `anonymous`; customers reach `anonymous` and `self`; administrators and integrations reach the ACL resources their role grants. `anonymous` and `self` are not defined in `acl.xml`.
- For a `self` route that acts on the caller's own record, force the id with `<parameter name="..." force="true">%customer_id%</parameter>` instead of trusting the payload.
- When two groups of callers should see different fields, make two operations with two DTOs and two routes, each with its own resource. A field present in `schema.graphqls` or in a returned data interface is visible to everyone who can call it.
- GraphQL: prefer `BatchResolverInterface` or `BatchServiceContractResolverInterface` for queries that load related data per item; use `ResolverInterface` for one branch at a time, returning a `Value` (from `ValueFactory`) when the fetch can be deferred and grouped.
- A GraphQL query is cached only when it declares `@cache(cacheIdentity: ...)`. Use `@cache(cacheable: false)` only to switch off caching of a query declared with an identity in another module.
- Only GraphQL queries sent with HTTP GET can be cached; POST and mutations are not. If one query in a request is uncached, the whole request bypasses the cache.
- Use custom route aliases (`etc/webapi_async.xml`, `alias` attribute) only for URLs without variables; `PUT V1/widgets/:widgetId` cannot have an alias.
- Integration access tokens no longer work as standalone bearer tokens by default (they never expire). Sign integration requests with OAuth instead of turning `oauth/consumer/enable_integration_as_bearer` on.

## Hard constraints

### Constraint: Give every route a resource that matches who may call it

Each `route` needs `resources/resource ref`. Use `anonymous` only for operations a guest must perform; protect everything else with `self` or an ACL id from your `acl.xml`.

**Why this matters**

The framework treats any caller it cannot authenticate as a guest, and guests reach every `anonymous` resource. A read endpoint left `anonymous` can leak prices, quantities or unpublished content, which is why core catalog, CMS and store reads are blocked for anonymous callers by default.

**Detection**

`<resource ref="anonymous"/>` on a route that reads or writes merchant data, or a `self` route whose service method takes the entity id from the payload.

**Correct**

```xml
<route url="/V1/vendor-tickets/:ticketId" method="GET">
    <service class="Vendor\Module\Api\TicketRepositoryInterface" method="get"/>
    <resources>
        <resource ref="Vendor_Module::ticket_view"/>
    </resources>
</route>
<route url="/V1/vendor-tickets/mine" method="GET">
    <service class="Vendor\Module\Api\TicketManagementInterface" method="getForCustomer"/>
    <resources>
        <resource ref="self"/>
    </resources>
    <data>
        <parameter name="customerId" force="true">%customer_id%</parameter>
    </data>
</route>
```

**Wrong**

```xml
<route url="/V1/vendor-tickets/:ticketId" method="GET">
    <service class="Vendor\Module\Api\TicketRepositoryInterface" method="get"/>
    <resources>
        <resource ref="anonymous"/>
    </resources>
</route>
```

### Constraint: Write complete, fully qualified docblocks on every exposed method

Every method exposed through `webapi.xml`, and every method of the objects it takes or returns, needs `@param type $name` and `@return type`. Object types use the fully qualified name, and arrays add `[]`.

**Why this matters**

The framework converts JSON or SOAP to PHP objects using these annotations. A short class name throws an exception even if a `use` statement imports it. Valid scalars are `mixed` (`anyType`), `bool` (`boolean`), `str` (`string`), `integer` (`int`), `float` and `double`.

**Detection**

`@param TicketInterface $ticket` without the namespace, missing `@return`, or an argument named `item` (SOAP strips `item` nodes when unwrapping arrays).

**Correct**

```php
/**
 * @param \Vendor\Module\Api\Data\TicketInterface $ticket
 * @return \Vendor\Module\Api\Data\TicketInterface
 */
public function save(\Vendor\Module\Api\Data\TicketInterface $ticket);
```

**Wrong**

```php
/**
 * @param TicketInterface $item
 */
public function save(TicketInterface $item);
```

### Constraint: Accept only scalars and Api\Data interfaces in REST payload objects

The REST framework validates constructor parameters of the classes it builds from the payload. Only simple types and `*\Api\Data\*Interface` classes are instantiated; models, services and other complex types are not.

**Why this matters**

All supported versions were patched for this (security bulletin APSB25-88). An API whose data class needs a model or service in its constructor stops accepting those fields: 2.4.7 and later answer `"{fieldName}" is not supported`, 2.4.6 and earlier answer `Property ... does not have accessor method ...`.

**Detection**

A class bound to an `Api/Data` interface whose constructor takes a `Model` class, a repository, or another non-data type that the payload is expected to fill.

**Correct**

```php
class TicketData extends \Magento\Framework\DataObject implements \Vendor\Module\Api\Data\TicketInterface
{
}
```

**Wrong**

```php
class TicketData implements \Vendor\Module\Api\Data\TicketInterface
{
    public function __construct(private \Vendor\Module\Model\Ticket $ticket) {}
}
```

### Constraint: Let clients see only exceptions meant for them

In GraphQL, throw the `Magento\Framework\GraphQl\Exception` classes (or your own `\GraphQL\Error\ClientAware` exception) for anticipated errors. Everything else is logged to `exception.log` and returned as an internal server error.

**Why this matters**

Without a client-aware exception the client gets no useful message; with too many client-aware exceptions you risk exposing sensitive data.

**Detection**

A resolver that throws `\Exception` or `LocalizedException` for invalid input, or a custom exception that implements `ClientAware` and wraps database or remote errors.

**Correct**

```php
if (empty($args['ticket_id'])) {
    throw new \Magento\Framework\GraphQl\Exception\GraphQlInputException(__('"ticket_id" is required.'));
}
if (false === $context->getExtensionAttributes()->getIsCustomer()) {
    throw new \Magento\Framework\GraphQl\Exception\GraphQlAuthorizationException(
        __('The current customer isn\'t authorized.')
    );
}
```

**Wrong**

```php
throw new \Exception('SQLSTATE[23000]: ' . $e->getMessage());
```

Available classes: `GraphQlAlreadyExistsException`, `GraphQlAuthenticationException`, `GraphQlAuthorizationException`, `GraphQlInputException`, `GraphQlNoSuchEntityException`.

### Constraint: Pair every cacheable GraphQL query with an identity class

A query with `@cache(cacheIdentity: ...)` needs a class implementing `Magento\Framework\GraphQl\Query\Resolver\IdentityInterface`, in the module's `Model/Resolver` directory, that returns one cache tag per entity.

**Why this matters**

The tags are what lets cached results be invalidated when an entity changes, and a query without a `cacheIdentity` is not cached at all. Output types that can be changed or cached on the client must have an `id` field, preferably of type `ID`.

**Detection**

`@cache(cacheIdentity:` pointing to a missing class, a `getIdentities()` that ignores the resolved items, or `@cache(cacheable: true)` on a query with no identity (it has no effect).

**Correct**

```php
public function getIdentities(array $resolvedData): array
{
    $ids = [];
    foreach ($resolvedData['items'] ?? [] as $item) {
        $ids[] = sprintf('%s_%s', \Vendor\Module\Model\Ticket::CACHE_TAG, $item['entity_id']);
    }
    if (!empty($ids)) {
        $ids[] = \Vendor\Module\Model\Ticket::CACHE_TAG;
    }
    return $ids;
}
```

**Wrong**

```graphql
vendorTickets: VendorTickets @resolver(class: "Vendor\\Module\\Model\\Resolver\\Tickets") @cache(cacheable: true)
```

## Preferred pattern

```text
app/code/Vendor/Module/
├── Api/TicketRepositoryInterface.php
├── Api/Data/TicketInterface.php
├── Api/Data/TicketSearchResultsInterface.php
├── etc/acl.xml
├── etc/di.xml                 (preference Api -> Model)
├── etc/webapi.xml
├── etc/schema.graphqls
└── Model/Resolver/{Tickets.php,TicketsIdentity.php}
```

`etc/schema.graphqls` (merged with every other module's schema by name, like XML merging):

```graphql
type Query {
	vendorTickets(pageSize: Int = 20, currentPage: Int = 1): VendorTickets
		@resolver(class: "Vendor\\Module\\Model\\Resolver\\Tickets")
		@cache(cacheIdentity: "Vendor\\Module\\Model\\Resolver\\TicketsIdentity")
		@doc(description: "Public tickets of the store")
}

type VendorTickets {
	items: [VendorTicket]
	total_count: Int
}

type VendorTicket {
	id: ID
	title: String @doc(description: "Ticket title")
}

interface ProductInterface {
	vendor_ticket_count: Int @resolver(class: "Vendor\\Module\\Model\\Resolver\\ProductTicketCount")
}
```

Resolver:

```php
<?php
declare(strict_types=1);

namespace Vendor\Module\Model\Resolver;

use Magento\Framework\GraphQl\Config\Element\Field;
use Magento\Framework\GraphQl\Query\ResolverInterface;
use Magento\Framework\GraphQl\Schema\Type\ResolveInfo;

class Tickets implements ResolverInterface
{
    public function __construct(private \Vendor\Module\Api\TicketRepositoryInterface $repository)
    {
    }

    public function resolve(Field $field, $context, ResolveInfo $info, array $value = null, array $args = null)
    {
        // build search criteria from $args, call $this->repository->getList(), map to arrays
    }
}
```

Limit what a single request may cost: input limits are off by default (`webapi/validation/input_limit_enabled`, `graphql/validation/input_limit_enabled`); per route, `<data input-array-size-limit="5"/>` in `webapi.xml` (then `bin/magento cache:clean config`); for GraphQL, override `queryComplexity` (default 300) and `queryDepth` (default 20) through `di.xml`.

## Common failure modes

- Returning a model that extends `AbstractModel` from a service method: every column becomes readable, and writable through the same DTO (see mass assignment in `adobe-commerce-security`).
- Protecting a login or code-entry form with reCAPTCHA in the controller but not in the REST endpoint or GraphQL mutation that does the same.
- Using underscores between alphanumeric characters in data keys (`default_shipping_1`): the camel to snake case conversion produces `default_shipping1`.
- Expecting `@deprecated` on input values or arguments: GraphQL only allows it on fields and enum values.
- Loading related data per item inside a `ResolverInterface` loop instead of batching.
- A batch service contract that takes more than one argument or returns results in another order than the criteria list.
- Placing GraphQL-only plugins or `extendedConfigData` in the global `etc/di.xml` instead of `etc/graphql/di.xml`.
- Forgetting that an integration calling one of the core reads blocked for anonymous callers gets an authentication error. The list is changed per extension in its `di.xml` (it is defined in the WebapiSecurity module), or for the whole store with **Allow Anonymous Guest Access**.

## Review checklist

- [ ] Every route has a resource, and every `anonymous` route is justified
- [ ] `self` routes force the owner id with a `%...%` parameter
- [ ] Exposed methods and their data objects have fully qualified `@param` and `@return`
- [ ] Payload classes need only scalars or `Api\Data` interfaces in their constructors
- [ ] Sensitive fields have their own operation or resolver, behind their own resource
- [ ] Resolvers throw `GraphQl*Exception` for expected errors and nothing client-aware wraps internals
- [ ] Cacheable queries have an identity class; mutations and per-customer data are not cached
- [ ] Input limits, page size and query complexity were considered for the new endpoint

## Related skills

- [`adobe-commerce-security`](../adobe-commerce-security/SKILL.md): `acl.xml`, ownership checks, mass assignment and sensitive data
- [`adobe-commerce-performance-and-cache`](../adobe-commerce-performance-and-cache/SKILL.md): how GraphQL GET responses and cache tags are stored and purged
- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): `preference` for service contracts and area-specific `di.xml`
- [`adobe-commerce-db-schema`](../adobe-commerce-db-schema/SKILL.md): the tables behind the repositories
- [`adobe-commerce-cron-and-queues`](../adobe-commerce-cron-and-queues/SKILL.md): asynchronous and bulk REST

## Reference

- [Configure services as web APIs](https://developer.adobe.com/commerce/php/development/components/web-api/services) (source: `commerce-php/src/pages/development/components/web-api/services.md`)
- [Resource accessibility](https://developer.adobe.com/commerce/php/development/components/web-api/resource-accessibility) (source: `commerce-php/src/pages/development/components/web-api/resource-accessibility.md`)
- [Set custom routes](https://developer.adobe.com/commerce/php/development/components/web-api/custom-routes) (source: `commerce-php/src/pages/development/components/web-api/custom-routes.md`)
- [Service contracts](https://developer.adobe.com/commerce/php/development/components/service-contracts/) (source: `commerce-php/src/pages/development/components/service-contracts/index.md`)
- [Service contract design patterns](https://developer.adobe.com/commerce/php/development/components/service-contracts/design-patterns) (source: `commerce-php/src/pages/development/components/service-contracts/design-patterns.md`)
- [Create a custom REST API](https://developer.adobe.com/commerce/php/tutorials/backend/create-custom-rest-api) (source: `commerce-php/src/pages/tutorials/backend/create-custom-rest-api.md`)
- [Authorization](https://developer.adobe.com/commerce/php/development/security/authorization) (source: `commerce-php/src/pages/development/security/authorization.md`)
- [Sensitive information](https://developer.adobe.com/commerce/php/development/security/sensitive-information) (source: `commerce-php/src/pages/development/security/sensitive-information.md`)
- [Mass assignment](https://developer.adobe.com/commerce/php/development/security/mass-assignment) (source: `commerce-php/src/pages/development/security/mass-assignment.md`)
- [Brute force attacks](https://developer.adobe.com/commerce/php/development/security/brute-force) (source: `commerce-php/src/pages/development/security/brute-force.md`)
- [Security, performance, and data handling](https://developer.adobe.com/commerce/php/best-practices/extensions/security) (source: `commerce-php/src/pages/best-practices/extensions/security.md`)
- [Input limiting](https://developer.adobe.com/commerce/webapi/get-started/api-security) (source: `commerce-webapi/src/pages/get-started/api-security.md`)
- [Token-based authentication](https://developer.adobe.com/commerce/webapi/get-started/authentication/gs-authentication-token) (source: `commerce-webapi/src/pages/get-started/authentication/gs-authentication-token.md`)
- [Restricting access to anonymous web APIs](https://developer.adobe.com/commerce/webapi/rest/use-rest/anonymous-api-security) (source: `commerce-webapi/src/pages/rest/use-rest/anonymous-api-security.md`)
- [Define the GraphQL schema for a module](https://developer.adobe.com/commerce/webapi/graphql/develop/) (source: `commerce-webapi/src/pages/graphql/develop/index.md`)
- [GraphQL resolvers](https://developer.adobe.com/commerce/webapi/graphql/develop/resolvers) (source: `commerce-webapi/src/pages/graphql/develop/resolvers.md`)
- [Extend an existing GraphQL schema](https://developer.adobe.com/commerce/webapi/graphql/develop/extend-existing-schema) (source: `commerce-webapi/src/pages/graphql/develop/extend-existing-schema.md`)
- [GraphQL exception handling](https://developer.adobe.com/commerce/webapi/graphql/develop/exceptions) (source: `commerce-webapi/src/pages/graphql/develop/exceptions.md`)
- [Identity class](https://developer.adobe.com/commerce/webapi/graphql/develop/identity-class) (source: `commerce-webapi/src/pages/graphql/develop/identity-class.md`)
- [GraphQL caching](https://developer.adobe.com/commerce/webapi/graphql/usage/caching) (source: `commerce-webapi/src/pages/graphql/usage/caching.md`)
- [GraphQL security configuration](https://developer.adobe.com/commerce/webapi/graphql/usage/security-configuration) (source: `commerce-webapi/src/pages/graphql/usage/security-configuration.md`)
