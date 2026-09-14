---
title: Packages and Dependencies
description: Understand NuGet packages, feeds, restore, version resolution, and dependency maintenance.
sidebar:
  order: 5
---

NuGet is .NET’s package ecosystem and restore system. Projects declare direct package dependencies; restore resolves a complete graph and selects assets compatible with each target.

## Quick reference

### Package versus project reference

```xml
<ItemGroup>
  <PackageReference Include="Example.Client" Version="4.2.1" />
  <ProjectReference Include="../Domain/Domain.csproj" />
</ItemGroup>
```

| Reference | Use when | Resolved from |
| --- | --- | --- |
| `PackageReference` | Consume a versioned, packed dependency | NuGet feeds/global cache |
| `ProjectReference` | Develop against another project in the repository | Referenced project build output |
| `FrameworkReference` | Consume a shared .NET framework | Installed/targeting framework packs |

### Everyday commands

```bash
dotnet add src/MyApp package Example.Client --version 4.2.1
dotnet remove src/MyApp package Example.Client
dotnet list src/MyApp package
dotnet list src/MyApp package --include-transitive
dotnet list src/MyApp package --outdated
dotnet list src/MyApp package --vulnerable --include-transitive
dotnet restore
```

Command spelling and available switches vary somewhat by SDK; use `--help` with the repository’s selected SDK.

### Restore outputs and locations

```text
ProjectReference/PackageReference declarations
  + Directory.Packages.props
  + NuGet.config and sources
  + target framework / RID
  → NuGet resolution
  → ~/.nuget/packages (global package cache, typical)
  → obj/project.assets.json (project-specific resolved graph)
```

### Safe update checklist

1. Read release notes and breaking changes.
2. Change the direct or central version declaration.
3. Restore from approved sources.
4. Inspect direct/transitive changes.
5. Build and run tests for all relevant TFMs/RIDs.
6. Run vulnerability/license policy checks.
7. Commit lock files when the repository uses them.

## What NuGet provides

NuGet defines:

- the `.nupkg` package format,
- package metadata and dependency declarations,
- public and private feed protocols,
- restore and version resolution behavior,
- a local global-packages cache,
- tooling integrated with the .NET CLI, MSBuild, and IDEs.

A package can contain compile assemblies, runtime assemblies, native assets, analyzers, source generators, MSBuild props/targets, content files, and metadata for different frameworks/RIDs. Installing a package is therefore not always equivalent to copying one DLL.

Treat packages as executable supply-chain inputs. Use trusted sources, review ownership and maintenance, and keep dependencies current.

## Package references versus project references

A package reference consumes a packaged version:

```xml
<PackageReference Include="Contoso.Logging" Version="3.1.0" />
```

A project reference consumes another source project:

```xml
<ProjectReference Include="../Contoso.Logging/Contoso.Logging.csproj" />
```

Project references support coordinated source changes and build ordering. Package references enforce a versioned boundary and are appropriate across repositories/releases.

Do not reference a local project’s `bin/*.dll` with a raw assembly path. That bypasses build ordering, target compatibility, and transitive dependency information.

Converting between package and project references can alter transitive assets and version resolution. Ensure only one intended source supplies the dependency.

## Adding, removing, and updating packages

Use the CLI to preserve valid XML and trigger restore:

```bash
dotnet add src/MyApp package Contoso.Client --version 2.4.0
dotnet remove src/MyApp package Contoso.Client
```

Or edit the project/central file directly and run restore. In centrally managed repositories, a project may omit `Version` and the version belongs in `Directory.Packages.props`.

List dependencies before and after updates:

```bash
dotnet list src/MyApp package --include-transitive
dotnet list src/MyApp package --outdated
```

Update intentionally rather than accepting all latest versions blindly. Major versions often require migration; even compatible updates can change runtime behavior, analyzers, generated code, or deployment assets.

Remove unused direct references to reduce restore graph, attack surface, and ambiguity—but verify the package is not required for build targets, analyzers, reflection, or runtime discovery.

## Package sources and feeds

Sources are configured in `NuGet.config` files, command options, and environment/tooling settings. Configuration files can be discovered across machine, user, and directory scopes.

Inspect sources:

```bash
dotnet nuget list source
dotnet nuget enable source SourceName
dotnet nuget disable source SourceName
```

Private feeds require credentials. Use an approved credential provider, CI secret, or secure local configuration; never commit clear-text credentials or tokens.

When several sources contain the same package ID, source behavior can become ambiguous and increase dependency-confusion risk. Package Source Mapping can restrict package patterns to intended sources. Consider feed availability, retention, and upstream caching in CI reliability planning.

## Restore and the global package cache

