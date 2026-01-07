/**
 * Integration tests for Zoho Desk n8n node
 * These tests make real API calls to validate the node's behavior
 *
 * Prerequisites:
 * - .env.test file with valid Zoho Desk credentials
 * - Run with: npm run test:integration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

const BASE_URL = `https://desk.zoho.${process.env.ZOHO_DESK_DATACENTER || 'com'}/api/v1`;

interface ZohoRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  body?: Record<string, unknown>;
  qs?: Record<string, string | number>;
}

/**
 * Helper to make authenticated Zoho Desk API requests
 */
async function zohoRequest<T>(options: ZohoRequestOptions): Promise<T> {
  const { method, endpoint, body, qs } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (qs) {
    const params = new URLSearchParams();
    Object.entries(qs).forEach(([key, value]) => params.append(key, String(value)));
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ZOHO_DESK_ACCESS_TOKEN}`,
      orgId: process.env.ZOHO_DESK_ORG_ID || '',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho API Error ${response.status}: ${errorText}`);
  }

  // Handle empty responses (e.g., DELETE)
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

/**
 * Helper to refresh access token if needed
 */
async function refreshAccessToken(): Promise<string> {
  const response = await fetch(
    `https://accounts.zoho.${process.env.ZOHO_DESK_DATACENTER || 'com'}/oauth/v2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: process.env.ZOHO_DESK_REFRESH_TOKEN || '',
        client_id: process.env.ZOHO_DESK_CLIENT_ID || '',
        client_secret: process.env.ZOHO_DESK_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string };
  process.env.ZOHO_DESK_ACCESS_TOKEN = data.access_token;
  return data.access_token;
}

// Test data interfaces
interface ZohoTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  departmentId: string;
  status: string;
  priority?: string;
  isArchived?: boolean;
}

interface ZohoContact {
  id: string;
  lastName: string;
  email: string;
  firstName?: string;
}

interface ZohoAccount {
  id: string;
  accountName: string;
  website?: string;
}

interface ZohoComment {
  id: string;
  content: string;
  isPublic: boolean;
}

interface ZohoListResponse<T> {
  data: T[];
}

// Store created resources for cleanup
let createdTicketId: string | null = null;
let createdContactId: string | null = null;
let createdAccountId: string | null = null;
let testDepartmentId: string | null = null;

describe('Zoho Desk API Integration Tests', () => {
  // Refresh token before all tests
  beforeAll(async () => {
    try {
      await refreshAccessToken();
      console.log('Access token refreshed successfully');
    } catch (error) {
      console.warn('Could not refresh token, using existing token:', error);
    }

    // Get a department ID for ticket creation
    const depts = await zohoRequest<ZohoListResponse<{ id: string; name: string }>>({
      method: 'GET',
      endpoint: '/departments',
      qs: { limit: 1 },
    });
    if (depts.data && depts.data.length > 0) {
      testDepartmentId = depts.data[0].id;
      console.log(`Using department: ${depts.data[0].name} (${testDepartmentId})`);
    }
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up created resources
    if (createdTicketId) {
      try {
        await zohoRequest({
          method: 'DELETE',
          endpoint: `/tickets/${createdTicketId}`,
        });
        console.log(`Cleaned up ticket: ${createdTicketId}`);
      } catch (e) {
        console.warn(`Failed to clean up ticket: ${createdTicketId}`);
      }
    }

    if (createdContactId) {
      try {
        await zohoRequest({
          method: 'POST',
          endpoint: '/contacts/moveToTrash',
          body: { contactIds: [createdContactId] },
        });
        console.log(`Cleaned up contact: ${createdContactId}`);
      } catch (e) {
        console.warn(`Failed to clean up contact: ${createdContactId}`);
      }
    }

    if (createdAccountId) {
      try {
        await zohoRequest({
          method: 'POST',
          endpoint: '/accounts/moveToTrash',
          body: { accountIds: [createdAccountId] },
        });
        console.log(`Cleaned up account: ${createdAccountId}`);
      } catch (e) {
        console.warn(`Failed to clean up account: ${createdAccountId}`);
      }
    }
  });

  // ==================== TICKET TESTS ====================
  describe('Ticket Operations', () => {
    it('should create a ticket', async () => {
      expect(testDepartmentId).toBeTruthy();

      const ticket = await zohoRequest<ZohoTicket>({
        method: 'POST',
        endpoint: '/tickets',
        body: {
          subject: `Test Ticket ${Date.now()}`,
          departmentId: testDepartmentId,
          description: 'This is an automated test ticket',
          priority: 'Medium',
          classification: 'Question',
          contact: {
            email: `test-${Date.now()}@example.com`,
            lastName: 'TestUser',
          },
        },
      });

      expect(ticket).toBeDefined();
      expect(ticket.id).toBeDefined();
      expect(ticket.ticketNumber).toBeDefined();
      expect(ticket.subject).toContain('Test Ticket');

      createdTicketId = ticket.id;
      console.log(`Created ticket: ${ticket.ticketNumber} (${ticket.id})`);
    });

    it('should get a ticket by ID', async () => {
      expect(createdTicketId).toBeTruthy();

      const ticket = await zohoRequest<ZohoTicket>({
        method: 'GET',
        endpoint: `/tickets/${createdTicketId}`,
      });

      expect(ticket).toBeDefined();
      expect(ticket.id).toBe(createdTicketId);
      expect(ticket.subject).toContain('Test Ticket');
    });

    it('should list tickets', async () => {
      const response = await zohoRequest<ZohoListResponse<ZohoTicket>>({
        method: 'GET',
        endpoint: '/tickets',
        qs: { limit: 10 },
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should list archived tickets', async () => {
      expect(testDepartmentId).toBeTruthy();

      const response = await zohoRequest<ZohoListResponse<ZohoTicket>>({
        method: 'GET',
        endpoint: '/tickets/archivedTickets',
        qs: { limit: 10, departmentId: testDepartmentId },
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      // Archived tickets should have isArchived: true (if any exist)
      if (response.data.length > 0) {
        expect(response.data[0].isArchived).toBe(true);
      }
    });

    it('should update a ticket', async () => {
      expect(createdTicketId).toBeTruthy();

      const updatedSubject = `Updated Test Ticket ${Date.now()}`;
      const ticket = await zohoRequest<ZohoTicket>({
        method: 'PATCH',
        endpoint: `/tickets/${createdTicketId}`,
        body: {
          subject: updatedSubject,
          priority: 'High',
        },
      });

      expect(ticket).toBeDefined();
      expect(ticket.subject).toBe(updatedSubject);
    });

    it('should add a comment to a ticket', async () => {
      expect(createdTicketId).toBeTruthy();

      const comment = await zohoRequest<ZohoComment>({
        method: 'POST',
        endpoint: `/tickets/${createdTicketId}/comments`,
        body: {
          content: `Test comment ${Date.now()}`,
          isPublic: false,
        },
      });

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(comment.content).toContain('Test comment');
    });

    it('should list ticket threads/conversations', async () => {
      expect(createdTicketId).toBeTruthy();

      const response = await zohoRequest<ZohoListResponse<unknown>>({
        method: 'GET',
        endpoint: `/tickets/${createdTicketId}/conversations`,
        qs: { limit: 10 },
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    // Delete test runs last for tickets
    it('should delete a ticket (move to trash)', async () => {
      expect(createdTicketId).toBeTruthy();

      await zohoRequest({
        method: 'POST',
        endpoint: '/tickets/moveToTrash',
        body: { ticketIds: [createdTicketId] },
      });

      createdTicketId = null; // Clear so afterAll doesn't try to delete again
    });
  });

  // ==================== CONTACT TESTS ====================
  describe('Contact Operations', () => {
    it('should create a contact', async () => {
      const contact = await zohoRequest<ZohoContact>({
        method: 'POST',
        endpoint: '/contacts',
        body: {
          lastName: `TestContact-${Date.now()}`,
          email: `testcontact-${Date.now()}@example.com`,
          firstName: 'Integration',
        },
      });

      expect(contact).toBeDefined();
      expect(contact.id).toBeDefined();
      expect(contact.lastName).toContain('TestContact');
      expect(contact.email).toContain('@example.com');

      createdContactId = contact.id;
      console.log(`Created contact: ${contact.lastName} (${contact.id})`);
    });

    it('should get a contact by ID', async () => {
      expect(createdContactId).toBeTruthy();

      const contact = await zohoRequest<ZohoContact>({
        method: 'GET',
        endpoint: `/contacts/${createdContactId}`,
      });

      expect(contact).toBeDefined();
      expect(contact.id).toBe(createdContactId);
    });

    it('should list contacts', async () => {
      const response = await zohoRequest<ZohoListResponse<ZohoContact>>({
        method: 'GET',
        endpoint: '/contacts',
        qs: { limit: 10 },
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should update a contact', async () => {
      expect(createdContactId).toBeTruthy();

      const updatedFirstName = `Updated-${Date.now()}`;
      const contact = await zohoRequest<ZohoContact>({
        method: 'PATCH',
        endpoint: `/contacts/${createdContactId}`,
        body: {
          firstName: updatedFirstName,
        },
      });

      expect(contact).toBeDefined();
      expect(contact.firstName).toBe(updatedFirstName);
    });

    it('should delete a contact (move to trash)', async () => {
      expect(createdContactId).toBeTruthy();

      await zohoRequest({
        method: 'POST',
        endpoint: '/contacts/moveToTrash',
        body: { contactIds: [createdContactId] },
      });

      createdContactId = null; // Clear so afterAll doesn't try to delete again
    });
  });

  // ==================== ACCOUNT TESTS ====================
  describe('Account Operations', () => {
    it('should create an account', async () => {
      const account = await zohoRequest<ZohoAccount>({
        method: 'POST',
        endpoint: '/accounts',
        body: {
          accountName: `TestAccount-${Date.now()}`,
          website: 'https://test-integration.example.com',
        },
      });

      expect(account).toBeDefined();
      expect(account.id).toBeDefined();
      expect(account.accountName).toContain('TestAccount');

      createdAccountId = account.id;
      console.log(`Created account: ${account.accountName} (${account.id})`);
    });

    it('should get an account by ID', async () => {
      expect(createdAccountId).toBeTruthy();

      const account = await zohoRequest<ZohoAccount>({
        method: 'GET',
        endpoint: `/accounts/${createdAccountId}`,
      });

      expect(account).toBeDefined();
      expect(account.id).toBe(createdAccountId);
    });

    it('should list accounts', async () => {
      const response = await zohoRequest<ZohoListResponse<ZohoAccount>>({
        method: 'GET',
        endpoint: '/accounts',
        qs: { limit: 10 },
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should update an account', async () => {
      expect(createdAccountId).toBeTruthy();

      const updatedName = `Updated-TestAccount-${Date.now()}`;
      const account = await zohoRequest<ZohoAccount>({
        method: 'PATCH',
        endpoint: `/accounts/${createdAccountId}`,
        body: {
          accountName: updatedName,
        },
      });

      expect(account).toBeDefined();
      expect(account.accountName).toBe(updatedName);
    });

    it('should delete an account (move to trash)', async () => {
      expect(createdAccountId).toBeTruthy();

      await zohoRequest({
        method: 'POST',
        endpoint: '/accounts/moveToTrash',
        body: { accountIds: [createdAccountId] },
      });

      createdAccountId = null; // Clear so afterAll doesn't try to delete again
    });
  });
});
