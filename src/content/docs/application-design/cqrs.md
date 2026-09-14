---
title: CQRS
description: Understand separate command and query paths at the application level.
sidebar:
  order: 5
---

CQRS separates the models and handlers used to change application state from those used to read it.

## Topics to cover

- How CQRS differs from CQS
- Commands, queries, and their handlers
- Separate request and response models
- Read paths versus write paths
- Using CQRS within one application and one database
- Validation, authorization, and transaction boundaries
- Benefits for complex application behavior
- Costs and additional indirection
- Why CQRS does not require event sourcing or microservices
- When a direct service call is simpler
