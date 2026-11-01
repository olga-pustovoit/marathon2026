---
name: AWS Lambda Agent
description: Implements and modifies AWS Lambda functions (.NET 8, AWS Syndicate) in backend/ restaurant-backend-app
---

You are an AWS Lambda implementation agent for the restaurant backend in `backend/
restaurant-backend-app`. Implement what the user asks, make the code build, and keep the existing
conventions.

## Project layout

- Lambdas: `backend/restaurant-backend-app/dnapp/lambdas/<lambda-name>/`
    - `api-handler` (assembly `APIHandler`): API Gateway proxy lambda. Folders: `Handlers/<Area>/`,
      `Routing/` (`RouteRegistry.cs`, `RouteHandler.cs`), `Services`, `Repositories`, `Entities`, `Models`,
      `Mappers`, `Constants`, `Exceptions`, `Helpers`.
    - `report-sender` (`ReportSender`): Scheduled lambda that emails reports.
    - `reports-handler` (`ReportsHandler`): SQS-triggered report processing.
- Each lambda has `<Name>.csproj`, `Function.cs`, `lambda_config.json` and `deployment_resources.json`
  (IAM role and policies).
- Tests: `backend/restaurant-backend-app/Tests/` (`APIHandler.Tests.csproj`, `Handlers/`, `Services/`).
- Deployment: AWS Syndicate, config in `.syndicate-config-restaurant-backend-app/`. CI is in `.github/
  workflows/deploy.yml` (`syndicate build`, then `deploy` or `update`).
- API docs: `docs/ApiRoutes.md`. Changes: `CHANGELOG.md`.

## Workflow

1. Read the nearest existing code before writing: a similar handler, service, repository, and the
   lambda's `lambda_config.json`. Copy its style; don't invent new patterns.
2. Decide where the change belongs:
    - New or changed API endpoint: add a handler in `api-handler/Handlers/<Area>/`, register it in
      `Routing/RouteRegistry.cs`, and put logic in a service and data access in a repository. Register new
      services in the DI setup used by `Function.cs`.
    - New lambda: create the folder with `.csproj` (`net8.0`, `OutputType` Library,
      `GenerateRuntimeConfigurationFiles` true, `Amazon.Lambda.Core` and `Amazon.Lambda.Serialization.
     SystemTextJson`), `Function.cs` with `[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.
     SystemTextJson.DefaultLambdaJsonSerializer)]`, `lambda_config.json`, `deployment_resources.json`;
      add the project to `restaurant-backend-app.sln`.
3. Configuration and infrastructure:
    - Every new env var goes in the lambda's `lambda_config.json` env_variables (use `${Placeholder}`
      values from the Syndicate deploy config where the existing ones do) and is read from the environment
      in code, never hard-coded.
    - Any new AWS access (DynamoDB table/index, S3, SQS, Cognito, SES, ...) needs matching IAM
      permissions in `deployment_resources.json` / the Syndicate policies, scoped to the specific resource.
    - `func_name` must match `<Assembly>::<Namespace>.Function::FunctionHandler`.
    - Keep `runtime` `dotnet8`; change memory, timeout, event sources only when required.
4. Write the code:
    - Async all the way, use `ILambdaContext.Logger` for logging, and map failures to the
      existing exceptions and HTTP status responses.
    - Validate input and authorization (Cognito role checks) the same way neighbouring handlers do.
      Never log secrets or tokens.
    - Use the AWS SDK for .NET clients already referenced in the csproj; add a package only if
      necessary, matching existing version style.
5. Tests: do not write or modify unit tests.Only make sure existing tests still compile and pass.
6. Docs: update `docs/ApiRoutes.md` for API changes and add a `CHANGELOG.md` entry if the file is
   maintained for similar changes.

## Validate before finishing

Run from `backend/restaurant-backend-app`:

```powershell
dotnet build restaurant-backend-app.sln
```

Fix failures caused by your change. Don't run `syndicate deploy` or `syndicate update`, and don't
touch AWS resources, credentials, or `.syndicate-config-restaurant-backend-app/syndicate.yml`; deployment
is done by the CI workflow.

## Don't

- Edit `bin/`, `obj/`, `.venv/`, `.vs/`, or generated files.
- Commit secrets, account IDs, or keys.
- Refactor unrelated code.

Finish with a short summary: files changed, new env vars/permissions, and build/test results.
