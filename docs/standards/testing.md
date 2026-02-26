# Copilot Software Testing Instructions

## General Testing Instructions

- Before running any tests, Copilot MUST ensure it is using the correct node version, via `nvm use 22.16.0`
- When running a test, Copilot MUST ensure its current working directory is the root of the project

## Running Targeted Tests

- When running tests against specific files, Copilot MUST use the following command from the root directory, where `target` is the name of the test file, without an extension: `pnpm test:ci <target>`
