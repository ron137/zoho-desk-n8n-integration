# n8n-nodes-zoho-desk

Production-ready n8n community node for integrating with [Zoho Desk](https://www.zoho.com/desk/) API. Manage support tickets, contacts, and accounts with comprehensive field support, dynamic resource loading, and automatic contact creation.

[![npm version](https://badge.fury.io/js/n8n-nodes-zoho-desk.svg)](https://www.npmjs.com/package/n8n-nodes-zoho-desk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Full CRUD Operations**: Create, Read, Update, Delete for Tickets, Contacts, and Accounts
- **Dynamic Dropdowns**: Department & Team selection auto-populated from your Zoho Desk account
- **Automatic Contact Creation**: Provide email/name and contacts are auto-created or matched
- **Pagination Support**: "Return All" toggle to fetch all records automatically
- **Comprehensive Field Support**: All fields including custom fields, priority, due dates, and more
- **OAuth2 Authentication**: Secure authentication with support for all Zoho data centers
- **Type-Safe & Validated**: Full TypeScript implementation with input validation
- **Fully Tested**: 17 integration tests covering all operations

## Supported Operations

| Resource | Operations |
|----------|------------|
| **Ticket** | Create, Get, List, Update, Delete, Add Comment, List Threads |
| **Contact** | Create, Get, List, Update, Delete |
| **Account** | Create, Get, List, Update, Delete |

## Installation

### Community Node (Recommended)

1. Go to **Settings** > **Community Nodes** in n8n
2. Search for `n8n-nodes-zoho-desk`
3. Click **Install**

### Manual Installation

```bash
npm install n8n-nodes-zoho-desk
```

## Setup

### 1. Create Zoho Desk OAuth2 Client

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Click on "Add Client"
3. Choose "Server-based Applications"
4. Enter the following details:
   - **Client Name**: n8n Integration
   - **Homepage URL**: Your n8n instance URL
   - **Authorized Redirect URIs**: `https://your-n8n-instance.com/rest/oauth2-credential/callback`
5. Click "Create"
6. Note down your **Client ID** and **Client Secret**

### 2. Get Organization ID

1. Login to your Zoho Desk account
2. Go to **Setup** > **Developer Space** > **API**
3. Copy your **Organization ID**

### 3. Configure Credentials in n8n

1. In n8n, go to **Credentials** > **New**
2. Select **Zoho Desk OAuth2 API**
3. Enter:
   - **Client ID**: From step 1
   - **Client Secret**: From step 1
   - **Organization ID**: From step 2
   - **Data Center**: Select your Zoho data center
4. Click **Connect** and authorize the application

## Operations

### Ticket Operations

#### Create Ticket

Creates a new support ticket with automatic contact creation/matching.

**Required Fields:**
- **Department**: Select from dropdown (auto-populated)
- **Subject**: Ticket subject line

**Primary Fields:**
- **Priority**: Low, Medium, or High (default: Medium)
- **Classification**: Question, Problem, Request, Others (default: Question)
- **Due Date**: Resolution deadline
- **Description**: Detailed ticket description
- **Team**: Select from department's teams (dropdown)

**Contact** (optional):
- **Email** OR **Last Name** (at least one required if providing contact)
- First Name, Phone (optional)
- If email exists, existing contact is used; otherwise new contact is created

**Additional Fields:**
- Account ID, Assignee ID, Category, Channel, Custom Fields, Email, Language, Phone, Product ID, Resolution, Secondary Contacts, Status, Sub Category

#### Get Ticket

Retrieves a single ticket by ID.

#### List Tickets

Lists all tickets with optional filters.
- **Return All**: Toggle to fetch all tickets (with automatic pagination)
- **Limit**: Maximum number of results (when Return All is off)
- **Filters**: Department ID, Assignee ID, Status

#### Update Ticket

Updates an existing ticket. All fields are optional.

#### Delete Ticket

Moves a ticket to trash.

#### Add Comment

Adds a comment to a ticket.
- **Content**: Comment text
- **Is Public**: Whether visible to customers or internal only

#### List Threads

Lists all conversations/threads on a ticket.

### Contact Operations

#### Create Contact

**Required Fields:**
- **Last Name**
- **Email**

**Additional Fields:**
- First Name, Phone, Mobile, Account ID, Twitter, Facebook, Type, Description, Custom Fields

#### Get / List / Update / Delete Contact

Standard CRUD operations with pagination support for List.

### Account Operations

#### Create Account

**Required Fields:**
- **Account Name**

**Additional Fields:**
- Website, Phone, Fax, Industry, Description, Code, City, Country, State, Street, Zip, Custom Fields

#### Get / List / Update / Delete Account

Standard CRUD operations with pagination support for List.

## Usage Examples

### Create Ticket with Contact Auto-Creation

```json
{
  "departmentId": "1892000000006907",
  "subject": "Order processing delay",
  "contact": {
    "email": "carol@zylker.com",
    "lastName": "Carol",
    "firstName": "Lucas",
    "phone": "1 888 900 9646"
  },
  "description": "Customer experiencing delays in order processing",
  "dueDate": "2025-12-01T10:00:00.000Z",
  "priority": "High",
  "classification": "Problem",
  "teamId": "8920000000069071"
}
```

### Create Contact

```json
{
  "lastName": "Smith",
  "email": "john.smith@example.com",
  "firstName": "John",
  "phone": "+1-555-123-4567",
  "description": "VIP Customer"
}
```

### Create Account

```json
{
  "accountName": "Acme Corporation",
  "website": "https://acme.example.com",
  "industry": "Technology",
  "phone": "+1-555-000-0000",
  "city": "San Francisco",
  "country": "USA"
}
```

### List All Tickets with Filters

```json
{
  "returnAll": true,
  "filters": {
    "status": "Open",
    "departmentId": "1892000000006907"
  }
}
```

## Field Details

### Custom Fields (cf)

Pass custom fields as a JSON object:

```json
{
  "cf": {
    "cf_fieldname": "value",
    "cf_priority_level": "urgent",
    "cf_product_version": "2.0.1"
  }
}
```

### Secondary Contacts

Provide multiple contact IDs as comma-separated values:

```
"secondaryContacts": "1892000000042038, 1892000000042042, 1892000000042056"
```

## Validation & Error Handling

The node includes comprehensive validation:

- **Contact Validation**: Ensures either email or lastName is provided
- **ID Validation**: Validates IDs are numeric with proper length
- **JSON Validation**: Safe parsing of custom fields with detailed error messages
- **Email Validation**: RFC 5322 compliant email validation
- **Clear Error Messages**: User-friendly error messages with actionable guidance

## API Rate Limits

Zoho Desk API has the following rate limits:
- 10 requests per second per organization
- 5000 API calls per day

The node detects rate limiting (HTTP 429) and provides clear error messages.

## Supported Zoho Data Centers

- zoho.com (US)
- zoho.com.au (Australia)
- zoho.com.cn (China)
- zoho.eu (EU)
- zoho.in (India)
- zoho.jp (Japan)

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/ron137/zoho-desk-n8n-integration.git

# Install dependencies
npm install

# Build the node
npm run build

# Run in development mode
npm run dev

# Run linting
npm run lint

# Run tests
npm run test:integration
```

### Testing

The project includes comprehensive integration tests that run against the real Zoho Desk API:

```bash
# Create .env.test with your credentials
ZOHO_DESK_ACCESS_TOKEN=your_token
ZOHO_DESK_REFRESH_TOKEN=your_refresh_token
ZOHO_DESK_CLIENT_ID=your_client_id
ZOHO_DESK_CLIENT_SECRET=your_client_secret
ZOHO_DESK_ORG_ID=your_org_id
ZOHO_DESK_DATACENTER=com

# Run tests
npm run test:integration
```

## License

MIT

## Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/ron137/zoho-desk-n8n-integration/issues) page
2. Create a new issue if your problem isn't already listed

## Changelog

### 1.0.0 - Major Release
- **New Resources**: Contact and Account with full CRUD operations
- **New Ticket Operations**: Get, List, Delete, Add Comment, List Threads
- **Pagination**: "Return All" toggle with automatic page fetching
- **Integration Tests**: 17 comprehensive tests for all operations
- **Lint Compliance**: Full n8n linting rules compliance
- **Bug Fixes**: Proper error handling with NodeOperationError/ApplicationError

### Previous Versions (as @enthu/n8n-nodes-zoho-desk)
- 0.3.x - Ticket create/update operations
- 0.2.x - Dynamic dropdowns, contact auto-creation
- 0.1.x - Initial release

## Resources

- [Zoho Desk API Documentation](https://desk.zoho.com/DeskAPIDocument)
- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
- [GitHub Repository](https://github.com/ron137/zoho-desk-n8n-integration)
- [npm Package](https://www.npmjs.com/package/n8n-nodes-zoho-desk)
