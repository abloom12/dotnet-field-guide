---
title: Publishing Applications
description: Produce deployment output and choose framework-dependent, self-contained, single-file, trimmed, or AOT publishing.
sidebar:
  order: 7
---

`dotnet publish` transforms a built project into a deployment-ready directory for a selected target framework, configuration, runtime, and packaging strategy.

## Quick reference

### Common commands

```bash
# Framework-dependent, portable output
dotnet publish src/MyApp -c Release -o ./publish

# Framework-dependent for one RID
dotnet publish src/MyApp -c Release -r linux-x64 --self-contained false

# Self-contained for one RID
dotnet publish src/MyApp -c Release -r linux-x64 --self-contained true -o ./publish

# Project-configured publish profile
dotnet publish src/MyApp -c Release -p:PublishProfile=Production
```

Since RID and self-contained defaults can differ by SDK/project settings, specify `--self-contained true|false` explicitly in deployment automation.

### Deployment choices

| Choice | Destination needs .NET runtime? | Output size | Portability |
| --- | --- | --- | --- |
| Framework-dependent, no RID | Yes | Smallest typical | Broad across compatible platforms |
| Framework-dependent, RID-specific | Yes | Small | One runtime family/architecture |
| Self-contained | No separate shared runtime | Larger | One RID |
| Single-file | Depends on self-contained setting | Consolidated, not always literally one artifact | Usually RID-specific |
| Trimmed | Depends | Smaller | Requires trim-compatible code/libraries |
| Native AOT | No JIT runtime deployment | Often fast startup; constrained | RID-specific native executable |

### Choose conservatively

1. Start framework-dependent when the destination runtime is centrally managed.
2. Choose self-contained when runtime installation/version cannot be assumed.
3. Add a RID only when targeting a known platform or using runtime-specific assets.
4. Add single-file for distribution convenience, not as a security boundary.
5. Enable trimming/AOT only after dependency compatibility and publish-mode tests.

### Always validate published output

```bash
dotnet publish ...
# Copy output into a clean environment resembling production.
# Start it using the real entry command and required configuration.
# Run smoke/integration tests there.
```

A successful build is not a successful deployment.

## Build output versus publish output

Build output under `bin/{Configuration}/{TFM}/` supports development, tests, and project-to-project build chaining. It contains assemblies and metadata needed to run in the build context.

Publish output under `bin/{Configuration}/{TFM}/publish/` by default is curated for deployment. Publish can:

- select runtime-specific package assets,
- include a runtime for self-contained deployment,
- generate a platform app host,
- bundle files,
- trim unused code,
- ahead-of-time compile,
- apply publish-only MSBuild targets,
- copy configured content.

Deploy publish output, not an arbitrary copy of `bin/Debug`.

Publishing does not automatically create infrastructure definitions, apply configuration/secrets, migrate databases, stop old processes, or verify health. Those belong to deployment operations.

## Using `dotnet publish`

Basic syntax:

```bash
dotnet publish path/to/App.csproj \
  --configuration Release \
  --framework net10.0 \
  --output ./artifacts/publish
```

Publish performs restore and build implicitly unless disabled:

```bash
dotnet restore --locked-mode
dotnet publish --no-restore -c Release
```

Useful inputs include:

- `-c` / `--configuration`,
- `-f` / `--framework`,
- `-r` / `--runtime`,
- `--self-contained`,
- `-o` / `--output`,
- `-p:Name=Value` for MSBuild publish properties.

In multi-project commands, avoid one shared output directory that allows projects to overwrite one another. Give each deployable project a distinct artifact path.

A `.pubxml` publish profile can store repeatable MSBuild publish properties. Keep environment secrets out of profiles.

## Framework-dependent deployments

A framework-dependent deployment relies on a compatible .NET shared runtime installed at the destination:

```bash
dotnet publish -c Release --self-contained false
```

It normally launches with:

```bash
dotnet MyApp.dll
```

A platform-specific app host may also be present depending on settings.

Advantages:

- smaller deployment,
- runtime security servicing can be centralized,
- one portable publish may work across compatible operating systems when no RID-specific native assets are needed.

Trade-offs:

- deployment must provision a compatible runtime,
- runtime selection/roll-forward becomes an operational dependency,
- host architecture must match required native assets.

Use `dotnet --list-runtimes` at the destination when diagnosing startup.

## Self-contained deployments

A self-contained deployment includes the selected .NET runtime:

```bash
dotnet publish -c Release -r linux-x64 --self-contained true
```

