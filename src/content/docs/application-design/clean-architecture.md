---
title: Clean Architecture
description: Understand the boundaries and dependency rules behind Clean Architecture.
sidebar:
  order: 2
---

Clean Architecture organizes an application around business rules and use cases while keeping infrastructure details at the edges.

**Example implementation:** [ardalis/CleanArchitecture](https://github.com/ardalis/CleanArchitecture)

## Topics to cover

- The problem Clean Architecture is intended to solve
- The dependency rule
- Domain, application, infrastructure, and presentation responsibilities
- Keeping business rules independent of frameworks
- Using interfaces at application boundaries
- How a request flows through the layers
- Where database and external-service code belongs
- Testing across architectural boundaries
- What Clean Architecture does not require
- Tradeoffs and signs that the structure is becoming excessive
