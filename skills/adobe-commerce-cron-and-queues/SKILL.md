---
name: adobe-commerce-cron-and-queues
description: "Apply when adding scheduled or asynchronous work to an Adobe Commerce module. Covers crontab.xml jobs, cron groups and cron_groups.xml options, config_path schedules, disabling a core job, running and verifying cron, and the Message Queue Framework: communication.xml topics and handlers, queue_publisher.xml, queue_topology.xml, queue_consumer.xml, connection resolution (amqp, stomp, db), the consumers_runner cron job and env.php consumer settings. Use for background jobs, publishers and consumers."
license: MIT
compatibility: "Adobe Commerce 2.4 PHP application (Magento Open Source or Adobe Commerce, on cloud infrastructure or on-premises). Not for App Builder extensions."
metadata:
  author: commente.me
  version: "0.1.0"
---

# Cron jobs and message queues

## When this skill applies

Use this skill when a module in Adobe Commerce (Magento) needs to run work on a schedule or outside the web request.

- Declaring a cron job in `etc/crontab.xml` and choosing its cron group
- Creating a custom cron group with its own options in `etc/cron_groups.xml`
- Letting the merchant set a schedule from the Admin with `config_path`
- Disabling a cron job declared by another module
- Publishing messages to a topic and consuming them in the background
- Declaring topics, publishers, exchanges, bindings and consumers in the four queue XML files
- Running cron and consumers from the CLI and checking that they worked

Do not use this skill for:

- Custom indexers and the Mview change log (use `adobe-commerce-performance-and-cache`)
- In-process events and observers (use `adobe-commerce-events-and-observers`)
- REST asynchronous and bulk endpoints as an API contract (use `adobe-commerce-webapi`)
- Installing RabbitMQ or ActiveMQ Artemis servers (see the configuration guide pages in Reference)
- App Builder, Adobe I/O Events or other out-of-process extensions (use the official `adobe/skills`)

## Decision rules

- Use a provided cron group when it fits: `default` (most jobs), `index` (indexers), `consumers` (message queue consumers). Adobe Commerce also has `staging` and `catalog_event`.
- Define a custom cron group only when your jobs must run on a different schedule from other jobs or with different settings, or when they should run together and independently of the rest.
- Use `<schedule>` with a cron expression for a fixed schedule. Use `<config_path>` instead when the schedule is a system configuration value from your module's `etc/adminhtml/system.xml`. Omit both only when the schedule lives in the database or other storage.
- Use a message queue when a sender and a receiver should not contact each other directly: the publisher calls `PublisherInterface::publish($topic, $message)` and returns.
- Pick the queue files by use case:
  - publish to a queue created by a third-party system: `queue_publisher.xml` only
  - consume from an existing queue: `queue_consumer.xml` only
  - define a local queue and consume messages published by a third party: `queue_topology.xml` and `queue_consumer.xml`
  - `communication.xml` always, since it defines the topics
- Leave `connection` out of the queue files unless you must force one. The system then uses `amqp` if RabbitMQ is configured in `env.php`, `stomp` if ActiveMQ Artemis is configured, and `db` otherwise.
- Treat the MySQL adapter as a fallback. It is not scalable; production should use RabbitMQ or ActiveMQ Artemis whenever possible, and multiple consumer processes on a MySQL queue are not recommended.
- Topic names are period-separated strings from most general to most specific (`vendor.entity.action`). Wildcards are not supported in `communication.xml`; in `queue_topology.xml` bindings, `*` matches one segment and `#` matches zero or more.
- For a bulk operation launched from the Admin, use `BulkManagementInterface::scheduleBulk` and report each operation status from the consumer with `OperationManagementInterface::changeOperationStatus`.

## Hard constraints

### Constraint: Declare each cron job with a unique name, a class and a method

Every `<job>` in `etc/crontab.xml` has a unique `name`, an `instance` (the class to instantiate) and a `method`, inside a `<group id>`.

**Why this matters**

The job name is the unique ID of the job, and it is the `job_code` you find in the `cron_schedule` table. `instance` is the class to be instantiated and `method` the method of that class to call. Failed jobs are logged with `ERROR` status to `var/log/cron.log` and `var/log/exception.log`.

**Detection**

`crontab.xml` jobs whose name collides with another module's job (unless you intend to override it), jobs without `method`, or jobs outside a `<group>`.

**Correct**

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Cron:etc/crontab.xsd">
    <group id="default">
        <job name="vendor_module_sync_stock" instance="Vendor\Module\Cron\SyncStock" method="execute">
            <schedule>*/15 * * * *</schedule>
        </job>
    </group>
</config>
```

**Wrong**

```xml
<config>
    <job name="sync" instance="Vendor\Module\Cron\SyncStock">
        <schedule>*/15 * * * *</schedule>
    </job>
