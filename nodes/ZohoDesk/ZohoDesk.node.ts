import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from 'n8n-workflow';

/**
 * Zoho Desk Department response structure
 */
interface ZohoDeskDepartment {
  /** Unique identifier for the department */
  id: string;
  /** Display name of the department */
  name: string;
}

/**
 * Zoho Desk Team response structure
 */
interface ZohoDeskTeam {
  /** Unique identifier for the team */
  id: string;
  /** Display name of the team */
  name: string;
}

/**
 * Zoho Desk API list response wrapper
 */
interface ZohoDeskListResponse<T> {
  /** Array of data items returned by the API */
  data: T[];
}

/**
 * Optional fields for ticket create operation
 * Note: Some fields like 'secondaryContacts', 'cf', and 'tags'
 * are handled separately with custom parsing logic (see addCommonTicketFields function)
 * Note: 'priority', 'classification', 'dueDate', 'description', and 'tags' are primary fields for create operation
 * Note: 'teamId' is not included in create operation (only in update)
 */
const TICKET_CREATE_OPTIONAL_FIELDS = [
  'accountId',
  'assigneeId',
  'category',
  'channel',
  'email',
  'language',
  'phone',
  'productId',
  'resolution',
  'status',
  'subCategory',
] as const;

/**
 * Optional fields for ticket update operation
 * Note: Some fields like 'dueDate', 'priority', 'secondaryContacts', 'cf', and 'tags'
 * are handled separately with custom parsing logic (see addCommonTicketFields function)
 * Note: 'description' is now a primary field for update operation
 * Note: 'channel' is not updatable - it represents how the ticket was originally created
 * Note: 'classification' is now handled as an options field with "No Change" option
 */
const TICKET_UPDATE_OPTIONAL_FIELDS = [
  'accountId',
  'assigneeId',
  'category',
  'contactId',
  'departmentId',
  'email',
  'language',
  'phone',
  'productId',
  'resolution',
  'status',
  'subCategory',
  'subject',
  'teamId',
] as const;

/**
 * Minimum number of digits for a valid Zoho Desk ticket ID
 * Zoho Desk ticket IDs are typically 16-19 digits, but we allow 10+ for flexibility
 * across different Zoho configurations and data centers
 */
const MIN_TICKET_ID_LENGTH = 10;

/**
 * Default status for new tickets
 */
const DEFAULT_TICKET_STATUS = 'Open';

/**
 * Zoho Desk API version
 */
const ZOHO_DESK_API_VERSION = 'v1';

/**
 * Default base URL for Zoho Desk API
 */
const DEFAULT_BASE_URL = `https://desk.zoho.com/api/${ZOHO_DESK_API_VERSION}`;

/**
 * Field length limits with documented standards.
 *
 * IMPORTANT: Only includes limits that are based on official standards or would cause
 * system issues if exceeded. For fields without documented limits, we rely on the
 * Zoho Desk API to return validation errors.
 *
 * This approach prevents false rejections of valid user input while still providing
 * protection for fields with known constraints.
 */
const FIELD_LENGTH_LIMITS = {
  email: 254, // RFC 5321 maximum email length - official standard
} as const;

/**
 * Pre-compiled regex patterns for performance optimization
 */
const N8N_EXPRESSION_PATTERN = /\{\{.+?\}\}/;
const RFC5322_EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const ZOHO_DESK_ID_PATTERN = /^\d{10,}$/;
const TICKET_ID_PATTERN = new RegExp(`^\\d{${MIN_TICKET_ID_LENGTH},}$`);

/**
 * Zoho Desk API documentation URLs
 */
const ZOHO_DESK_CREATE_TICKET_DOCS =
  'https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket';
const ZOHO_DESK_UPDATE_TICKET_DOCS =
  'https://desk.zoho.com/support/APIDocument#Tickets#Tickets_UpdateTicket';

/**
 * HTTP error interface for proper error type handling
 */
interface HttpError extends Error {
  statusCode?: number;
  code?: number;
}

/**
 * Type guard to check if value is a plain object (not array or null)
 * @param value - Value to check
 * @returns True if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse comma-separated list and filter out empty values
 * @param value - Comma-separated string (can be undefined)
 * @returns Array of trimmed non-empty values
 */
function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Parse custom fields JSON with enhanced error handling, type validation, and CRLF removal
 * @param cf - Custom fields as JSON string or object
 * @returns Parsed and sanitized custom fields object
 * @throws Error with detailed message if JSON parsing fails or result is not a plain object
 */
