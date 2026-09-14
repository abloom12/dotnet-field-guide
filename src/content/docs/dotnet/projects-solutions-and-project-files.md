---
title: Projects, Solutions, and Project Files
description: Understand how .NET codebases are grouped, referenced, and configured.
sidebar:
  order: 3
---

A project is a buildable unit with one primary output. A solution groups projects for tooling. Project references—not folder placement—form the compile-time dependency graph.

## Quick reference

### Repository shape

```text
MyProduct/
├── global.json
├── Directory.Build.props
├── Directory.Packages.props
├── MyProduct.sln
├── src/
│   ├── MyProduct.Api/MyProduct.Api.csproj
│   ├── MyProduct.Application/MyProduct.Application.csproj
│   └── MyProduct.Domain/MyProduct.Domain.csproj
└── tests/
    └── MyProduct.Application.Tests/MyProduct.Application.Tests.csproj
```

### Minimal SDK-style project

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../MyProduct.Domain/MyProduct.Domain.csproj" />
    <PackageReference Include="Example.Package" Version="1.2.3" />
  </ItemGroup>
</Project>
```

### Everyday commands

```bash
dotnet new sln -n MyProduct
dotnet new classlib -n MyProduct.Domain -o src/MyProduct.Domain
dotnet sln MyProduct.sln add src/MyProduct.Domain/MyProduct.Domain.csproj
dotnet add src/MyProduct.Application reference src/MyProduct.Domain
dotnet remove src/MyProduct.Application reference src/MyProduct.Domain
dotnet sln MyProduct.sln list
```

### `bin` versus `obj`

| Directory | Contains | Delete safely? |
| --- | --- | --- |
| `bin/` | Final build/publish-facing outputs by configuration and TFM | Yes; regenerated |
| `obj/` | Intermediate files, restore graph, generated source/assets, build state | Yes; regenerated, but restore is then required |

Both should normally be ignored by source control.

## Projects versus solutions

A **project** (`.csproj`, `.fsproj`, or `.vbproj`) is evaluated by MSBuild. It declares how source becomes a library, executable, test assembly, web app, or another output.

A **solution** (`.sln` or newer `.slnx`) is a workspace containing project paths and build organization. It helps IDEs and commands operate on a set of projects:

```bash
dotnet build MyProduct.sln
dotnet test MyProduct.sln
```

A solution:

- does not define the runtime module system,
- is not deployed with the application,
- does not replace project references,
- is optional for building an individual project.

Large repositories may use multiple solutions or solution filters for focused workflows while preserving the same project graph.

## SDK-style `.csproj` anatomy

The root `Project` element selects an SDK:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
```

Common SDKs include:

- `Microsoft.NET.Sdk` for libraries and console-style applications,
- `Microsoft.NET.Sdk.Web` for ASP.NET Core applications,
- `Microsoft.NET.Sdk.Worker` for workers (depending on template/version),
- specialized SDK/workload settings for other application models.

SDK-style projects import extensive default props and targets. They implicitly include source files such as `**/*.cs`, so ordinary files do not need to be listed individually. Generated and build-output directories are excluded by defaults.

Inspect the project plus imported repository files before assuming a property’s origin. The evaluated project is larger than the visible `.csproj`.

## `PropertyGroup`

Properties are scalar MSBuild values:

```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
  <OutputType>Exe</OutputType>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>
```

Groups and properties can be conditional:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Release'">
  <DebugType>embedded</DebugType>
</PropertyGroup>
```

Later assignments can override earlier values, subject to MSBuild evaluation and conditions. Repository-wide properties often come from `Directory.Build.props`; command-line `-p:Name=Value` may override project defaults.

MSBuild property syntax uses `$(PropertyName)`.

## `ItemGroup`

Items are collections of files or logical inputs with optional metadata:

```xml
<ItemGroup>
  <PackageReference Include="Example.Package" Version="1.2.3" />
  <ProjectReference Include="../Domain/Domain.csproj" />
  <Content Include="seed-data.json" CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```

Items commonly use `Include`, `Remove`, or `Update`:

```xml
<ItemGroup>
  <None Update="settings.example.json" CopyToOutputDirectory="PreserveNewest" />
  <Compile Remove="Legacy/**/*.cs" />
