---
name: adobe-commerce-db-schema
description: "Apply when creating or changing a module's database structure or setup data in Adobe Commerce: etc/db_schema.xml, etc/db_schema_whitelist.json, data patches and schema patches under Setup/Patch. Covers table, column, constraint and index declarations, dropping and renaming through the whitelist and onCreate, patch dependencies, revertable patches, converting old install and upgrade scripts, and dry run and safe mode. Use for adding tables or columns, adding EAV attributes through a data patch, or reviewing setup code before a release."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Declarative schema and setup patches

## When this skill applies

Use this skill when a module of Adobe Commerce (Magento) needs its own tables, extra columns on existing tables, or data that is written once at install or upgrade time.

- Writing or editing `etc/db_schema.xml` and `etc/db_schema_whitelist.json`
- Dropping or renaming a table, column, index or foreign key
- Writing a data patch (`Setup/Patch/Data`) or a schema patch (`Setup/Patch/Schema`)
- Creating a customer or product EAV attribute, which is done through a data patch
- Converting `InstallSchema`, `UpgradeSchema`, `InstallData` or `UpgradeData` scripts
- Checking the generated DDL before running `setup:upgrade` on a real database

Do not use this skill for:

- `registration.php`, `module.xml` and `sequence` (use `adobe-commerce-module-contract`)
- Repositories, data interfaces and `extension_attributes.xml` exposed through APIs (use `adobe-commerce-webapi`)
- Encrypting stored values and re-encryptors (use `adobe-commerce-security`)
- When `setup:upgrade` runs in a deployment pipeline (use `adobe-commerce-deploy-and-modes`)
- App Builder or out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Structure (tables, columns, constraints, indexes) goes in `db_schema.xml`, which declares the final state; the application computes the difference and applies it. Data goes in a data patch.
- Use a schema patch only for what the XML cannot declare: triggers, stored procedures, functions, data migration inside DDL operations, renaming entities, partitions and table options.
- The declarative schema runs before data and schema patches. A data patch can rely on the tables in `db_schema.xml` already existing.
- A patch runs once. Applied patches are recorded in the `patch_list` table, and an unapplied one runs on the next `bin/magento setup:upgrade`.
- Order patches with `getDependencies()`, never with a module version. Patches do not need a `setup_module` version.
- Make a patch revertable (`PatchRevertableInterface`) only when its changes are database operations that can be undone. Anything that goes through the application layer (collections, serializers) or deletes rows is a non-revertable migration.
- Before adding a column to a core or third-party table, prefer extension attributes or an existing `additional_data` JSON column. If you must change the table, add new columns only, never change the type of an existing column, avoid EAV attribute tables, and check the table size first, because altering a large table delays the deployment.
- Use the `innodb` engine and give every table a primary key. Index foreign keys and the columns used in `WHERE` clauses, but not every column: indexes are rebuilt on every insert and update.
- Use the matching data type (`date` or `datetime` for dates), not integers or serialized strings.
- Once a module uses declarative schema or data patches, it cannot go back to upgrade scripts.

## Hard constraints

### Constraint: Regenerate the whitelist in every release that changes db_schema.xml

`db_schema_whitelist.json` is the history of every table, column and key the module declared. Drops only happen for entities listed in it.

**Why this matters**

Declarative schema does not delete what a `db_schema.xml` file no longer declares unless the whitelist lists it, because the entity may be declared elsewhere (for example in an old `UpgradeSchema.php`). Without the regenerated file, a removed column stays in the database and a renamed table is not handled.

**Detection**

A diff touches `etc/db_schema.xml` but not `etc/db_schema_whitelist.json`, or the whitelist was edited by hand to remove a dropped table. A code review can run the generator and check that the file does not change.

**Correct**

```bash
bin/magento setup:db-declaration:generate-whitelist --module-name=Vendor_Module
```

**Wrong**

```json
{
	"vendor_module_entity": { "column": { "entity_id": true } }
}
```

