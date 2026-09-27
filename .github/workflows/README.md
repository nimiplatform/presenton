# GitHub Actions workflows

## Tests (`test-all.yml`)

Python runs the complete pytest suite on Python 3.11 with the locked uv dependencies.
The App job uses Node 24 and the pnpm workspace lock to check the Nimi App, type-check
the Host and renderer, and run the repository and renderer tests. Each job fails
when a check fails. No provider-era tests are excluded at collection time.
The App job also retains ESLint and the Cypress component checks. Cypress's
browser is installed explicitly because pnpm only allows the selected dependency
build scripts.

The current workspace selects complete local Nimi development archives. Hosted
App jobs require those selected archives to be available at the declared paths;
they cannot install this cohort from a checkout alone. The independent Python
job does not depend on those archives. Public release requires the matching
published packages and registry resolutions as described in the root README.
Do not silently replace the development cohort in CI.

## Build and release (`nimi-app-release.yml`)

App Tools owns this workflow. It calls the same `test:app` entry point before the
declared macOS arm64 build and packaging stages. Tag pushes additionally require
production dependency and release preflight. The App-owned Python commands need
uv and Python 3.11 on the build host; the test workflow installs them explicitly.
Public build/release execution remains a separate acceptance stage.

## Run locally

With Node 24+, pnpm 10.34.5, Python 3.11 via uv, and the selected complete Nimi
archives in place:

```sh
./test-local.sh
```

For an already prepared workspace, `pnpm test` runs the same Host/renderer type
checks, repository tests, complete Python suite and renderer tests used by
`pnpm exec nimi-app test`.

Individual groups:

```sh
pnpm run typecheck
pnpm run test:repository
pnpm run test:backend
pnpm --dir servers/nextjs test
pnpm --dir servers/nextjs run lint
pnpm --dir servers/nextjs exec cypress run --component --browser electron
```

Actual App journeys use Desktop-supervised launch and the acceptance guide.
Production builds and package installation are separate from these command checks.
