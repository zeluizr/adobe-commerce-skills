---
name: adobe-commerce-security
description: "Apply when writing or reviewing Adobe Commerce module code that handles requests, renders output, stores secrets or touches files: Admin ACL (acl.xml, ADMIN_RESOURCE, aclResource), ownership checks, CSRF and the Http<Method>ActionInterface markers, context-specific escaping with the Escaper, mass assignment, sensitive and environment-specific settings, hashing and encryption, file uploads, SSRF, content security policies and non-secure PHP functions. Use for new controllers, forms, templates, upload features, outbound HTTP calls, or a security review before release."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Security in module code

## When this skill applies

Use this skill when code in an Adobe Commerce (Magento) module decides who may do something, prints data, keeps a secret, accepts a file or calls a URL.

- Creating an Admin page, menu entry or layout block that only some Admin roles may see
- Writing a storefront controller that changes state, or one that receives a webhook
- Escaping values in `.phtml` templates, Knockout templates and UI component data
- Saving request data into an entity (mass assignment)
- Marking configuration paths as sensitive or environment-specific, hashing or encrypting stored values
- Handling uploaded files, or fetching a URL that a user or Admin user provided
- Allowing third-party scripts and inline scripts under the content security policy

Do not use this skill for:

- `webapi.xml` resources, `self` and `anonymous`, and GraphQL exceptions (use `adobe-commerce-webapi`)
- Layout XML, blocks and ViewModels beyond escaping (use `adobe-commerce-layout-and-templates`)
- RequireJS, Knockout components and UI component configuration (use `adobe-commerce-frontend-luma`)
- Server hardening, firewalls and Admin URL settings, which are operations work, not module code
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Storefront pages go in `Vendor\Module\Controller\...`; Admin-only pages go in `Vendor\Module\Controller\Adminhtml\...`, extend `Magento\Backend\App\Action` and set `ADMIN_RESOURCE`.
- Declare each Admin permission in `etc/acl.xml` under `Magento_Backend::admin`, with an id in the form `Vendor_Module::resource`. The same tree feeds Admin roles and integration API access, and `webapi.xml` routes reference it.
- Configuration covers user type and role; ownership (this wishlist belongs to this customer) is always checked in code, with `UserContextInterface::getUserType()` and `getUserId()`.
- Validate input as close to the view as possible and escape on output for the exact context. Do not strip characters on input that are harmless once escaped.
- Use operation-specific DTOs (plain `DataObject` implementations) for what a client may write and for what it may read, never the `AbstractModel` of the table.
- Hash what only needs comparing (passwords, tokens, secrets) with `EncryptorInterface::getHash()` and `isValidHash()`; encrypt what must be read back with `encrypt()` and `decrypt()`. Both follow key rotation.
- For a link that must work without a session (an e-mail link), use a self-signed, expiring token, such as a JWT built with `Magento\Framework\Jwt\JwtManagerInterface`, instead of a stored random secret.
- Secrets that a user types (passwords, gift card codes) need a challenge (reCAPTCHA) on every interface that accepts them: controller, REST endpoint and GraphQL mutation. Machine secrets need length: at least 16 random characters, 32 preferred.
- Endpoints that write or return many entities need a maximum number of items; heavy operations and ones that call external services are candidates for reCAPTCHA or infrastructure throttling.
- SSRF, in order of effectiveness: do not accept URLs from users; if you must, accept them only from the most trusted users, accept only the path or query (not the scheme, and not the host unless it is on a trusted list); never show the remote response in an error.
- Use the framework wrappers: `Magento\Framework\HTTP\PhpEnvironment\Request` instead of superglobals (`$_GET`, `$_POST`, `$_FILES`, `$_COOKIE`, `$_SERVER` and the rest), `Magento\Framework\HTTP\Adapter\Curl` instead of `curl_*`, the Filesystem API instead of `file_get_contents()`, and the data adapter with prepared statements instead of raw SQL.
- Avoid `eval`, `serialize`/`unserialize`, `md5` and `sha1` for anything sensitive, `srand`, `mt_srand`, `include` with a user-controlled path, and `ArrayObject` (use the framework Serialize library).

## Hard constraints

### Constraint: Protect every Admin controller with its own ACL resource

An Admin controller extends `Magento\Backend\App\Action` and overrides `ADMIN_RESOURCE` with a resource declared in your `acl.xml`. Menu items use the same resource in `menu.xml`.

**Why this matters**

Each Admin user's role grants only selected resources, and `ADMIN_RESOURCE` is what marks a page as requiring one of them. A user whose role lacks it gets "Access Denied" on that page; the `resource` on a menu item only decides whether the entry is shown.

**Detection**

A class under `Controller/Adminhtml` without `ADMIN_RESOURCE`, or with a resource id that no `acl.xml` declares, or one shared with an unrelated feature.