(the table `vendor_module_old` was removed from both files, so it is never dropped)

### Constraint: Generate the whitelist on a database without a table prefix

Whitelists cannot be generated on an instance that uses a database prefix.

**Why this matters**

The prefix changes the system-generated names of keys, and those names cannot be used in a whitelist that will run on other installations.

**Detection**

`app/etc/env.php` of the environment used for generation has a non-empty `table_prefix`, or the key names in the whitelist start with a project prefix.

**Correct**

Generate on a development environment with no prefix, and copy the generated `referenceId` values into `db_schema.xml`.

**Wrong**

Running `setup:db-declaration:generate-whitelist` on a client copy whose tables are all named `prefix_*`.

### Constraint: Rename through onCreate, never by editing the name in place

A renamed table is a new table that migrates data from the old one; a renamed column is a new column that migrates data from the old column. `RENAME TABLE` is not supported.

**Why this matters**

Changing only the `name` attribute declares a new empty entity and drops the old one (it is in the whitelist), so the data is lost. Migrating data from another table and renaming columns in the same change is not supported.

**Detection**

A `table` or `column` whose `name` changed without an `onCreate` attribute, or a table rename and a column rename in the same release.

**Correct**

```xml
<!-- change 1: rename the table -->
<table name="vendor_module_ticket" onCreate="migrateDataFromAnotherTable(vendor_module_issue)" resource="default" engine="innodb" comment="Tickets">
    <column xsi:type="int" name="ticket_id" unsigned="true" nullable="false" identity="true" comment="Ticket ID"/>
    <column xsi:type="varchar" name="subject" nullable="false" length="255" comment="Subject"/>
</table>

<!-- change 2, separately: rename a column (delete "subject", declare "title") -->
<column xsi:type="varchar" name="title" nullable="false" length="255" onCreate="migrateDataFrom(subject)" comment="Title"/>
```

(regenerate the whitelist after each change, so it holds the old and the new name)

**Wrong**

```xml
<table name="vendor_module_ticket" resource="default" engine="innodb" comment="Tickets">
```

(was `vendor_module_issue`; the old table and its rows are dropped)

### Constraint: Change another module's entity with disabled="true", not by deleting it

To drop a column or constraint declared in another module, redeclare it in your `db_schema.xml` with `disabled="true"`.

**Why this matters**

You cannot edit another module's file, and deleting a node only works in the module that declared it.

**Detection**

A patch or plugin that runs `dropColumn` on a core table, or an edit inside `vendor/`.

**Correct**

```xml
<table name="declarative_table">
    <constraint xsi:type="primary" referenceId="PRIMARY" disabled="true"/>
    <constraint xsi:type="primary" referenceId="NEW_PRIMARY">
        <column name="new_id_column"/>
    </constraint>
</table>
```

**Wrong**

```php
$this->moduleDataSetup->getConnection()->dropColumn('declarative_table', 'id_column');
```

### Constraint: Declare foreign keys only between declarative tables

A `foreign` constraint can only be added when both tables were created with `db_schema.xml`, and it has no `ON UPDATE` action.

**Why this matters**

The schema does not support `ON UPDATE`, to keep entity identifiers immutable. `onDelete` accepts only `CASCADE`, `SET NULL` or `NO ACTION`.

**Detection**

A `constraint xsi:type="foreign"` with an `onUpdate` attribute or another `onDelete` value, or a `referenceTable` created by an old install script.

**Correct**

```xml
<constraint xsi:type="foreign" referenceId="VENDOR_MODULE_TICKET_CUSTOMER_ID_CUSTOMER_ENTITY_ENTITY_ID"
            table="vendor_module_ticket" column="customer_id"
            referenceTable="customer_entity" referenceColumn="entity_id" onDelete="CASCADE"/>
```

**Wrong**

