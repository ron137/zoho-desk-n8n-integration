# n8n-nodes-zoho-desk

Production-ready n8n community node for integrating with [Zoho Desk](https://www.zoho.com/desk/) API. Create and manage support tickets with comprehensive field support, dynamic resource loading, and automatic contact creation.

## Features

- **Dynamic Department & Team Selection**: Dropdown lists automatically fetched from your Zoho Desk account
- **Automatic Contact Creation**: Provide email/name and contacts are auto-created or matched
- **Comprehensive Field Support**: All ticket fields including custom fields, priority, due dates, and more
- **OAuth2 Authentication**: Secure authentication with support for all Zoho data centers
- **Type-Safe & Validated**: Full TypeScript implementation with input validation
- **Production-Ready**: Comprehensive error handling and user-friendly messages

## Installation

### Community Node (Recommended)

1. Go to **Settings** > **Community Nodes** in n8n
2. Search for `@enthu/n8n-nodes-zoho-desk`
3. Click **Install**

### Manual Installation

```bash
npm install @enthu/n8n-nodes-zoho-desk
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

### Create Ticket

Creates a new support ticket with automatic contact creation/matching.

**Required Fields:**
- **Department**: Select from dropdown (auto-populated)
- **Subject**: Ticket subject line

**Contact** (optional but recommended):
- **Email** OR **Last Name** (at least one required if providing contact)
- First Name, Phone, Mobile (optional)
- If email exists, existing contact is used; otherwise new contact is created

**Optional Fields:**
- **Description**: Detailed ticket description
- **Due Date**: Resolution deadline
- **Priority**: Low, Medium, or High
- **Team**: Select from department's teams (dropdown)
- **Secondary Contacts**: Comma-separated contact IDs (e.g., `123456, 789012`)
- **Custom Fields**: JSON object (e.g., `{"cf_modelname": "F3 2017", "cf_phone": "123456"}`)
- Account ID, Assignee ID, Category, Channel, Classification, Email, Language, Phone, Product ID, Resolution, Status, Sub Category, Tags

### Update Ticket

Updates an existing support ticket.

**Required Fields:**
- **Ticket ID**: Numeric ticket ID to update

**Update Fields** (all optional):
All fields from create operation can be updated

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
  "secondaryContacts": "1892000000042038, 1892000000042042",
  "teamId": "8920000000069071",
  "cf": {
    "cf_modelname": "F3 2017",
    "cf_severitypercentage": "85.0"
  }
}
```

### Update Ticket Status

```json
{
  "ticketId": "1892000000042034",
  "priority": "High",
  "status": "In Progress",
  "description": "Updated with resolution details",
  "assigneeId": "456789123"
}
```

## Field Details

### Contact Object

The contact object allows automatic contact creation or matching:

- If **email** exists in Zoho Desk → Uses existing contact
- If **email** doesn't exist → Creates new contact with provided details
- **Validation**: Either email OR lastName must be provided

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

Empty values are automatically filtered.

### Tags

Comma-separated list of tags:

```
"tags": "urgent, customer-service, billing, escalated"
```

## Validation & Error Handling

The node includes comprehensive validation:

- ✅ **Contact Validation**: Ensures either email or lastName is provided
- ✅ **Ticket ID Validation**: Validates ticket IDs are numeric
- ✅ **JSON Validation**: Safe parsing of custom fields with detailed error messages
- ✅ **Empty String Filtering**: Automatically filters empty values from arrays
- ✅ **Clear Error Messages**: User-friendly error messages with actionable guidance

## API Rate Limits

Zoho Desk API has the following rate limits:
- 10 requests per second per organization
- 5000 API calls per day

**Rate Limit Handling**: The node detects when rate limits are exceeded (HTTP 429 errors) and provides clear, actionable error messages. If you encounter rate limit errors, you can:
- Reduce the number of items being processed in a single workflow execution
- Add delays between workflow runs
- Use the "Continue On Fail" setting to handle rate limit errors gracefully

## Supported Zoho Data Centers

- zoho.com (US)
- zoho.eu (EU)
- zoho.in (India)
- zoho.com.cn (China)
- zoho.com.au (Australia)
- zoho.jp (Japan)

## Technical Details

### TypeScript Type Safety

The node is fully type-safe with TypeScript interfaces:
- `ZohoDeskDepartment` - Department structure
- `ZohoDeskTeam` - Team structure
- `ZohoDeskListResponse<T>` - API response wrapper

### Caching

n8n automatically caches dropdown options (departments, teams) after initial load. Data is refreshed when:
- The node is reopened
- User manually refreshes the dropdown
- Parent parameter changes (e.g., changing department reloads teams)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/EnthuZiastic/n8n-nodes-zoho-desk.git

# Install dependencies
npm install

# Build the node
npm run build

# Run in development mode
npm run dev
```

### Publishing to npm

```bash
# Login to npm (one-time setup)
npm login

# Publish with version bump
npm run publish:minor  # For new features (0.2.0 → 0.3.0)
npm run publish:patch  # For bug fixes (0.2.0 → 0.2.1)
npm run publish:major  # For breaking changes (0.2.0 → 1.0.0)
```

## License

MIT

## Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/EnthuZiastic/n8n-nodes-zoho-desk/issues) page
2. Create a new issue if your problem isn't already listed
3. Contact the maintainer

## Changelog

### 0.2.0 - Production Release
- Dynamic department and team dropdowns
- Automatic contact creation/matching
- Comprehensive field support (description, dueDate, priority, secondaryContacts, custom fields)
- Full TypeScript type safety
- Input validation and error handling
- JSDoc documentation throughout
- Optimized performance

## Resources

- [Zoho Desk API Documentation](https://desk.zoho.com/DeskAPIDocument)
- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