**Correct**

```php
class Index extends \Magento\Backend\App\Action implements \Magento\Framework\App\Action\HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Vendor_Module::ticket_view';
}
```

**Wrong**

```php
class Index extends \Magento\Backend\App\Action
{
    // no ADMIN_RESOURCE of its own: not tied to the feature's ACL resource
}
```

### Constraint: Mark state-changing controllers with the HTTP method interfaces

A controller that accepts a form implements `Magento\Framework\App\Action\HttpPostActionInterface` (or the interface of its method). CSRF validation applies to every method except GET.

**Why this matters**

The framework cannot guess which controller changes state. With a marker interface, requests with any other method are denied and the form key is checked. Forms get the key automatically from `lib/web/mage/common.js`; without it, add it from `FORM_KEY` in JavaScript or `Magento\Framework\Data\Form\FormKey` on the server.

**Detection**

A controller that saves or deletes and implements no `Http*ActionInterface`, or one that implements `HttpGetActionInterface` and still writes.

**Correct**

```php
class Save implements \Magento\Framework\App\Action\HttpPostActionInterface
{
}
```

**Wrong**

```php
class Save implements \Magento\Framework\App\ActionInterface
{
    // reached by GET <img src="..."> from another site
}
```

Only a controller that legitimately receives POST from another system (a webhook) opts out, by implementing `Magento\Framework\App\CsrfAwareActionInterface`, which also lets it customize the validation.

### Constraint: Escape every dynamic value for its output context

In templates, use `$escaper` (`\Magento\Framework\Escaper`): `escapeHtml` for tag content, `escapeHtmlAttr` for attributes (including JSON in an attribute), `escapeUrl` for URLs in `href`-like attributes, `escapeJs` for values inside JavaScript strings or names, and `escapeJs` inside `escapeHtmlAttr` for JavaScript in attributes.

**Why this matters**

Persisted, reflected and DOM XSS all come from dynamic values printed raw. The `Magento2.Security.XssTemplate` sniff fails any `echo` that is not escaped, cast, `count()`, a literal, or a method with `Html` in its name.

**Detection**

`<?= $block->getTitle() ?>`, `escapeHtml` used inside a `<script>` string, `escapeUrl` used for a JavaScript variable, or `/* @noEscape */` on user data.

**Correct**

```php
<span class="label"><?= $escaper->escapeHtml($block->getLabel()) ?></span>
<a href="<?= $escaper->escapeUrl($block->getUrl()) ?>"><?= $block->getAnchorTextHtml() ?></a>
<div data-bind='settings: <?= $escaper->escapeHtmlAttr($myJson) ?>'></div>
<script>
let phrase = "Hi, my name is <?= $escaper->escapeJs($myName) ?>";
</script>
```

**Wrong**

```php
<span class="label"><?= $block->getLabel() ?></span>
<script>let redirectUrl = "<?= $escaper->escapeUrl($myUrl) ?>";</script>
```

`escapeHtml($text, ['a'])` keeps listed tags (only `id`, `class`, `href`, `style` and `title` survive on them); `script`, `img`, `iframe`, `embed`, `video`, `audio`, `source` and `object` are never allowed. In Knockout, a property bound as HTML must end in `UnsanitizedHtml`. In UI component data providers, set `__disableTmpl` for user data so it is not rendered as a template link.

### Constraint: Check ownership where the data is loaded, not only in the controller

Blocks and UI component data providers that fetch an entity by id must verify ownership or permission themselves, and UI components that expose sensitive data need an `aclResource`.

**Why this matters**

A UI component can be rendered on its own through `mui/render`, and a block can be placed on another page with another controller. A check that lives only in the original controller is skipped, and any record can be read by id.

**Detection**

A data provider or block that calls `getById($request->getParam('id'))` with no user check, or an Admin UI component for customer data with no `aclResource`.

**Correct**

```php
if ($this->userContext->getUserType() === UserContextInterface::USER_TYPE_CUSTOMER
    && $this->userContext->getUserId() === $wishListItem->getCustomerId()) {
    return $wishListItem;
}
throw new AuthorizationException(__('Not authorized'));
```

**Wrong**

```php
return $this->wishlistRepository->get((int)$this->request->getParam('wishlist_id'));
```

### Constraint: Never copy request data straight into a model

Hydrate an operation-specific DTO that only has the writable fields, and force the owner id from the user context.

**Why this matters**

`$model->setData($request->getPostValue())` lets a client set any column: another user's `id`, an `is_admin` flag, an unconfirmed `email`. A DTO implemented by the `AbstractModel` has the same hole, because it is the active record of the table.

**Detection**

`setData($this->getRequest()->getPostValue())` followed by `save()`, or `DataObjectHelper::populateWithArray()` on a model.