```xml
<constraint xsi:type="foreign" referenceId="FK_TICKET_CUSTOMER" table="vendor_module_ticket"
            column="customer_id" referenceTable="customer_entity" referenceColumn="entity_id"
            onDelete="RESTRICT" onUpdate="CASCADE"/>
```

### Constraint: Do not disable a declarative module and run setup:upgrade without a backup

A disabled module's `db_schema.xml` is no longer read, but its whitelist still is, so `setup:upgrade` drops its tables.

**Why this matters**

The data of the disabled module is deleted on the next upgrade.

**Detection**

`module:disable` followed by `setup:upgrade` in a runbook, without `--safe-mode=1`.

**Correct**

```bash
bin/magento module:disable Vendor_Module
bin/magento setup:upgrade --safe-mode=1
# later, after enabling the module again
bin/magento setup:upgrade --data-restore=1
```

**Wrong**

```bash
bin/magento module:disable Vendor_Module && bin/magento setup:upgrade
```

## Preferred pattern

```text
app/code/Vendor/Module/
├── etc/db_schema.xml
├── etc/db_schema_whitelist.json        (generated)
└── Setup/Patch/Data/AddDefaultTicketStatuses.php
```

`etc/db_schema.xml`:

```xml
<?xml version="1.0"?>
<schema xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Setup/Declaration/Schema/etc/schema.xsd">
    <table name="vendor_module_ticket" resource="default" engine="innodb" comment="Tickets">
        <column xsi:type="int" name="ticket_id" unsigned="true" nullable="false" identity="true" comment="Ticket ID"/>
        <column xsi:type="int" name="customer_id" unsigned="true" nullable="false" comment="Customer ID"/>
        <column xsi:type="varchar" name="title" nullable="false" length="255" comment="Title"/>
        <column xsi:type="timestamp" name="created_at" comment="Created at"/>
        <constraint xsi:type="primary" referenceId="PRIMARY">
            <column name="ticket_id"/>
        </constraint>
        <constraint xsi:type="foreign" referenceId="VENDOR_MODULE_TICKET_CUSTOMER_ID_CUSTOMER_ENTITY_ENTITY_ID"
                    table="vendor_module_ticket" column="customer_id"
                    referenceTable="customer_entity" referenceColumn="entity_id" onDelete="CASCADE"/>
        <index referenceId="VENDOR_MODULE_TICKET_CUSTOMER_ID" indexType="btree">
            <column name="customer_id"/>
        </index>
    </table>
</schema>
```

`Setup/Patch/Data/AddDefaultTicketStatuses.php` (stub from `bin/magento setup:db-declaration:generate-patch Vendor_Module AddDefaultTicketStatuses`):

```php
<?php
declare(strict_types=1);

namespace Vendor\Module\Setup\Patch\Data;

use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;

class AddDefaultTicketStatuses implements DataPatchInterface
{
    public function __construct(private ModuleDataSetupInterface $moduleDataSetup)
    {
    }

    public function apply()
    {
        $this->moduleDataSetup->getConnection()->startSetup();
        // insert the rows this module needs
        $this->moduleDataSetup->getConnection()->endSetup();
    }

    public static function getDependencies()
    {
        return [];
    }

    public function getAliases()
    {
        return [];
    }
}
```

Then check before applying:

```bash
bin/magento setup:db-declaration:generate-whitelist --module-name=Vendor_Module
bin/magento setup:upgrade --dry-run=1   # DDL written to var/log/dry-run-installation.log
```

A module released with upgrade scripts converts its schema with `setup:upgrade --convert-old-scripts=1` (never in production mode; it ignores raw SQL and custom DDL), and its data scripts by hand into patches that implement `PatchVersionInterface`, where `getVersion()` returns the version the old `version_compare` used, so installations that already ran the script skip the patch.

## Common failure modes

