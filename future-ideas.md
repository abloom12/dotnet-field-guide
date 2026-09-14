# Future Ideas

Ideas for growing the .NET Field Guide beyond the current technology-learning sections. These are possibilities, not committed requirements.

## Project direction

The site could eventually serve two related purposes:

1. A practical field guide for learning the company’s technology stack.
2. An internal engineering handbook for onboarding and understanding the company’s applications.

The current technical sections should remain general and reusable. Company-specific material should live in clearly separate sections.

## Developer Onboarding

A practical path from receiving a laptop to submitting a first change.

Potential pages:

- Onboarding Overview
- Accounts and Access
- Workstation Setup
- Required SDKs and Tools
- Repository Map
- Environment Variables and Secrets
- Local Database Setup
- Starting the Application
- Running Tests
- Debugging Locally
- Submitting Your First Change
- Common Setup Problems
- Team and System Ownership

Do not store actual secrets. Explain where and how an authorized developer obtains them.

## Product and Domain

Help developers understand what the software does and why it behaves the way it does.

Potential pages:

- Product Overview
- Domain Glossary
- Major User Roles
- Core Business Workflows
- Important Business Rules
- Permissions and Ownership
- External Systems and Integrations
- Common Domain Misunderstandings

Before creating this section, clarify what “DODD” means within the company and use the company’s accepted domain language.

## How the Application Works

Explain the company’s implementation rather than generic .NET concepts.

Potential pages:

- System Overview
- Repository and Project Map
- Following a Request End to End
- Authentication and Permissions
- Data Model Overview
- Background Jobs
- External Integrations
- Configuration and Feature Flags
- Logging and Observability
- Deployment Environments
- Following One Feature Through the Codebase

A possible request-flow diagram to verify against the real application:

```text
Blazor
  → ASP.NET Core endpoint
  → MediatR
  → command or query handler
  → specification or repository
  → database
  → Result
  → HTTP response
```

This is only an example. Document the flow found in the actual codebase instead of assuming the application uses every step.

## Legacy to 2.0

The acquisition, legacy-system sunset, and upcoming 2.0 release create an opportunity to preserve important knowledge without fully documenting software that is going away.

Potential pages:

- Transition Overview
- Legacy System Overview
- 2.0 System Overview
- Feature Mapping
- Important Behavior Differences
- Data Migration
- Integration Migration
- Compatibility Requirements
- Known Gaps
- Deprecated Features
- Sunset Timeline and Responsibilities

Focus legacy documentation on operating the system safely, preserving required behavior, and supporting migration.

Possible page labels:

- Legacy
- 2.0
- Both
- Draft
- Verified
- Deprecated

Changing system documentation should eventually include an owner and a last-verified date.

## Runbooks

Short, task-oriented operational guides.

Potential pages:

- Troubleshoot Local Startup
- Reset or Seed a Database
- Diagnose a Failed Request
- Investigate a Background Job
- Handle an Integration Failure
- Perform a Release
- Roll Back a Deployment
- Respond to a Common Incident

## Existing documentation first

Before adding company-specific content:

1. Inventory existing READMEs, wikis, Confluence pages, diagrams, ADRs, and runbooks.
2. Link to an existing authoritative source when it is accurate and maintained.
3. Replace or migrate existing documentation only with team agreement.
4. Identify an owner for company-specific pages.
5. Mark uncertain content as draft until someone familiar with the system verifies it.

## Potential Starlight plugins

Add plugins only when the content creates a real need for them.

### Near-term candidates

- [`starlight-links-validator`](https://github.com/HiDeoo/starlight-links-validator) — validate internal links during builds.
- [`astro-mermaid`](https://github.com/joesaby/astro-mermaid) or [`astro-d2`](https://github.com/HiDeoo/astro-d2) — keep architecture and request-flow diagrams in source control.
- [`starlight-image-zoom`](https://github.com/HiDeoo/starlight-image-zoom) — make large diagrams and screenshots easier to inspect.

### Consider as the site grows

- [`starlight-sidebar-topics`](https://github.com/HiDeoo/starlight-sidebar-topics) — separate areas such as Learn the Stack, Onboarding, and System Guide into focused navigation.
- [`starlight-openapi`](https://github.com/HiDeoo/starlight-openapi) — generate internal API documentation from a stable OpenAPI specification.
- [`starlight-versions`](https://github.com/HiDeoo/starlight-versions) — maintain parallel documentation versions only if Legacy and 2.0 genuinely need them. Separate transition pages may be simpler.

Suggested first additions are link validation and one diagram integration. Avoid installing plugins only for visual novelty.

## Internal hosting considerations

Before proposing the site as an official internal resource, confirm:

- Repository and content ownership
- Private access and authentication
- The company’s preferred hosting platform
- Who can review and approve changes
- Whether an official documentation platform already exists
- How developers will contribute updates
- How stale content will be identified
- Rules for customer data, regulated information, secrets, and operational details

The site should never contain credentials, customer data, or sensitive information that has not been approved for the selected audience.

## Suggested progression

1. Finish enough of the current technical field guide to prove the format.
2. Inventory the company’s existing documentation.
3. Draft a small Developer Onboarding section based on the real setup experience.
4. Document one verified end-to-end application flow.
5. Add a lightweight Legacy-to-2.0 transition hub if the team finds it useful.
6. Discuss ownership and internal hosting before expanding further.