**Correct**

```php
$data = $this->getRequest()->getPostValue();
$data['id'] = $this->userContext->getUserId();
$updatedData = new UpdatedUserData(); // extends DataObject, implements UpdatedUserDataInterface
$this->dataObjectHelper->populateWithArray($updatedData, $data, UpdatedUserDataInterface::class);
$this->manager->update($updatedData);
```

**Wrong**

```php
$model = $this->modelFactory->create()->load($this->getRequest()->getParam('id'));
$model->setData($this->getRequest()->getPostValue());
$model->save();
```

### Constraint: Store uploaded files under random names outside pub

Files that users must not open by URL go in a module directory under `var`, with a random name (better without extension), a database record, and deletion only after checking ownership in that record. Files served by authorization go through a controller that checks and streams them.

**Why this matters**

User-provided names and paths lead to path traversal and remote code execution. Public media must stay inside the designated folder, use an allow-list of extensions, avoid system folders and files, and be validated through the Filesystem `ReadInterface` and `WriteInterface`.

**Detection**

`move_uploaded_file` into `pub/`, a file name taken from `$_FILES['name']` for a private file, an extension deny-list, or a delete by user-provided path.

**Correct**

```php
$varDir = $this->filesystem->getDirectoryRead(\Magento\Framework\App\Filesystem\DirectoryList::VAR_DIR);
$target = $this->writeFactory->create($varDir->getAbsolutePath('vendor-module-imports'));
$name = $this->rand->getRandomString(32);
$target->getDriver()->copy($tmpPath, $target->getAbsolutePath($name));
```

**Wrong**

```php
move_uploaded_file($_FILES['file']['tmp_name'], BP . '/pub/media/' . $_FILES['file']['name']);
```

The best option is not to store the file at all: read it and delete it, or parse it in the browser and send the values to an API.

## Preferred pattern

```text
app/code/Vendor/Module/
├── etc/acl.xml
├── etc/adminhtml/menu.xml          (resource="Vendor_Module::ticket_view")
├── etc/di.xml                      (TypePool: sensitive and environment paths)
├── etc/csp_whitelist.xml
└── Controller/Adminhtml/Ticket/Index.php   (ADMIN_RESOURCE)
```

`etc/acl.xml`:

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Acl/etc/acl.xsd">
    <acl>
        <resources>
            <resource id="Magento_Backend::admin">
                <resource id="Vendor_Module::tickets" title="Tickets" translate="title" sortOrder="110">
                    <resource id="Vendor_Module::ticket_view" title="View" translate="title" sortOrder="10"/>
                    <resource id="Vendor_Module::ticket_save" title="Save" translate="title" sortOrder="20"/>
                </resource>
            </resource>
        </resources>
    </acl>
</config>
```

A layout block can be limited the same way: `<block ... aclResource="Vendor_Module::ticket_save">`.

`etc/di.xml`, so `app:config:dump` keeps the API key out of `config.php` and it is set by environment variable (`CONFIG__DEFAULT__VENDOR_MODULE__API__KEY`) or in `app/etc/env.php`, which stays out of source control:

```xml
<type name="Magento\Config\Model\Config\TypePool">
    <arguments>
        <argument name="sensitive" xsi:type="array">
            <item name="vendor_module/api/key" xsi:type="string">1</item>
        </argument>
        <argument name="environment" xsi:type="array">
            <item name="vendor_module/api/base_url" xsi:type="string">1</item>
        </argument>
    </arguments>
</type>
```

`etc/csp_whitelist.xml`, adding a host only to the policy that needs it (not `default-src`):

```xml
<csp_whitelist xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Csp:etc/csp_whitelist.xsd">
    <policies>
        <policy id="script-src">
            <values>
                <value id="vendor-widget" type="host">https://widget.example.com</value>
            </values>
        </policy>
    </policies>