- Removing a table from the whitelist when dropping it: the table stays in the database.
- Dropping a column that is not in the whitelist: nothing happens.
- Reducing a column length, changing precision or changing the type without `--safe-mode=1` on data that matters: these are destructive operations, and only safe mode writes CSV dumps to `var/declarative_dumps_csv/`.
- Making a data patch "revertable" when it deletes rows or uses collections: the revert cannot restore it, and a delete on a referenced column can fire `ON DELETE`.
- Expecting to revert one patch: only `bin/magento module:uninstall Vendor_Module` (or `--non-composer`) reverts, and it reverts all of the module's data patches.
- Renaming a patch class without returning the old name from `getAliases()`, which is what keeps a rename from affecting installation.
- A `referenceId` that does not match the system-generated name in `db_schema_whitelist.json` (configure the XML so they match).
- Adding columns to EAV attribute tables or changing a core column type to fit one project.

## Review checklist

- [ ] Every new table has `engine="innodb"`, a `resource` and a `primary` constraint
- [ ] Foreign keys point to declarative tables, use `CASCADE`, `SET NULL` or `NO ACTION`, and have an index
- [ ] `db_schema_whitelist.json` was regenerated in this release, on a database without prefix
- [ ] Renames use `onCreate` (`migrateDataFromAnotherTable` or `migrateDataFrom`) and are not combined in one release
- [ ] Entities of other modules are changed with `disabled="true"`
- [ ] Patches live in `Setup/Patch/Data` or `Setup/Patch/Schema`, implement the right interface and declare dependencies
- [ ] `revert()` only exists where the operations are really revertable
- [ ] The DDL from `setup:upgrade --dry-run=1` was read before running on a shared database

## Related skills

- [`adobe-commerce-module-contract`](../adobe-commerce-module-contract/SKILL.md): module registration and `sequence`, which decides when your schema loads
- [`adobe-commerce-webapi`](../adobe-commerce-webapi/SKILL.md): repositories and data interfaces on top of these tables
- [`adobe-commerce-security`](../adobe-commerce-security/SKILL.md): hashing and encrypting values stored in your columns
- [`adobe-commerce-deploy-and-modes`](../adobe-commerce-deploy-and-modes/SKILL.md): where `setup:upgrade` runs

## Reference

- [Declarative schema](https://developer.adobe.com/commerce/php/development/components/declarative-schema/) (source: `commerce-php/src/pages/development/components/declarative-schema/index.md`)
- [Configure declarative schema](https://developer.adobe.com/commerce/php/development/components/declarative-schema/configuration) (source: `commerce-php/src/pages/development/components/declarative-schema/configuration.md`)
- [Develop data and schema patches](https://developer.adobe.com/commerce/php/development/components/declarative-schema/patches) (source: `commerce-php/src/pages/development/components/declarative-schema/patches.md`)
- [Migrate install and upgrade scripts to declarative schema](https://developer.adobe.com/commerce/php/development/components/declarative-schema/migration-scripts) (source: `commerce-php/src/pages/development/components/declarative-schema/migration-scripts.md`)
- [EAV and extension attributes](https://developer.adobe.com/commerce/php/development/components/attributes) (source: `commerce-php/src/pages/development/components/attributes.md`)
- [Extension lifecycle](https://developer.adobe.com/commerce/php/development/prepare/extension-lifecycle) (source: `commerce-php/src/pages/development/prepare/extension-lifecycle.md`)
- [Security, performance, and data handling](https://developer.adobe.com/commerce/php/best-practices/extensions/security) (source: `commerce-php/src/pages/best-practices/extensions/security.md`)
- [Best practices for modifying database tables](https://experienceleague.adobe.com/en/docs/commerce-operations/implementation-playbook/best-practices/development/modifying-core-and-third-party-tables) (source: `commerce-operations.en/help/implementation-playbook/best-practices/development/modifying-core-and-third-party-tables.md`)
- [Code review best practices](https://experienceleague.adobe.com/en/docs/commerce-operations/implementation-playbook/best-practices/development/code-review) (source: `commerce-operations.en/help/implementation-playbook/best-practices/development/code-review.md`)