function parseCustomFields(cf: unknown): IDataObject {
  try {
    let parsed: unknown;
    if (typeof cf === 'string') {
      parsed = JSON.parse(cf);
    } else {
      parsed = cf;
    }

    // Validate that parsed result is a plain object (not array or primitive)
    if (!isPlainObject(parsed)) {
      throw new Error(
        'Custom fields must be a JSON object, not an array or primitive value. ' +
          'See: ' +
          ZOHO_DESK_CREATE_TICKET_DOCS,
      );
    }

    // Sanitize all string values in custom fields to remove CRLF characters
    const sanitized: IDataObject = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        // Validate length for custom field values (no length limit specified)
        sanitized[key] = validateFieldLength(value, undefined, `Custom field "${key}"`);
      } else if (value !== null && value !== undefined) {
        // Keep non-string, non-null values as-is
        sanitized[key] = value as string | number | boolean | IDataObject;
      }
    }

    return sanitized;
  } catch (error) {
    // Check if error is already a validation error from isPlainObject check or validateFieldLength
    if (
      error instanceof Error &&
      (error.message.includes('Custom fields must be a JSON object') ||
        error.message.includes('exceeds maximum length'))
    ) {
      // Re-throw validation errors without wrapping to preserve specific details
      throw error;
    }

    // Wrap JSON parsing errors with helpful context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Custom fields must be valid JSON. Parse error: ${errorMessage}. ` +
        `Please ensure your JSON is properly formatted, e.g., {"cf_field": "value"}. ` +
        'See: ' +
        ZOHO_DESK_CREATE_TICKET_DOCS,
    );
  }
}

/**
 * Add optional fields to request body if they exist in source object
 * Removes CRLF characters from string fields to prevent header injection
 * @param body - Target object to add fields to
 * @param source - Source object containing field values
 * @param fields - Array of field names to copy
 */
function addOptionalFields(
  body: IDataObject,
  source: IDataObject,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (source[field] !== undefined) {
      // Validate length for string fields (XSS protection handled by Zoho Desk API)
      if (typeof source[field] === 'string') {
        const stringValue = source[field] as string;
        // Capitalize field name once for all uses (avoid variable shadowing)
        const fieldDisplayName = field.charAt(0).toUpperCase() + field.slice(1);

        // Validate ID fields - empty strings are allowed (Zoho Desk API will ignore them)
        if (field.endsWith('Id') && stringValue.trim() !== '') {
          isValidZohoDeskId(stringValue, fieldDisplayName);
        }

        // Apply length limits from FIELD_LENGTH_LIMITS or use undefined for no limit
        const maxLength =
          field in FIELD_LENGTH_LIMITS
            ? FIELD_LENGTH_LIMITS[field as keyof typeof FIELD_LENGTH_LIMITS]
            : undefined;
        body[field] = validateFieldLength(stringValue, maxLength, fieldDisplayName);
      } else {
        body[field] = source[field];
      }
    }
  }
}

/**
 * Validate ticket ID format
 * @param ticketId - Ticket ID to validate
 * @returns True if ticket ID is valid (numeric with proper length or n8n expression), false otherwise
 */
function isValidTicketId(ticketId: string): boolean {
  const trimmed = ticketId.trim();

  // Allow n8n expressions (e.g., {{$json.ticketId}}) - validation happens at runtime
  // Use pre-compiled pattern for performance
  if (N8N_EXPRESSION_PATTERN.test(trimmed)) {
    return true;
  }

  // Zoho Desk ticket IDs are typically 16-19 digit numeric strings
  // Use pre-compiled pattern for performance
  return TICKET_ID_PATTERN.test(trimmed);
}

/**
 * Validate generic Zoho Desk ID format (for accounts, departments, teams, etc.)
 * @param id - ID to validate
 * @param fieldName - Field name for error messages
 * @returns True if ID is valid (numeric or n8n expression), false otherwise
 */
