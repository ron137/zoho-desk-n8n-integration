# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an n8n community node package that integrates with the Zoho Desk API. It provides ticket creation and update operations through OAuth2 authentication.

## Development Commands

### Build and Development
```bash
npm run build         # Compile TypeScript to dist/
npm run dev          # Watch mode for development
npm run prepublishOnly # Pre-publish build (runs automatically)
```

### Code Quality
```bash
npm run lint         # ESLint check on nodes/ and credentials/
npm run format       # Prettier formatting for nodes/ and credentials/
```

### Publishing
```bash
# Version management
npm run version:patch  # Bump patch version (0.1.3 → 0.1.4)
npm run version:minor  # Bump minor version (0.1.3 → 0.2.0)
npm run version:major  # Bump major version (0.1.3 → 1.0.0)

# Publish to npm (version bump + publish in one command)
npm run publish:patch  # Bump patch and publish
npm run publish:minor  # Bump minor and publish
npm run publish:major  # Bump major and publish

# Manual publish
npm publish           # Publish current version (after version bump)
```

**Important**: `prepublishOnly` hook automatically runs `npm run build` before publishing, ensuring compiled code is up to date.

### Build System
The project uses both TypeScript compiler and Gulp:
- `tsc` compiles TypeScript files from `nodes/` and `credentials/` to `dist/`
- `gulp` (via gulpfile.js) copies SVG icon files from `nodes/` to `dist/nodes/`

## Architecture

### n8n Node Structure
This package follows n8n's community node architecture:

**Main Node** (`nodes/ZohoDesk/ZohoDesk.node.ts`):
- Implements `INodeType` interface from n8n-workflow
- `description` property defines the UI schema (parameters, options, display logic)
- `execute()` method handles API calls and data transformation
- Uses `this.helpers.requestOAuth2.call()` for authenticated Zoho Desk API requests
- Processes input items in a loop, building API request bodies from node parameters

**OAuth2 Credentials** (`credentials/ZohoDeskOAuth2Api.credentials.ts`):
- Implements `ICredentialType` interface, extends `oAuth2Api`
- Multi-datacenter support: dynamically builds auth/token URLs based on selected datacenter (com, eu, in, com.cn, com.au, jp)
- Uses n8n expression syntax (`={{$self["datacenter"]}}`) for dynamic URL construction
- Includes credential test request to validate setup
- Requires Organization ID header (`orgId`) for all API requests

### Key Architectural Patterns

**Dynamic URL Construction**: The credentials system uses n8n expressions to build datacenter-specific URLs:
- Authorization: `https://accounts.zoho.{{$self["datacenter"]}}/oauth/v2/auth`
- Access Token: `https://accounts.zoho.{{$self["datacenter"]}}/oauth/v2/token`
- Base API: `https://desk.zoho.{{$self["datacenter"]}}/api/v1`

**Field Mapping**: The node uses two separate field collections:
- `additionalFields` for create operation (departmentId, contactId, subject are required)
- `updateFields` for update operation (ticketId is required)

Both operations support the same optional fields but with different parameter structures.

**OAuth2 Integration**: All API requests use `this.helpers.requestOAuth2.call(this, 'zohoDeskOAuth2Api', options)` which:
- Automatically handles OAuth2 token refresh
- Adds Bearer token to Authorization header
- Requires `orgId` in request headers (passed separately)

## Zoho Desk API Specifics

**Base URL**: Retrieved from credentials (`credentials.baseUrl`) or defaults to `https://desk.zoho.com/api/v1`

**Required Headers**:
- `Authorization: Bearer {token}` (handled by OAuth2 helper)
- `orgId: {organizationId}` (must be included in every request)

**Endpoints**:
- POST `/tickets` - Create ticket
- PATCH `/tickets/{ticketId}` - Update ticket

**Tag Handling**: Tags are comma-separated strings in the UI but sent as arrays to the API (split and trimmed in execution)

## Important Conventions

**Package Configuration** (package.json):
- Published files are limited to `dist/` directory only
- Entry points defined in `n8n` field for credentials and nodes
- Scoped package: `@enthu/n8n-nodes-zoho-desk`
- Requires Node.js >=18.10

**TypeScript Configuration**:
- Source files in `credentials/` and `nodes/` directories
- Output to `dist/` with declaration files and source maps
- Uses CommonJS module format for n8n compatibility
- Target ES2020

**Error Handling**: The execute method uses `continueOnFail()` to determine whether to throw errors or return error objects, allowing workflows to continue on failure if configured.

## Adding New Operations

When adding new Zoho Desk operations:
1. Add operation option to the `operation` parameter options array
2. Add operation-specific parameters with `displayOptions.show` conditions
3. Implement the operation logic in the `execute()` method's resource/operation conditional blocks
4. Use `this.helpers.requestOAuth2.call()` for API requests with `orgId` header
5. Return data in `returnData` array with `pairedItem` reference for proper data flow

## Testing Credentials

The credential test (`credentials/ZohoDeskOAuth2Api.credentials.ts:101-109`) makes a simple GET request to `/tickets?limit=1` to validate:
- OAuth2 token is valid
- Organization ID is correct
- API access is working
