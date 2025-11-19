# n8n-nodes-zoho-desk

This is an n8n community node for integrating with [Zoho Desk](https://www.zoho.com/desk/) API. It allows you to create and update support tickets in your Zoho Desk account.

## Features

- **Create Tickets**: Create new support tickets with all available fields
- **Update Tickets**: Update existing tickets with any field modifications
- **OAuth2 Authentication**: Secure OAuth2 authentication with support for all Zoho data centers

## Installation

### Community Node (Recommended)

1. Go to **Settings** > **Community Nodes**
2. Search for `n8n-nodes-zoho-desk`
3. Click **Install**

### Manual Installation

```bash
# In your n8n root directory
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

## Node Reference

### Operations

#### Create Ticket

Creates a new support ticket in Zoho Desk.

**Required Fields:**
- **Department ID**: The department to assign the ticket to
- **Contact ID**: The contact who is raising the ticket
- **Subject**: The ticket subject

**Optional Fields:**
- Account ID
- Assignee ID
- Category
- Channel (Email, Phone, Chat, etc.)
- Classification
- Description
- Due Date
- Email
- Language
- Phone
- Priority (Low, Medium, High)
- Product ID
- Resolution
- Status
- Sub Category
- Tags (comma-separated)
- Team ID

#### Update Ticket

Updates an existing support ticket.

**Required Fields:**
- **Ticket ID**: The ID of the ticket to update

**Update Fields:**
All fields from create operation are available for update.

## Example Workflows

### Basic Ticket Creation

```json
{
  "nodes": [
    {
      "parameters": {
        "resource": "ticket",
        "operation": "create",
        "departmentId": "123456789",
        "contactId": "987654321",
        "subject": "Issue with product",
        "additionalFields": {
          "description": "Customer is experiencing issues with the product",
          "priority": "High",
          "status": "Open"
        }
      },
      "name": "Zoho Desk",
      "type": "n8n-nodes-zoho-desk.zohoDesk",
      "position": [250, 300]
    }
  ]
}
```

### Update Ticket Status

```json
{
  "nodes": [
    {
      "parameters": {
        "resource": "ticket",
        "operation": "update",
        "ticketId": "123456789",
        "updateFields": {
          "status": "In Progress",
          "assigneeId": "456789123"
        }
      },
      "name": "Zoho Desk",
      "type": "n8n-nodes-zoho-desk.zohoDesk",
      "position": [250, 300]
    }
  ]
}
```

## API Rate Limits

Zoho Desk API has the following rate limits:
- 10 requests per second per org
- 5000 API calls per day

The node handles rate limiting automatically and will retry requests when necessary.

## Supported Zoho Data Centers

- zoho.com (US)
- zoho.eu (EU)
- zoho.in (India)
- zoho.com.cn (China)
- zoho.com.au (Australia)
- zoho.jp (Japan)

## Error Handling

The node includes comprehensive error handling:
- Invalid credentials
- Rate limiting
- Invalid field values
- Network errors
- API errors with detailed messages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-nodes-zoho-desk.git

# Install dependencies
pnpm install

# Build the node
pnpm build

# Run in development mode
pnpm dev
```

### Testing

```bash
# Run tests
pnpm test

# Run linter
pnpm lint
```

### Publishing to npm

Before publishing, ensure you're logged into npm with appropriate permissions:

```bash
# Login to npm (one-time setup)
npm login

# Publish with patch version bump (0.1.3 → 0.1.4)
npm run publish:patch

# Publish with minor version bump (0.1.3 → 0.2.0)
npm run publish:minor

# Publish with major version bump (0.1.3 → 1.0.0)
npm run publish:major
```

**Manual publishing process:**

```bash
# 1. Update version (choose one)
npm run version:patch  # For bug fixes
npm run version:minor  # For new features
npm run version:major  # For breaking changes

# 2. Publish to npm
npm publish
```

**Note:** The `prepublishOnly` script automatically runs the build before publishing, ensuring the latest code is included.

## License

MIT

## Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/yourusername/n8n-nodes-zoho-desk/issues) page
2. Create a new issue if your problem isn't already listed
3. Contact the maintainer

## Changelog

### 0.1.0
- Initial release
- Support for creating and updating tickets
- OAuth2 authentication
- Support for all Zoho data centers

## Resources

- [Zoho Desk API Documentation](https://desk.zoho.com/DeskAPIDocument)
- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