function isValidZohoDeskId(id: string, fieldName: string): boolean {
  const trimmed = id.trim();

  // Allow n8n expressions - validation happens at runtime
  // Use pre-compiled pattern for performance
  if (N8N_EXPRESSION_PATTERN.test(trimmed)) {
    return true;
  }

  // Zoho Desk IDs are numeric strings (minimum 10 digits for safety)
  // Less strict than ticket IDs as different resources may have different lengths
  // Use pre-compiled pattern for performance
  if (!ZOHO_DESK_ID_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid ${fieldName} format: "${trimmed}". ` +
        `${fieldName} must be a numeric value with at least 10 digits.`,
    );
  }

  return true;
}

/**
 * Validate field length without modifying content
 *
 * IMPORTANT: Does NOT sanitize CRLF characters because:
 * - This node sends JSON request bodies, not HTTP headers
 * - CRLF injection only affects HTTP headers (e.g., "Header: value\r\nInjected-Header: malicious")
 * - In JSON bodies, newlines are safe and expected (e.g., multi-line descriptions)
 * - JSON serialization automatically escapes newlines as \n in the wire format
 * - Removing newlines breaks user-expected behavior for description and custom fields
 *
 * Example: "Line 1\nLine 2\nLine 3" → sent as-is → JSON serializes to "Line 1\\nLine 2\\nLine 3"
 *
 * SECURITY NOTE: Does NOT protect against XSS - handled by Zoho Desk API server-side.
 * Input like '<script>alert(XSS)</script>' passes through unchanged (as expected).
 *
 * @param value - String value to validate
 * @param maxLength - Maximum allowed length (optional). Throws error if exceeded.
 * @param fieldName - Field name for error messages (optional, defaults to 'Field')
 * @returns Original string value unchanged (preserves newlines and formatting)
 * @throws Error if value exceeds maxLength
 */
function validateFieldLength(value: string, maxLength?: number, fieldName?: string): string {
  // Enforce length limit if specified - THROW ERROR instead of silent truncation
  if (maxLength && value.length > maxLength) {
    throw new Error(
      `${fieldName || 'Field'} exceeds maximum length of ${maxLength} characters (${value.length} provided). ` +
        'Please shorten your input and try again.',
    );
  }

  return value;
}

/**
 * Validate email format using RFC 5322 compliant regex (simplified version)
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
function isValidEmail(email: string): boolean {
  // Use pre-compiled RFC 5322 compliant regex for performance
  // RFC 5321 maximum email length is 254 characters
  return RFC5322_EMAIL_PATTERN.test(email) && email.length <= FIELD_LENGTH_LIMITS.email;
}

/**
 * Add a contact field with validation and type checking
 * Reduces code duplication in contact validation
 * @param contact - Target contact object
 * @param contactValues - Source contact values
 * @param fieldName - Name of the field to add
 * @param fieldLabel - Display label for error messages
 * @param maxLength - Maximum allowed length for the field (optional)
 */
function addContactField(
  contact: IDataObject,
  contactValues: Record<string, unknown>,
  fieldName: string,
  fieldLabel: string,
  maxLength?: number,
): void {
  // Explicit null/undefined check - don't skip falsy values like 0 or empty string
  // (empty strings are handled below after trimming)
  if (contactValues[fieldName] === undefined || contactValues[fieldName] === null) return;

  const fieldType = typeof contactValues[fieldName];
  if (fieldType !== 'string' && fieldType !== 'number') {
    throw new Error(
      `Contact validation failed: ${fieldLabel} must be a string or number, not a complex object. ` +
        'See: ' +
        ZOHO_DESK_CREATE_TICKET_DOCS,
    );
  }

  // Type check above guarantees only string/number reach this point (no objects/arrays)
  // Safe to coerce to string since numbers will become their string representation
  const fieldStr = String(contactValues[fieldName]).trim();
  if (fieldStr !== '') {
    // Sanitize CRLF characters (does NOT protect against XSS - handled by Zoho Desk API)
    const cleaned = validateFieldLength(fieldStr, maxLength, `Contact ${fieldLabel}`);

    // Additional validation for email field
    if (fieldName === 'email' && !isValidEmail(cleaned)) {
      throw new Error(
        `Contact validation failed: Invalid email format "${cleaned}". ` +
          'See: ' +
          ZOHO_DESK_CREATE_TICKET_DOCS,
      );
    }

    contact[fieldName] = cleaned;
  }
}

/**
 * Add common ticket fields (description, secondaryContacts, custom fields)
 * This eliminates code duplication between create and update operations
 * @param body - Target object to add fields to
 * @param fields - Source object containing field values
 * @param includePriorityAndDueDate - Whether to include priority and dueDate fields (true for update, false for create)
 *                                     For create operation: priority and dueDate are primary fields, not in additionalFields
 *                                     For update operation: priority and dueDate are optional fields in updateFields
 */
function addCommonTicketFields(
  body: IDataObject,
  fields: IDataObject,
  includePriorityAndDueDate = true,
): void {
  // Description is now a primary field, so it's not handled here anymore

  // Only include dueDate and priority for update operation
  // For create operation, these are primary fields set separately
  if (includePriorityAndDueDate) {
    if (fields.dueDate !== undefined) {
      body.dueDate = fields.dueDate;
    }
    if (fields.priority !== undefined) {
      body.priority = fields.priority;
    }
  }

  if (fields.secondaryContacts !== undefined && typeof fields.secondaryContacts === 'string') {
    const contacts = parseCommaSeparatedList(fields.secondaryContacts);
    if (contacts.length > 0) {
      body.secondaryContacts = contacts;
    }
  }
  if (fields.cf !== undefined) {
    body.cf = parseCustomFields(fields.cf);
  }
}

export class ZohoDesk implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Zoho Desk',
    name: 'zohoDesk',
    icon: 'file:zohoDesk.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Create and update tickets in Zoho Desk',
    defaults: {
      name: 'Zoho Desk',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'zohoDeskOAuth2Api',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Ticket',
            value: 'ticket',
          },
        ],
        default: 'ticket',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['ticket'],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            description: 'Create a new ticket',
            action: 'Create a ticket',
          },
          {
            name: 'Update',
            value: 'update',
            description: 'Update an existing ticket',
            action: 'Update a ticket',
          },
        ],
        default: 'create',
      },
      // Create Operation Fields
      {
        displayName: 'Department Name or ID',
        name: 'departmentId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getDepartments',
        },
        required: true,
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: '',
        description:
          'The department to which the ticket belongs. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: '',
        description: 'Subject of the ticket',
      },
      {
        displayName: 'Contact',
        name: 'contact',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: false,
        },
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: {},
        description:
          'Details of the contact who raised the ticket. If email exists, contactId is used; otherwise, a new contact is created. Either lastName or email must be present.',
        options: [
          {
            name: 'contactValues',
            displayName: 'Contact Details',
            values: [
              {
                displayName: 'Email',
                name: 'email',
                type: 'string',
                placeholder: 'name@email.com',
                default: '',
                description: 'Email address of the contact (required if lastName is not provided)',
              },
              {
                displayName: 'First Name',
                name: 'firstName',
                type: 'string',
                default: '',
                description: 'First name of the contact',
              },
              {
                displayName: 'Last Name',
                name: 'lastName',
                type: 'string',
                default: '',
                description: 'Last name of the contact (required if email is not provided)',
              },
              {
                displayName: 'Mobile',
                name: 'mobile',
                type: 'string',
                default: '',
                description: 'Mobile number of the contact',
              },
              {
                displayName: 'Phone',
                name: 'phone',
                type: 'string',
                default: '',
                description: 'Phone number of the contact',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Priority',
        name: 'priority',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        options: [
          {
            name: 'Low',
            value: 'Low',
          },
          {
            name: 'Medium',
            value: 'Medium',
          },
          {
            name: 'High',
            value: 'High',
          },
        ],
        default: 'Medium',
        description: 'Priority of the ticket',
      },
      {
        displayName: 'Classification',
        name: 'classification',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        options: [
          {
            name: 'Question',
            value: 'Question',
          },
          {
            name: 'Problem',
            value: 'Problem',
          },
          {
            name: 'Request',
            value: 'Request',
          },
          {
            name: 'Others',
            value: 'Others',
          },
        ],
        default: 'Question',
        description: 'Classification of the ticket',
      },
      {
        displayName: 'Due Date',
        name: 'dueDate',
        type: 'dateTime',
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: '',
        description: 'The due date for resolving the ticket',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: {
          rows: 5,
        },
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: '',
        description: 'Description of the ticket',
      },
      {
        displayName: 'Tags',
        name: 'tags',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        default: '',
        description: 'Comma-separated list of tags associated with the ticket',
        placeholder: 'urgent, customer-service, billing',
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['create'],
          },
        },
        options: [
          {
            displayName: 'Secondary Contacts',
            name: 'secondaryContacts',
            type: 'string',
            default: '',
            description: 'Comma-separated list of contact IDs for secondary contacts',
            placeholder: '1892000000042038, 1892000000042042',
          },
          {
            displayName: 'Custom Fields',
            name: 'cf',
            type: 'json',
            default: '',
            description: 'Custom fields as JSON object',
            placeholder: '{"cf_modelname": "F3 2017", "cf_phone": "123456"}',
          },
          {
            displayName: 'Account ID',
            name: 'accountId',
            type: 'string',
            default: '',
            description: 'The ID of the account associated with the ticket',
          },
          {
            displayName: 'Assignee ID',
            name: 'assigneeId',
            type: 'string',
            default: '',
            description: 'The ID of the agent to whom the ticket is assigned',
          },
          {
            displayName: 'Category',
            name: 'category',
            type: 'string',
            default: '',
            description: 'Category to which the ticket belongs',
          },
          {
            displayName: 'Channel',
            name: 'channel',
            type: 'options',
            options: [
              {
                name: 'Email',
                value: 'EMAIL',
              },
              {
                name: 'Phone',
                value: 'PHONE',
              },
              {
                name: 'Twitter',
                value: 'TWITTER',
              },
              {
                name: 'Facebook',
                value: 'FACEBOOK',
              },
              {
                name: 'Chat',
                value: 'CHAT',
              },
              {
                name: 'Forums',
                value: 'FORUMS',
              },
              {
                name: 'Feedback Widget',
                value: 'FEEDBACK_WIDGET',
              },
              {
                name: 'Web',
                value: 'WEB',
              },
            ],
            default: 'EMAIL',
            description: 'The channel through which the ticket was created',
          },
          {
            displayName: 'Email',
            name: 'email',
            type: 'string',
            placeholder: 'name@email.com',
            default: '',
            description: 'Email address of the contact',
          },
          {
            displayName: 'Language',
            name: 'language',
            type: 'string',
            default: '',
            description: 'Language in which the ticket was created',
          },
          {
            displayName: 'Phone',
            name: 'phone',
            type: 'string',
            default: '',
            description: 'Phone number of the contact',
          },
          {
            displayName: 'Product ID',
            name: 'productId',
            type: 'string',
            default: '',
            description: 'The ID of the product associated with the ticket',
          },
          {
            displayName: 'Resolution',
            name: 'resolution',
            type: 'string',
            typeOptions: {
              rows: 5,
            },
            default: '',
            description: 'Resolution content of the ticket',
          },
          {
            displayName: 'Status',
            name: 'status',
            type: 'string',
            default: DEFAULT_TICKET_STATUS,
            description: `Status of the ticket (default: ${DEFAULT_TICKET_STATUS} for new tickets)`,
          },
          {
            displayName: 'Sub Category',
            name: 'subCategory',
            type: 'string',
            default: '',
            description: 'Sub-category to which the ticket belongs',
          },
        ],
      },
      // Update Operation Fields
      {
        displayName: 'Ticket ID',
        name: 'ticketId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['update'],
          },
        },
        default: '',
        description: 'The ID of the ticket to update',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: {
          rows: 5,
        },
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['update'],
          },
        },
        default: '',
        description: 'Description of the ticket',
      },
      {
        displayName: 'Update Fields',
        name: 'updateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: {
          show: {
            resource: ['ticket'],
            operation: ['update'],
          },
        },
        options: [
          {
            displayName: 'Due Date',
            name: 'dueDate',
            type: 'dateTime',
            default: '',
            description:
              'The due date for resolving the ticket (leave empty to keep current due date)',
          },
          {
            displayName: 'Priority',
            name: 'priority',
            type: 'options',
            options: [
              {
                name: 'No Change',
                value: '',
              },
              {
                name: 'Low',
                value: 'Low',
              },
              {
                name: 'Medium',
                value: 'Medium',
              },
              {
                name: 'High',
                value: 'High',
              },
            ],
            default: '',
            description: 'Priority of the ticket',
          },
          {
            displayName: 'Secondary Contacts',
            name: 'secondaryContacts',
            type: 'string',
            default: '',
            description: 'Comma-separated list of contact IDs for secondary contacts',
            placeholder: '1892000000042038, 1892000000042042',
          },
          {
            displayName: 'Custom Fields',
            name: 'cf',
            type: 'json',
            default: '',
            description: 'Custom fields as JSON object',
            placeholder: '{"cf_modelname": "F3 2017", "cf_phone": "123456"}',
          },
          {
            displayName: 'Account ID',
            name: 'accountId',
            type: 'string',
            default: '',
            description: 'The ID of the account associated with the ticket',
          },
          {
            displayName: 'Assignee ID',
            name: 'assigneeId',
            type: 'string',
            default: '',
            description: 'The ID of the agent to whom the ticket is assigned',
          },
          {
            displayName: 'Category',
            name: 'category',
            type: 'string',
            default: '',
            description: 'Category to which the ticket belongs',
          },
          {
            displayName: 'Classification',
            name: 'classification',
            type: 'options',
            options: [
              {
                name: 'No Change',
                value: '',
              },
              {
                name: 'Question',
                value: 'Question',
              },
              {
                name: 'Problem',
                value: 'Problem',
              },
              {
                name: 'Request',
                value: 'Request',
              },
              {
                name: 'Others',
                value: 'Others',
              },
            ],
            default: '',
            description: 'Classification of the ticket',
          },
          {
            displayName: 'Contact ID',
            name: 'contactId',
            type: 'string',
            default: '',
            description: 'The ID of the contact who raised the ticket',
          },
          {
            displayName: 'Department Name or ID',
            name: 'departmentId',
            type: 'options',
            typeOptions: {
              loadOptionsMethod: 'getDepartments',
            },
            default: '',
            description:
              'The department to which the ticket belongs. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
          {
            displayName: 'Email',
            name: 'email',
            type: 'string',
            placeholder: 'name@email.com',
            default: '',
            description: 'Email address of the contact',
          },
          {
            displayName: 'Language',
            name: 'language',
            type: 'string',
            default: '',
            description: 'Language in which the ticket was created',
          },
          {
            displayName: 'Phone',
            name: 'phone',
            type: 'string',
            default: '',
            description: 'Phone number of the contact',
          },
          {
            displayName: 'Product ID',
            name: 'productId',
            type: 'string',
            default: '',
            description: 'The ID of the product associated with the ticket',
          },
          {
            displayName: 'Resolution',
            name: 'resolution',
            type: 'string',
            typeOptions: {
              rows: 5,
            },
            default: '',
            description: 'Resolution content of the ticket',
          },
          {
            displayName: 'Status',
            name: 'status',
            type: 'string',
            default: '',
            description: 'Status of the ticket (leave empty to keep current status)',
          },
          {
            displayName: 'Sub Category',
            name: 'subCategory',
            type: 'string',
            default: '',
            description: 'Sub-category to which the ticket belongs',
          },
          {
            displayName: 'Subject',
            name: 'subject',
            type: 'string',
            default: '',
            description: 'Subject of the ticket',
          },
          {
            displayName: 'Tags',
            name: 'tags',
            type: 'string',
            default: '',
            description: 'Comma-separated list of tags associated with the ticket',
            placeholder: 'urgent, customer-service, billing',
          },
          {
            displayName: 'Team Name or ID',
            name: 'teamId',
            type: 'options',
            typeOptions: {
              loadOptionsMethod: 'getTeams',
              loadOptionsDependsOn: ['departmentId'],
            },
            default: '',
            description:
              'The team assigned to the ticket. Note: Teams will only load if Department is selected first. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      /**
       * Load all departments from Zoho Desk
       * @returns Array of department options for dropdown
       */
      async getDepartments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('zohoDeskOAuth2Api');
          const orgId = credentials.orgId as string;
          const baseUrl = (credentials.baseUrl as string | undefined) || DEFAULT_BASE_URL;

          const options = {
            method: 'GET',
            headers: {
              orgId: orgId,
            },
            uri: `${baseUrl}/departments`,
            json: true,
          };

          const response = await this.helpers.requestOAuth2.call(
            this,
            'zohoDeskOAuth2Api',
            options,
          );

          // Runtime validation of API response structure
          if (
            !response ||
            typeof response !== 'object' ||
            !('data' in response) ||
            !Array.isArray(response.data)
          ) {
            throw new Error('Invalid API response structure from Zoho Desk');
          }

          const typedResponse = response as ZohoDeskListResponse<ZohoDeskDepartment>;

          return typedResponse.data.map((department) => ({
            name: department.name,
            value: department.id,
          }));
        } catch (error) {
          // Return error option in dropdown so users can see what went wrong
          const errorMessage = error instanceof Error ? error.message : String(error);
          return [
            {
              name: `⚠️ Error loading departments: ${errorMessage}`,
              value: '',
            },
          ];
        }
      },

      /**
       * Load teams for a specific department from Zoho Desk
       * @returns Array of team options for dropdown, or empty array if department not selected
       */
      async getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('zohoDeskOAuth2Api');
          const orgId = credentials.orgId as string;
          const baseUrl = (credentials.baseUrl as string | undefined) || DEFAULT_BASE_URL;
          const departmentId = this.getCurrentNodeParameter('departmentId');

          // Type guard: departmentId is optional in update operation
          if (!departmentId || typeof departmentId !== 'string') {
            return [];
          }

          const options = {
            method: 'GET',
            headers: {
              orgId: orgId,
            },
            uri: `${baseUrl}/departments/${encodeURIComponent(departmentId)}/teams`,
            json: true,
          };

          const response = await this.helpers.requestOAuth2.call(
            this,
            'zohoDeskOAuth2Api',
            options,
          );

          // Runtime validation of API response structure
          if (
            !response ||
            typeof response !== 'object' ||
            !('data' in response) ||
            !Array.isArray(response.data)
          ) {
            throw new Error('Invalid API response structure from Zoho Desk');
          }

          const typedResponse = response as ZohoDeskListResponse<ZohoDeskTeam>;

          return typedResponse.data.map((team) => ({
            name: team.name,
            value: team.id,
          }));
        } catch (error) {
          // Return error option in dropdown so users can see what went wrong
          const errorMessage = error instanceof Error ? error.message : String(error);
          return [
            {
              name: `⚠️ Error loading teams: ${errorMessage}`,
              value: '',
            },
          ];
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0);
    const operation = this.getNodeParameter('operation', 0);

    // Fetch credentials once for all items (optimization)
    const credentials = await this.getCredentials('zohoDeskOAuth2Api');
    const orgId = credentials.orgId as string;
    const baseUrl = (credentials.baseUrl as string | undefined) || DEFAULT_BASE_URL;

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === 'ticket') {
          if (operation === 'create') {
            // Create ticket
            const departmentId = this.getNodeParameter('departmentId', i) as string;
            const rawSubject = this.getNodeParameter('subject', i) as string;
            const contactData = this.getNodeParameter('contact', i) as IDataObject;
            const priority = this.getNodeParameter('priority', i) as string;
            const classification = this.getNodeParameter('classification', i) as string;
            const dueDate = this.getNodeParameter('dueDate', i) as string;
            const description = this.getNodeParameter('description', i) as string;
            const tags = this.getNodeParameter('tags', i) as string;
            const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

            // Validate length for subject (XSS protection handled by Zoho Desk API)
            // No length limit - let Zoho Desk API validate
            const subject = validateFieldLength(rawSubject, undefined, 'Subject');

            const body: IDataObject = {
              departmentId,
              subject,
              priority,
              classification,
            };

            // Add dueDate if provided
            if (dueDate) {
              body.dueDate = dueDate;
            }

            // Add description if provided
            if (description) {
              body.description = validateFieldLength(description, undefined, 'Description');
            }

            // Handle and validate contact object (OPTIONAL)
            // Contact field is optional in UI (required: false) but if provided, must be valid
            // Contact auto-creation flow (when provided):
            // 1. If email exists in Zoho Desk → Existing contact is used
            // 2. If email doesn't exist → New contact is created with provided details
            // 3. Either email OR lastName must be provided (Zoho Desk requirement)
            if (contactData && contactData.contactValues) {
              const contactValues = contactData.contactValues as IDataObject;

              // Type guard for contactValues using isPlainObject helper
              if (!isPlainObject(contactValues)) {
                throw new Error(
                  'Contact validation failed: Invalid contact data format. ' +
                    'See: ' +
                    ZOHO_DESK_CREATE_TICKET_DOCS,
                );
              }

              // Check if any non-empty values exist before processing
              // This prevents unnecessary validation errors when user provides empty contact fields
              const hasNonEmptyValue = Object.values(contactValues).some(
                (value) => value && String(value).trim() !== '',
              );

              if (hasNonEmptyValue) {
                // Build contact object with available non-empty fields
                // Zoho Desk will automatically match by email or create new contact
                // Type validation ensures we only coerce strings/numbers, not complex objects
                const contact: IDataObject = {};

                // Use helper function to add contact fields with validation and CRLF sanitization
                // Only email has a documented length limit (RFC 5321), others validated by API
                addContactField(
                  contact,
                  contactValues,
                  'email',
                  'email',
                  FIELD_LENGTH_LIMITS.email,
                );
                addContactField(contact, contactValues, 'lastName', 'lastName', undefined);
                addContactField(contact, contactValues, 'firstName', 'firstName', undefined);
                addContactField(contact, contactValues, 'phone', 'phone', undefined);
                addContactField(contact, contactValues, 'mobile', 'mobile', undefined);

                // Validation: if contact has values, ensure at least email or lastName is present
                // This catches edge cases where only firstName/phone/mobile are provided
                if (!contact.email && !contact.lastName) {
                  throw new Error(
                    'Contact validation failed: Either email or lastName must be provided. ' +
                      'See: ' +
                      ZOHO_DESK_CREATE_TICKET_DOCS,
                  );
                }

                body.contact = contact;
              }
              // If all values are empty, skip contact entirely (no error thrown)
            }

            // Add common fields (description, secondaryContacts, custom fields)
            // Note: priority and dueDate are already set as primary fields above
            addCommonTicketFields(body, additionalFields, false);

            // Add other additional fields
            addOptionalFields(body, additionalFields, TICKET_CREATE_OPTIONAL_FIELDS);

            // Handle tags with filtering of empty values and CRLF sanitization
            // Tags is now a primary field for create operation
            // No length limit - let Zoho Desk API validate
            if (tags && typeof tags === 'string') {
              const parsedTags = parseCommaSeparatedList(tags).map((tag) =>
                validateFieldLength(tag, undefined, 'Tag'),
              );
              if (parsedTags.length > 0) {
                body.tags = parsedTags;
              }
            }

            const options = {
              method: 'POST',
              headers: {
                orgId: orgId,
              },
              body,
              uri: `${baseUrl}/tickets`,
              json: true,
            };

            const response = await this.helpers.requestOAuth2.call(
              this,
              'zohoDeskOAuth2Api',
              options,
            );

            returnData.push({
              json: response,
              pairedItem: { item: i },
            });
          }

          if (operation === 'update') {
            // Update ticket
            const ticketId = this.getNodeParameter('ticketId', i) as string;
            const description = this.getNodeParameter('description', i) as string;
            const updateFields = this.getNodeParameter('updateFields', i) as IDataObject;

            // Validate ticket ID format (should be numeric)
            if (!isValidTicketId(ticketId)) {
              throw new Error(
                `Invalid ticket ID format: "${ticketId}". Ticket ID must be a numeric value. ` +
                  'See: ' +
                  ZOHO_DESK_UPDATE_TICKET_DOCS,
              );
            }

            const body: IDataObject = {};

            // Add common fields (description, dueDate, priority, secondaryContacts, custom fields)
            addCommonTicketFields(body, updateFields);

            // Add other update fields

            // Add description if provided
            if (description) {
              body.description = validateFieldLength(description, undefined, 'Description');
            }
            addOptionalFields(body, updateFields, TICKET_UPDATE_OPTIONAL_FIELDS);

            // Handle tags with filtering of empty values and CRLF sanitization
            // No length limit - let Zoho Desk API validate
            if (updateFields.tags !== undefined && typeof updateFields.tags === 'string') {
              const tags = parseCommaSeparatedList(updateFields.tags).map((tag) =>
                validateFieldLength(tag, undefined, 'Tag'),
              );
              if (tags.length > 0) {
                body.tags = tags;
              }
            }

            const options = {
              method: 'PATCH',
              headers: {
                orgId: orgId,
              },
              body,
              uri: `${baseUrl}/tickets/${encodeURIComponent(ticketId)}`,
              json: true,
            };

            const response = await this.helpers.requestOAuth2.call(
              this,
              'zohoDeskOAuth2Api',
              options,
            );

            returnData.push({
              json: response,
              pairedItem: { item: i },
            });
          }
        }
      } catch (error) {
        // Check for rate limiting (HTTP 429)
        const errorObj = error as HttpError;
        if (errorObj.statusCode === 429 || errorObj.code === 429) {
          const rateLimitError = new Error(
            'Zoho Desk API rate limit exceeded (10 requests/second per organization). ' +
              'Please wait a moment and try again, or reduce the number of items being processed.',
          );
          if (this.continueOnFail()) {
            returnData.push({
              json: {
                error: rateLimitError.message,
              },
              pairedItem: { item: i },
            });
            continue;
          }
          throw rateLimitError;
        }

        // Handle other errors
        if (this.continueOnFail()) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          returnData.push({
            json: {
              error: errorMessage,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