</config>
```

### Constraint: Disable another module's cron job by overriding its schedule, not by deleting it

Cron jobs have no `disable` flag. Redeclare the job with the same group, name, instance and method, and a schedule that never occurs.

**Why this matters**

Unlike observers, cron jobs have no disable feature. The documented technique, from a custom module, is a schedule with a date that never happens, such as the 30th of February.

**Detection**

Patches that edit core or vendor `crontab.xml` files, or attempts to add a `disabled` attribute to `<job>`.

**Correct**

```xml
<group id="default">
    <job name="visitor_clean" instance="Magento\Customer\Model\Visitor" method="clean">
        <schedule>0 0 30 2 *</schedule>
    </job>
</group>
```

**Wrong**

```xml
<group id="default">
    <job name="visitor_clean" disabled="true"/>
</group>
```

### Constraint: Give every topic either a request or a schema, and a response only when synchronous

In `communication.xml`, `name` is required and each topic includes `request` or `schema`. Add `response` only for a synchronous topic.

**Why this matters**

`request` sets the data type of the message; `schema` points to a service method in the format `<module>\Api\<ServiceName>::<methodName>`. `response` is required for synchronous topics and must be omitted for asynchronous ones.

**Detection**

Topics without `request` or `schema`, asynchronous topics with `response`, or topic names with wildcards in `communication.xml`.

**Correct**

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework:Communication/etc/communication.xsd">
    <topic name="vendor.stock.sync" request="string"/>
</config>
```

**Wrong**

```xml
<topic name="vendor.stock.*" response="string"/>
```

### Constraint: Enable only one publisher per topic and one connection per publisher

`queue_publisher.xml` has at most one enabled `publisher` for each topic, and each publisher has at most one enabled `connection`.

**Why this matters**

The documentation states that you cannot enable more than one publisher per topic, and that only one enabled connection can be defined for a publisher at any given time. Without `connection`, the connection is resolved automatically and the exchange is `magento`.

**Detection**

Two `<publisher topic="...">` entries for the same topic without `disabled="true"`, or two `<connection>` children with `disabled="false"`.

**Correct**

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework-message-queue:etc/publisher.xsd">
    <publisher topic="vendor.stock.sync">
        <connection name="amqp" exchange="magento" disabled="false"/>
        <connection name="db" exchange="magento" disabled="true"/>
    </publisher>
</config>
```

**Wrong**

```xml
<publisher topic="vendor.stock.sync">
    <connection name="amqp" exchange="magento"/>
    <connection name="db" exchange="magento"/>
</publisher>
```

### Constraint: Write consumer handlers as Class::method and keep the connection consistent

In `queue_consumer.xml`, `name` and `queue` are required, `handler` uses the format `<Vendor>\Module\<ServiceName>::<methodName>`, and an explicit AMQP `connection` must match the one in `queue_topology.xml`.

**Why this matters**

With the default consumer (`Magento\Framework\MessageQueue\Consumer`), a `handler` on the consumer is used and the handler in `communication.xml` is ignored. For AMQP connections, the documentation requires the `connection` in `queue_consumer.xml` to match the `connection` attribute in `queue_topology.xml`.

**Detection**

Handlers without `::`, or mismatched `connection` values between consumer and topology. When the module declares its own queue, check that the consumer `queue` is the `destination` of a binding in `queue_topology.xml`.

**Correct**

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework-message-queue:etc/consumer.xsd">
    <consumer name="vendor.stock.sync" queue="vendor.stock.sync"
              handler="Vendor\Module\Model\StockSyncConsumer::process"
              maxMessages="200" maxIdleTime="180" sleep="60"/>
</config>
```

**Wrong**

```xml
<consumer name="vendor.stock.sync" queue="vendor.stock.sync"
          handler="Vendor\Module\Model\StockSyncConsumer" connection="db"/>
```

## Preferred pattern

```text
Vendor/Module/
  Cron/SyncStock.php           publishes one message per batch
  Model/StockSyncConsumer.php  handler called for each message
  etc/crontab.xml
  etc/communication.xml
  etc/queue_publisher.xml
  etc/queue_topology.xml
  etc/queue_consumer.xml
```

```xml
<!-- etc/queue_topology.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:framework-message-queue:etc/topology.xsd">
    <exchange name="magento">
        <binding id="vendorStockSync" topic="vendor.stock.sync" destination="vendor.stock.sync"/>
    </exchange>
</config>
```

A custom cron group, when the jobs need their own settings:

```xml
<!-- etc/cron_groups.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_Cron:etc/cron_groups.xsd">
    <group id="vendor_module">
        <schedule_generate_every>1</schedule_generate_every>
        <schedule_ahead_for>4</schedule_ahead_for>
        <schedule_lifetime>2</schedule_lifetime>
        <history_cleanup_every>10</history_cleanup_every>
        <history_success_lifetime>60</history_success_lifetime>
        <history_failure_lifetime>600</history_failure_lifetime>
        <use_separate_process>1</use_separate_process>
    </group>
</config>
```

All values are in minutes except `use_separate_process`, which runs the group's jobs in a separate PHP process. `schedule_lifetime` is the window in which a job must start before it counts as missed.