</csp_whitelist>
```

Inline scripts are rendered with `$secureRenderer->renderTag('script', [...], $js, false)`, event handlers with `renderEventListenerAsTag()`, and inline styles with `renderStyleAsTag()`; `Magento\Csp\Helper\CspNonceProvider::generateNonce()` (2.4.7 and later) gives a per-request nonce. Since 2.4.7, payment pages run CSP in restrict mode and other pages in report-only mode.

## Common failure modes

- Protecting login or a gift card form with reCAPTCHA only in the controller while the REST endpoint and GraphQL mutation stay open.
- One service returning the full customer (with `dob` and `addresses`) to an endpoint whose resource is only `Magento_Customer::read_customer`.
- Storing an API key in a plain config field, or encrypted values in a custom table without a re-encryptor, so `bin/magento encryption:data:re-encrypt` skips them after key rotation.
- Inline `<script>` or `onclick` attributes that break once CSP is in restrict mode ("Refused to execute inline script").
- Content added in the Admin **Scripts and Style Sheets** field without whitelisting it.
- Showing the body of an unexpected remote response in an exception message.
- Implementing `CsrfAwareActionInterface` on a normal storefront form to make a failing submit pass, instead of sending the form key.

## Review checklist

- [ ] Every `Controller/Adminhtml` class sets an `ADMIN_RESOURCE` declared in `acl.xml`
- [ ] State-changing controllers implement `HttpPostActionInterface` (or the matching method interface)
- [ ] Ownership is checked in blocks and data providers, and sensitive UI components have `aclResource`
- [ ] Every echo in templates is escaped for its context and the XSS sniff passes
- [ ] Writes go through DTOs with only the writable fields, with the owner id forced
- [ ] Secrets are hashed or encrypted with `EncryptorInterface`, and config secrets are in `TypePool`
- [ ] Uploads use random names outside `pub`, or an extension allow-list and path checks for public media
- [ ] No user-provided scheme or host reaches an outbound request
- [ ] No `eval`, `unserialize`, `md5`, superglobals or raw `curl_*` in the diff

## Related skills

- [`adobe-commerce-webapi`](../adobe-commerce-webapi/SKILL.md): route resources, forced parameters and GraphQL authorization errors
- [`adobe-commerce-layout-and-templates`](../adobe-commerce-layout-and-templates/SKILL.md): where templates and blocks are declared
- [`adobe-commerce-frontend-luma`](../adobe-commerce-frontend-luma/SKILL.md): Knockout templates and UI components
- [`adobe-commerce-di-and-plugins`](../adobe-commerce-di-and-plugins/SKILL.md): the `TypePool` and re-encryptor arguments in `di.xml`

## Reference

- [Security](https://developer.adobe.com/commerce/php/development/security/) (source: `commerce-php/src/pages/development/security/index.md`)
- [Authorization](https://developer.adobe.com/commerce/php/development/security/authorization) (source: `commerce-php/src/pages/development/security/authorization.md`)
- [Create an access control list (ACL) rule](https://developer.adobe.com/commerce/php/tutorials/backend/create-access-control-list-rule) (source: `commerce-php/src/pages/tutorials/backend/create-access-control-list-rule.md`)
- [Cross-site request forgery](https://developer.adobe.com/commerce/php/development/security/cross-site-request-forgery) (source: `commerce-php/src/pages/development/security/cross-site-request-forgery.md`)
- [Cross-site scripting](https://developer.adobe.com/commerce/php/development/security/cross-site-scripting) (source: `commerce-php/src/pages/development/security/cross-site-scripting.md`)
- [Mass assignment](https://developer.adobe.com/commerce/php/development/security/mass-assignment) (source: `commerce-php/src/pages/development/security/mass-assignment.md`)
- [Sensitive information](https://developer.adobe.com/commerce/php/development/security/sensitive-information) (source: `commerce-php/src/pages/development/security/sensitive-information.md`)
- [Data re-encryption](https://developer.adobe.com/commerce/php/development/security/data-encryption) (source: `commerce-php/src/pages/development/security/data-encryption.md`)
- [File uploads](https://developer.adobe.com/commerce/php/development/security/file-uploads) (source: `commerce-php/src/pages/development/security/file-uploads.md`)
- [Server-side request forgery](https://developer.adobe.com/commerce/php/development/security/server-side-request-forgery) (source: `commerce-php/src/pages/development/security/server-side-request-forgery.md`)
- [Brute force attacks](https://developer.adobe.com/commerce/php/development/security/brute-force) (source: `commerce-php/src/pages/development/security/brute-force.md`)
- [Denial of service attacks](https://developer.adobe.com/commerce/php/development/security/denial-of-service-attacks) (source: `commerce-php/src/pages/development/security/denial-of-service-attacks.md`)
- [Content security policies](https://developer.adobe.com/commerce/php/development/security/content-security-policies) (source: `commerce-php/src/pages/development/security/content-security-policies.md`)
- [Non-secure functions](https://developer.adobe.com/commerce/php/development/security/non-secure-functions) (source: `commerce-php/src/pages/development/security/non-secure-functions.md`)
- [Security best practices](https://developer.adobe.com/commerce/php/best-practices/security/) (source: `commerce-php/src/pages/best-practices/security/index.md`)
- [Security, performance, and data handling](https://developer.adobe.com/commerce/php/best-practices/extensions/security) (source: `commerce-php/src/pages/best-practices/extensions/security.md`)
- [Sensitive and environment-specific settings](https://developer.adobe.com/commerce/php/development/configuration/sensitive-environment-settings) (source: `commerce-php/src/pages/development/configuration/sensitive-environment-settings.md`)
