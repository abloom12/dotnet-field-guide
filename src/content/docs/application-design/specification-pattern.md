---
title: Specification Pattern
description: Encapsulate reusable query rules in named, testable objects.
sidebar:
  order: 9
---

The Specification pattern places query criteria and query-shaping instructions into focused objects. A caller names the data it needs, while persistence infrastructure translates the specification into a database or in-memory query.

**Links:** [ardalis/Specification repository](https://github.com/ardalis/Specification) · [Documentation](https://specification.ardalis.com/) · [Core NuGet package](https://www.nuget.org/packages/Ardalis.Specification) · [EF Core package](https://www.nuget.org/packages/Ardalis.Specification.EntityFrameworkCore)

## Quick reference

### Basic specification

```csharp
using Ardalis.Specification;

public sealed class OpenOrdersForCustomerSpec : Specification<Order>
{
    public OpenOrdersForCustomerSpec(Guid customerId)
    {
        Query
            .Where(order => order.CustomerId == customerId)
            .Where(order => order.Status == OrderStatus.Open)
            .OrderByDescending(order => order.CreatedAt);
    }
}
```

Use it with a specification-aware repository:

```csharp
var spec = new OpenOrdersForCustomerSpec(customerId);
IReadOnlyList<Order> orders = await repository.ListAsync(spec, cancellationToken);
```

Or apply it directly to an EF Core query:

```csharp
List<Order> orders = await dbContext.Orders
    .WithSpecification(spec)
    .ToListAsync(cancellationToken);
```

### What a query specification can describe

```text
entity source
  → criteria (Where/Search)
  → related data (Include/ThenInclude)
  → ordering
  → paging (Skip/Take)
  → projection (Select)
  → ORM options (tracking, split query, filters)
  → execution by repository/DbContext
```

A specification describes a query; it does not execute database I/O itself.

### Core vocabulary

| Term | Meaning |
| --- | --- |
| **Criterion** | A predicate deciding which records qualify |
| **Query shape** | Includes, ordering, paging, and projection applied to the result |
| **Specification** | A named object containing criteria and query-shaping instructions |
| **Evaluator** | Infrastructure that applies a specification to a query source |
| **Entity specification** | Returns the queried entity type |
| **Projection specification** | Selects a result type such as a DTO |
| **Single-result specification** | Marks a query intended for one or zero/one result, depending on repository operation |

This page uses **specification** to mean a query specification. A business rule such as “an order can be submitted only when it has lines” is an invariant or policy, not automatically a database query specification.

### Practical rules

- Name specifications after the data they select, not the screen that currently uses them.
- Pass required filter values through the constructor.
- Keep specifications declarative and free of database execution or side effects.
- Project read models when full entities and related graphs are unnecessary.
- Apply deterministic ordering before paging.
- Treat includes and ORM options as performance-affecting behavior.
- Test important specifications against the real query provider.
- Use direct LINQ for a one-off trivial query when reuse and abstraction add no value.

## The problem specifications solve

Query logic often starts as inline LINQ:

```csharp
Order? order = await dbContext.Orders
    .Include(order => order.Lines)
    .Where(order => order.CustomerId == customerId)
    .Where(order => order.Status == OrderStatus.Open)
    .OrderByDescending(order => order.CreatedAt)
    .FirstOrDefaultAsync(cancellationToken);
```

As an application grows, similar expressions appear in handlers, services, endpoints, and repositories. Small differences create inconsistent behavior:

- one query forgets a tenant/customer boundary,
- one includes archived records,
- one omits required related data,
- two screens sort the same records differently,
- pagination is applied without stable ordering,
- a repeated predicate evolves in only one location.

A named specification centralizes the query definition:

```csharp
var spec = new LatestOpenOrderForCustomerSpec(customerId);
Order? order = await repository.FirstOrDefaultAsync(spec, cancellationToken);
```

The name makes intent visible and the object can be reused and tested. The trade-off is another file and another navigation step. A specification is most useful for meaningful, recurring, or sufficiently complex query behavior.

## Criteria and constructor inputs

Pass the values that define a query into the specification constructor:

```csharp
public sealed class OrdersCreatedInRangeSpec : Specification<Order>
{
    public OrdersCreatedInRangeSpec(DateTimeOffset from, DateTimeOffset to)
    {
        if (to < from)
        {
            throw new ArgumentException("The end must not precede the start.", nameof(to));
        }

        Query.Where(order =>
            order.CreatedAt >= from && order.CreatedAt < to);
    }
}
```

The constructor establishes a complete immutable query definition. Avoid injecting `DbContext`, repositories, clocks, or user-context services into a specification. Resolve changing values before construction and pass the values explicitly:

```csharp
DateTimeOffset now = clock.UtcNow;
var spec = new ExpiringOrdersSpec(now);
```

Explicit inputs make cache identity, testing, and query behavior easier to reason about.

Conditional builder overloads can support optional filters:

```csharp
public sealed class OrderSearchSpec : Specification<Order>
{
    public OrderSearchSpec(OrderFilter filter)
    {
        Query
            .Where(x => x.CustomerId == filter.CustomerId,
                filter.CustomerId is not null)
            .Where(x => x.Status == filter.Status,
                filter.Status is not null)
            .OrderByDescending(x => x.CreatedAt);
    }
}
```

For highly dynamic search screens, one parameterized specification can be clearer than many classes for every filter combination. Validate page sizes, sort choices, and allowed filters before constructing it.

## Includes and related data

Entity specifications can request eager-loaded navigation properties:

```csharp
public sealed class OrderWithLinesSpec : SingleResultSpecification<Order>
{
    public OrderWithLinesSpec(Guid orderId)
    {
        Query
            .Where(order => order.Id == orderId)
            .Include(order => order.Lines)
            .ThenInclude(line => line.Product);
    }
}
```

Includes affect the SQL shape and amount of materialized data. They are not harmless metadata. Large collection graphs can create:

- large joins and duplicated rows,
- excessive memory use,
- slow materialization,
- cartesian explosion,
- extra round trips when split-query behavior is selected.

Use an include when the operation needs tracked entities and their relationships. For read-only output, projection is often smaller and clearer.

Do not depend on an entity being “usually loaded” elsewhere. A specification should state the related data its consumer requires, or project exactly the fields needed.

## Ordering and paging

Ordering belongs in a specification when it is part of the query contract:

```csharp
public sealed class RecentOrdersPageSpec : Specification<Order>
{
    public RecentOrdersPageSpec(int skip, int take)
    {
        Query
            .OrderByDescending(order => order.CreatedAt)
            .ThenBy(order => order.Id)
            .Skip(skip)
            .Take(take);
    }
}
```

The identifier provides a deterministic tie-breaker when several records share the same creation time. Without stable ordering, records can move between offset-based pages or appear more than once.

Validate and cap page size before querying. `Take` limits rows but does not protect an application if callers can request arbitrarily expensive filters/includes. Large or frequently changing datasets may need cursor/keyset pagination instead of `Skip`/`Take`.

Count and page queries often share filtering but not paging. Ensure the count operation evaluates criteria without applying the page limit according to the repository/evaluator API being used.

## Projection

A projection specification returns a result model instead of materializing full entities:

```csharp
public sealed record OrderListItem(
    Guid Id,
    string CustomerNumber,
    OrderStatus Status,
    decimal Total);

public sealed class OrderListSpec
    : Specification<Order, OrderListItem>
{
    public OrderListSpec(Guid customerId)
    {
        Query
            .Where(order => order.CustomerId == customerId)
            .OrderByDescending(order => order.CreatedAt)
            .Select(order => new OrderListItem(
                order.Id,
                order.Customer.Number,
                order.Status,
                order.Total));
    }
}
```

Projection lets the provider select only required columns and can avoid loading a large entity graph. It is usually preferred for query/read-model handlers that do not modify entities.

Keep projection expressions translatable by the selected provider. A normal C# helper method may compile but fail translation or force unwanted client-side work. Inspect generated SQL and test with the real provider when the expression is nontrivial.

The library's `WithProjectionOf` feature can combine the filtering/query shape from one specification with a projection from another. Use composition where it removes meaningful duplication without making the final query difficult to discover.

## Reusing and composing specifications

The safest reuse is often a named, parameterized specification:

```csharp
var spec = new OpenOrdersForCustomerSpec(customerId);
```

Other options include:

- private expression helpers for shared criteria,
- a small base specification for a genuinely universal boundary,
- builder extension methods for a recurring query operation,
- `WithProjectionOf` for reusing a query with different result shapes,
- logical composition features supported by the selected library version.

Be cautious with inheritance-heavy composition. A name such as `PagedActiveVisibleOrdersWithCustomerAndLinesSpec` signals that independent concerns may have been stacked until the resulting SQL is hard to predict.

Security and ownership filters deserve special attention. If every tenant-owned query must include `TenantId`, relying on developers to choose the right optional specification may be unsafe. Consider provider-level query filters, tenant-scoped repositories, or another enforced boundary. Specifications can express access criteria, but optional use is not enforcement.

## Using specifications with repositories

A specification-aware repository can expose a small query API:

```csharp
public interface IReadRepository<T> where T : class
{
    Task<T?> FirstOrDefaultAsync(
        ISingleResultSpecification<T> specification,
        CancellationToken cancellationToken = default);

    Task<List<T>> ListAsync(
        ISpecification<T> specification,
        CancellationToken cancellationToken = default);

    Task<int> CountAsync(
        ISpecification<T> specification,
        CancellationToken cancellationToken = default);
}
```

The concrete repository uses the evaluator to apply the specification to the provider query:

```csharp
IQueryable<T> query = SpecificationEvaluator.Default
    .GetQuery(dbContext.Set<T>(), specification);

return await query.ToListAsync(cancellationToken);
```

Ardalis.Specification also supplies repository base classes for EF integrations. Whether to use those or an application-specific repository is an architectural choice.

Avoid adding custom repository methods that merely restate every specification:

```csharp
GetOpenOrdersForCustomerAsync(customerId)
```

If callers already construct `OpenOrdersForCustomerSpec`, a generic `ListAsync(spec)` method is usually enough. Keep custom methods for repository operations with meaningful semantics that are not adequately represented by the standard specification API.

A repository/specification abstraction is not automatically superior to using EF Core directly. Direct application-layer queries with `WithSpecification` can preserve specification reuse without hiding all of `DbContext` behind a generic repository.

## Specifications versus business rules

A query specification answers a data-selection question:

> Which open orders belong to this customer?

A domain rule answers a behavior question:

> May this order be submitted now?

Do not use an EF-oriented specification as the only implementation of an invariant. An entity should not require a database query to decide whether its already-loaded state is valid. Conversely, do not load every record and run domain methods in memory when a query predicate can safely filter at the database.

Sometimes the same concept needs two representations:

- an expression translated to SQL for finding candidate records,
- domain behavior that makes the authoritative decision before state changes.

Keep the meanings aligned, but do not pretend the two execution contexts are identical. Time, null semantics, string comparison, navigation loading, and provider translation can produce different behavior.

## ORM-specific options

Ardalis.Specification can describe provider-specific behavior such as:

- `AsNoTracking` for read-only EF queries,
- identity-resolution options,
- split-query behavior,
- ignoring global query filters,
- query tags,
- automatic-include behavior.

These settings belong only where the application deliberately accepts their consequences. In particular:

- no-tracking entities should not be modified with the expectation that `SaveChanges` will persist them,
- ignoring global filters can bypass soft-delete or tenant boundaries,
- split and single queries have different consistency/performance trade-offs,
- query tags must not contain sensitive values.

A specification's name should reveal surprising behavior, such as `OrderByIdReadOnlySpec` or `AllOrdersIncludingDeletedSpec`.

## Testing specifications

A specification can be evaluated against an in-memory collection:

```csharp
var orders = new[]
{
    OrderTestData.Open(customerId),
    OrderTestData.Submitted(customerId),
    OrderTestData.Open(otherCustomerId)
};

var spec = new OpenOrdersForCustomerSpec(customerId);
IEnumerable<Order> result = spec.Evaluate(orders);

Assert.Single(result);
```

This is useful for basic criteria and ordering. In-memory evaluation ignores ORM-specific features and cannot prove that EF Core translates an expression correctly.

Add provider-backed integration tests for important queries. Verify:

- translated filtering and null semantics,
- includes or projections,
- ordering and page boundaries,
- global filters and tenant boundaries,
- single-result assumptions,
- cancellation,
- generated query count and performance-sensitive SQL.

SQLite, SQL Server, PostgreSQL, and EF's in-memory provider do not behave identically. Use the production provider for tests whose correctness depends on provider semantics.

## Understand the generated query

A clean specification can still produce a poor query. During development, inspect EF Core logging or `ToQueryString()` on the evaluated `IQueryable`:

```csharp
IQueryable<Order> query = SpecificationEvaluator.Default
    .GetQuery(dbContext.Orders, spec);

string sql = query.ToQueryString();
```

Look for:

- missing ownership/soft-delete predicates,
- unnecessary columns or joins,
- cartesian expansion from collection includes,
- client evaluation or translation failures,
- unstable ordering,
- filters that cannot use indexes,
- repeated queries caused by later navigation access.

Do not assert entire generated SQL strings in ordinary tests; provider and framework upgrades can change harmless formatting or query shape. Assert behavior, and use targeted query/plan checks for known performance requirements.

## When direct LINQ is clearer

Use direct LINQ when a query is local, short, and unlikely to be reused:

```csharp
bool exists = await dbContext.Orders
    .AnyAsync(order => order.Id == id, cancellationToken);
```

A specification is more likely to pay for itself when:

- criteria recur in multiple operations,
- the query has important includes, ordering, or projection,
- a named query communicates business intent,
- repositories need a common query contract,
- the query deserves focused provider-backed tests.

Avoid creating `AllOrdersSpec`, `OrderByIdSpec`, and similar wrappers solely to eliminate every visible LINQ expression. The goal is to centralize meaningful query knowledge, not to require a class for every database call.