How consumers run: the `consumers_runner` cron job (group `consumers`) starts every defined consumer, and by default each one processes 10000 messages and terminates. `app/etc/env.php` tunes this under `cron_consumers_runner` (`cron_run`, `max_messages`, `consumers`, `multiple_processes`) and `queue` (`consumers_wait_for_messages`, `only_spawn_when_message_available`, whose global default is `1`). A per-consumer `onlySpawnWhenMessageAvailable` attribute overrides the global setting. `maxIdleTime` and `sleep` apply only to consumers started with a defined `maxMessages`.

Verify while developing:

```shell
bin/magento setup:di:compile
bin/magento cache:clean
bin/magento cron:run --group="vendor_module"   # run at least twice
bin/magento queue:consumers:list
bin/magento queue:consumers:start vendor.stock.sync
```

The first `cron:run` queues jobs and the second runs them; it must occur on or after `scheduled_at`. Results are in the `cron_schedule` table and `var/log/cron.log`.

## Common failure modes

- Running `cron:run` once and concluding the job is broken.
- Crontab installed on several web nodes; in a multi-node system crontab can run on only one node.
- Cron disabled in `env.php` (`'cron' => ['enabled' => 0]`), which stops essential processes including indexing.
- Different PHP settings for the CLI and the web server plug-in, causing issues during installation and upgrade.
- Two enabled publishers for one topic.
- Expecting `queue:consumers:start --multi-process` to run in parallel; parallel processes need `multiple_processes` in `env.php`.
- `max_messages` set to `0` so consumers never terminate, which the documentation does not recommend.
- A bulk consumer that does not notify the system of each operation status (OPEN, COMPLETE, RETRIABLY_FAILED, NOT_RETRIABLY_FAILED), or operations published without `entity_id`, `entity_link` and `meta_information`, which the failed operations grid needs.

## Review checklist

- [ ] Each job has a unique `name`, `instance`, `method` and a `schedule` or `config_path`
- [ ] Jobs use `default`, `index` or `consumers` unless a custom group is justified
- [ ] Custom groups declare their options in `etc/cron_groups.xml`
- [ ] Core jobs are disabled by an impossible schedule, never by editing vendor files
- [ ] Every topic has `request` or `schema`; `response` only on synchronous topics
- [ ] One enabled publisher per topic and one enabled connection per publisher
- [ ] Consumer `handler` uses `Class::method`; a queue the module declares is the `destination` of a binding
- [ ] No explicit `connection` unless required, and consistent between consumer and topology
- [ ] Production uses RabbitMQ or ActiveMQ Artemis, not the MySQL adapter
- [ ] Verified with `cron:run` (twice) and `cron_schedule`, and with `queue:consumers:start`

## Related skills

- [`adobe-commerce-performance-and-cache`](../adobe-commerce-performance-and-cache/SKILL.md): indexers that the `index` group refreshes
- [`adobe-commerce-events-and-observers`](../adobe-commerce-events-and-observers/SKILL.md): synchronous in-process reactions
- [`adobe-commerce-webapi`](../adobe-commerce-webapi/SKILL.md): asynchronous and bulk REST endpoints built on the queue framework
- [`adobe-commerce-deploy-and-modes`](../adobe-commerce-deploy-and-modes/SKILL.md): stopping queue workers and cron during deployment

## Reference

- [Cron jobs](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cron/custom-cron) (source: `commerce-operations.en/help/configuration/cron/custom-cron.md`)
- [Customizing crons reference](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cron/custom-cron-reference) (source: `commerce-operations.en/help/configuration/cron/custom-cron-reference.md`)
- [Configure a custom cron job](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cron/custom-cron-tutorial) (source: `commerce-operations.en/help/configuration/cron/custom-cron-tutorial.md`)
- [Configure cron jobs](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/configure-cron-jobs) (source: `commerce-operations.en/help/configuration/cli/configure-cron-jobs.md`)
- [Message queues](https://developer.adobe.com/commerce/php/development/components/message-queues/) (source: `commerce-php/src/pages/development/components/message-queues/index.md`)
- [Configure message queues](https://developer.adobe.com/commerce/php/development/components/message-queues/configuration) (source: `commerce-php/src/pages/development/components/message-queues/configuration.md`)
- [Bulk operations](https://developer.adobe.com/commerce/php/development/components/message-queues/bulk-operations) (source: `commerce-php/src/pages/development/components/message-queues/bulk-operations.md`)
- [Message queues overview](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/queues/message-queue-framework) (source: `commerce-operations.en/help/configuration/queues/message-queue-framework.md`)
- [Manage message queues](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/queues/manage-message-queues) (source: `commerce-operations.en/help/configuration/queues/manage-message-queues.md`)
- [Start message queue consumers](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/cli/start-message-queues) (source: `commerce-operations.en/help/configuration/cli/start-message-queues.md`)
- [env.php reference](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/reference/config-reference-envphp) (source: `commerce-operations.en/help/configuration/reference/config-reference-envphp.md`)