Restore resolves packages but normally does not copy each package into the repository. Packages are extracted into a per-user global packages folder, commonly:

```text
~/.nuget/packages
```

Find configured locations with:

```bash
dotnet nuget locals all --list
```

The project-specific graph is written under `obj/`, notably `project.assets.json`. Build consumes this generated graph.

Clear caches only for a concrete corruption/staleness problem:

```bash
dotnet nuget locals all --clear
```

Clearing makes later restores slower and may break offline builds. It does not fix an invalid declared dependency graph.

CI caching should key on OS/architecture and dependency declarations/lock files, while still allowing integrity validation and security updates according to policy.

## Direct and transitive dependencies

A **direct** dependency appears in the project (or central declaration applied to it). A **transitive** dependency is required by another package.

```text
MyApp → Package A → Package B
```

The application may compile against selected transitive assets even without directly declaring Package B, subject to NuGet rules. Add a direct reference when the project intentionally uses B’s API or must control its version; do not add one merely to silence uncertainty without understanding resolution.

Inspect the full graph:

```bash
dotnet list src/MyApp package --include-transitive
```

Package metadata can control asset flow with `IncludeAssets`, `ExcludeAssets`, and `PrivateAssets`. A common analyzer/build-tool pattern is:

```xml
<PackageReference Include="Example.Analyzers" Version="1.0.0">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
```

Use these settings only after understanding which consumers need which assets.

## Version ranges and resolution

A package version can be exact/minimum-style or expressed as a range according to NuGet version syntax. Examples:

```xml
<PackageReference Include="Example" Version="1.2.3" />
<PackageReference Include="Example" Version="[1.2.3,2.0.0)" />
```

Ranges can permit updates without editing declarations, but make restore outcomes more dependent on feed state unless locked. Most applications prefer explicit versions plus deliberate updates.

When dependency paths request different versions, NuGet applies resolution rules such as direct-dependency precedence and nearest-wins behavior. Warnings including package downgrade diagnostics deserve investigation; suppressing them can defer failure to runtime.

A resolved version satisfying compilation does not guarantee binary/runtime compatibility between every library. Test the application, not only restore.

## Conflicts and diagnostics

Symptoms include downgrade warnings, missing methods/types at runtime, incompatible assets, or different local/CI resolutions.

Diagnose with:

```bash
dotnet restore -v detailed
dotnet list src/MyApp package --include-transitive
```

Then inspect:

- direct version declarations,
- central overrides,
- target frameworks and RIDs,
- `project.assets.json` when necessary,
- package source/mapping differences,
- lock-file mode,
- package release notes and compatibility.

Prefer aligning packages from one product family to documented compatible versions. Avoid assembly-binding-style guesses or manually copying DLLs into output.

## Central package management

Central Package Management puts versions in `Directory.Packages.props`:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>

  <ItemGroup>
    <PackageVersion Include="Example.Client" Version="4.2.1" />
    <PackageVersion Include="Example.Analyzers" Version="1.5.0" />
  </ItemGroup>
</Project>
```

Projects reference the package without a version:

```xml
<PackageReference Include="Example.Client" />
```

Benefits include one update location, consistent versions, and easier inventory. Central management does not mean every project receives every package; each project still declares what it uses.

Conditional versions and per-project overrides exist but reduce simplicity. Keep exceptions rare and documented.

## Lock files and reproducible restore

Enable a lock file:

```xml
<PropertyGroup>
  <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

Restore writes `packages.lock.json`, recording the resolved dependency graph. In CI:

```bash
dotnet restore --locked-mode
```

Locked mode fails when declarations and lock state disagree rather than silently rewriting the graph. Commit lock files when repository policy uses them, especially for applications. Library authors should choose based on how the library is consumed and NuGet guidance.

A lock file controls package resolution; it does not freeze SDK behavior, remote build scripts outside packages, runtime base images, or external deployment dependencies. Reproducibility requires controlling all relevant inputs.

## Outdated and vulnerable packages

Check regularly:

```bash
dotnet list package --outdated
dotnet list package --vulnerable --include-transitive
dotnet list package --deprecated
```

Results depend on configured sources and advisory data. A clean report is not a complete security review; package trust, signatures/policies, malicious updates, native assets, and unsupported frameworks still matter.

For a transitive vulnerability:

1. identify the direct dependency path,
2. update the parent package when possible,
3. check whether a safe compatible transitive version can be selected,
4. temporarily pin directly only with understanding and tests,
5. document accepted risk if no fix exists,
6. remove temporary overrides once upstream is corrected.

Automate dependency inventory and review update pull requests, but keep a human responsible for behavior changes and deployment verification.