Advantages:

- destination does not need a separately installed shared .NET runtime,
- application controls the included runtime version,
- runtime availability is predictable.

Trade-offs:

- larger output,
- one publish per RID,
- rebuilding/redeploying is required to receive .NET runtime security fixes,
- native platform prerequisites may still exist.

Self-contained does not mean “no operating-system dependencies” or “runs everywhere.” It targets a specific OS/architecture environment.

## Runtime identifiers

A runtime identifier (RID) selects a runtime platform/architecture, for example:

```text
win-x64
win-arm64
linux-x64
linux-arm64
osx-x64
osx-arm64
```

Use:

```bash
dotnet publish -r linux-arm64
```

RID selection affects native assets, app hosts, and publish compatibility. Modern .NET uses a portable RID graph; distribution/version-specific RIDs are not interchangeable with every package’s support.

A correct RID does not guarantee compatibility with every Linux libc, native dependency, OS version, or container base image. Test on the actual destination family.

Libraries should avoid declaring a runtime identifier unless they genuinely require a runtime-specific build; applications normally make the deployment choice.

## Single-file publishing

Configure in the project/profile or command:

```bash
dotnet publish -c Release -r linux-x64 \
  --self-contained true \
  -p:PublishSingleFile=true
```

Single-file publishing bundles managed application content into a host. Depending on settings and dependencies, native libraries, symbols, configuration, or content files may remain separate or be extracted at runtime.

Benefits include simpler distribution and fewer loose assemblies. Trade-offs include larger executable files, startup/extraction considerations, changed file-location behavior, and diagnostics/tool compatibility.

Code should use `AppContext.BaseDirectory` for content located beside the application rather than assuming `Assembly.Location` identifies an ordinary DLL path. Test APIs that inspect assembly files.

Single-file is packaging, not encryption or code protection.

## Trimming

Trimming removes code the analysis believes is unused:

```bash
dotnet publish -c Release -r linux-x64 --self-contained true \
  -p:PublishTrimmed=true
```

It works best when code paths are statically visible. Reflection, dynamic loading, serializers, dependency injection scanning, and plugins can reference members the trimmer cannot infer.

Treat trim warnings as potential runtime defects. Preferred remedies are:

1. use trim-compatible library versions and source-generated/static APIs,
2. redesign dynamic discovery where practical,
3. add accurate trimming annotations/descriptors only when semantics are understood,
4. avoid broad warning suppression.

Run published-mode tests over reflection-heavy and rarely used paths. Build/test without publishing cannot validate trimmed output.

## Native AOT

Native ahead-of-time publishing compiles an application to native code ahead of execution:

```bash
dotnet publish -c Release -r linux-x64 \
  -p:PublishAot=true
```

Potential benefits include fast startup, lower memory in some workloads, and no JIT requirement at runtime. Trade-offs include longer publishing, larger build complexity, platform-specific artifacts, and restrictions around runtime code generation, dynamic assembly loading, and reflection.

Native AOT generally includes trimming analysis, so dependencies must be AOT/trim compatible. Not every application framework or library feature supports AOT equally.

Choose it for measured startup, size, or deployment goals—not merely because native output sounds preferable.

## Choosing a publishing approach

Ask:

1. Who owns runtime installation and patching?
2. Which OS, architecture, libc/container family, and native dependencies are required?
3. Is one portable artifact necessary, or are per-RID artifacts acceptable?
4. Is artifact size or startup time a measured constraint?
5. Do libraries use reflection, plugins, runtime code generation, or dynamic serialization?
6. Can CI test the exact publish mode on the target platform?
7. How quickly can runtime security updates be rebuilt and deployed?

A common progression is framework-dependent → self-contained if operationally needed → single-file if distribution benefits → trimming/AOT only with compatibility evidence.

## Project responsibility versus deployment responsibility

The project/publish profile should define repeatable artifact properties:

- target framework and supported RIDs,
- self-contained/framework-dependent choice,
- trimming/AOT/single-file settings,
- files that belong in the artifact,
- compile/publish features required by the application.

Deployment tooling should define environment operations:

- artifact storage and promotion,
- credentials and secret injection,
- infrastructure and network policy,
- process/container/service configuration,
- database migrations and ordering,
- health checks, rollout, rollback, and observability,
- environment-specific scaling and resource limits.

Do not bake production secrets or mutable environment configuration into a publish artifact. Build once and promote the same verified artifact where the organization’s deployment model allows it.