</ItemGroup>
```

MSBuild item syntax uses `@(ItemName)`, and metadata uses `%(MetadataName)`. Most application projects only need to recognize these concepts; custom targets require deeper MSBuild knowledge.

## Target frameworks and output types

A single target:

```xml
<TargetFramework>net10.0</TargetFramework>
```

Multiple library targets:

```xml
<TargetFrameworks>net8.0;net10.0</TargetFrameworks>
```

Multi-targeting builds separately for each TFM and can use conditions when references or code differ. Prefer one target unless consumers genuinely require several.

`OutputType` commonly uses:

- `Library` for a `.dll` intended to be referenced,
- `Exe` for an executable entry point,
- `WinExe` for a Windows GUI executable without a console window.

Modern .NET executable projects still produce a primary `.dll` plus a platform-specific app host in many build configurations. Publishing determines the final deployment shape.

## Nullable reference types and implicit usings

Enable nullable reference analysis:

```xml
<Nullable>enable</Nullable>
```

This changes compiler analysis and emitted annotations; it does not add runtime null checks. New projects should generally enable it and address warnings rather than suppress them broadly.

Enable SDK-generated common namespace imports:

```xml
<ImplicitUsings>enable</ImplicitUsings>
```

The generated imports depend on the project SDK. Explicit `using` and `global using` directives remain available. Disable implicit usings when a project values fully explicit imports, but follow repository consistency.

Language version usually follows the target framework/toolchain defaults. Set `<LangVersion>` only for a deliberate compatibility need; `latest` can make builds vary with whichever SDK happens to be selected.

## Project references

A project reference creates a dependency on another project output:

```xml
<ProjectReference Include="../MyProduct.Domain/MyProduct.Domain.csproj" />
```

MSBuild builds referenced projects in dependency order and passes a compatible target output to the compiler. This enables source-level development across projects without packing them first.

Add/remove with CLI commands:

```bash
dotnet add src/MyProduct.Application reference src/MyProduct.Domain
dotnet remove src/MyProduct.Application reference src/MyProduct.Domain
```

Avoid circular project references; they cannot form a valid build graph and usually indicate misplaced responsibilities. Referenced target frameworks must be compatible with the consuming project.

A `PackageReference` instead consumes a versioned package restored from a feed/cache. Use project references within one actively developed repository and package references for versioned distributable dependencies.

## Adding and removing solution projects

```bash
dotnet sln MyProduct.sln add src/MyProduct.Api/MyProduct.Api.csproj
dotnet sln MyProduct.sln remove src/MyProduct.Api/MyProduct.Api.csproj
dotnet sln MyProduct.sln list
```

Adding a project to a solution does **not** reference it from another project. Removing it from a solution does **not** remove project references or delete files.

Some newer SDK commands support noun-first variants, and `.slnx` support depends on tooling versions. Use the syntax established by the repository and selected SDK.

## Common repository-level files

| File | Purpose |
| --- | --- |
| `global.json` | SDK selection policy |
| `Directory.Build.props` | Properties/items imported early for projects below that directory |
| `Directory.Build.targets` | Targets/properties imported later in project evaluation |
| `Directory.Packages.props` | Central NuGet package versions |
| `NuGet.config` | Package sources, credentials references, mapping, and restore policy |
| `.editorconfig` | Formatting and analyzer severity conventions |
| `.sln` / `.slnx` | Project workspace/grouping |
| `packages.lock.json` | Resolved NuGet graph when lock files are enabled |
| `launchSettings.json` | Local launch profiles used by tooling; not production deployment configuration |

Directory-level files apply according to location and MSBuild/NuGet discovery rules. A nested file can create a boundary or override behavior, so inspect the full directory chain.

Do not commit secrets in any of these files. Use approved credential providers, environment configuration, or secret stores.

## `bin` and `obj`

A typical project creates paths such as:

```text
bin/Debug/net10.0/
obj/project.assets.json
obj/Debug/net10.0/
```

`obj/` contains restore results, generated assembly metadata, generated global usings, source-generator output metadata, caches, and intermediate compiler/build files. `bin/` contains copied dependencies and outputs intended to run or feed later steps.

Delete both when diagnosing a genuinely stale build:

```bash
dotnet clean
# If necessary, manually remove bin/ and obj/, then restore/build again.
```

Cleaning is a troubleshooting step, not a normal fix for deterministic build errors. If stale output repeatedly matters, investigate incorrect custom targets, undeclared inputs, generated-file ownership, or tooling defects.

## Reading an unfamiliar repository

1. Find `global.json` and run `dotnet --info` from the repository root.
2. Find solutions and project files.
3. Read `Directory.Build.props`, `Directory.Build.targets`, and `Directory.Packages.props`.
4. Identify executable projects by SDK, `OutputType`, and startup code.
5. Follow `ProjectReference` edges to understand dependency direction.
6. Check each TFM and platform condition.
7. Inspect package sources without exposing credentials.
8. Build from the documented entry point before changing structure.

Folder names suggest architecture; project references enforce it.
