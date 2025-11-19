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
 * Note: Some fields like 'description', 'dueDate', 'priority', 'secondaryContacts', 'cf', and 'tags'
 * are handled separately with custom parsing logic (see addCommonTicketFields function)
 */
const TICKET_CREATE_OPTIONAL_FIELDS = [
	'accountId',
	'assigneeId',
	'category',
	'channel',
	'classification',
	'email',
	'language',
	'phone',
	'productId',
	'resolution',
	'status',
	'subCategory',
	'teamId',
] as const;

/**
 * Optional fields for ticket update operation
 * Note: Some fields like 'description', 'dueDate', 'priority', 'secondaryContacts', 'cf', and 'tags'
 * are handled separately with custom parsing logic (see addCommonTicketFields function)
 */
const TICKET_UPDATE_OPTIONAL_FIELDS = [
	'accountId',
	'assigneeId',
	'category',
	'channel',
	'classification',
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
 * Parse custom fields JSON with enhanced error handling and type validation
 * @param cf - Custom fields as JSON string or object
 * @returns Parsed custom fields object
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
				'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket'
			);
		}

		return parsed as IDataObject;
	} catch (error) {
		// Check if error is already a validation error from isPlainObject check
		if (error instanceof Error && error.message.includes('Custom fields must be a JSON object')) {
			// Re-throw validation errors without wrapping to preserve specific details
			throw error;
		}

		// Wrap JSON parsing errors with helpful context
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Custom fields must be valid JSON. Parse error: ${errorMessage}. ` +
			`Please ensure your JSON is properly formatted, e.g., {"cf_field": "value"}. ` +
			'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
		);
	}
}

/**
 * Add optional fields to request body if they exist in source object
 * Includes sanitization for string fields to prevent injection attacks
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
			// Sanitize string fields to prevent injection attacks
			if (typeof source[field] === 'string') {
				// Apply appropriate length limits based on field type
				const maxLength = field === 'subject' ? 255 :
								 field === 'resolution' ? 30000 :
								 field === 'category' || field === 'subCategory' ? 100 :
								 undefined;
				body[field] = sanitizeString(source[field] as string, maxLength);
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
	// Regex requires at least one non-whitespace character between braces
	if (/\{\{.+?\}\}/.test(trimmed)) {
		return true;
	}

	// Zoho Desk ticket IDs are typically 16-19 digit numeric strings
	// Use constant for minimum length to allow flexibility across configurations
	const pattern = new RegExp(`^\\d{${MIN_TICKET_ID_LENGTH},}$`);
	return pattern.test(trimmed);
}

/**
 * Sanitize string input to prevent injection attacks
 * @param value - String value to sanitize
 * @param maxLength - Maximum allowed length (optional)
 * @returns Sanitized string with CRLF characters removed
 */
function sanitizeString(value: string, maxLength?: number): string {
	// Remove CRLF injection characters
	let sanitized = value.replace(/[\r\n]/g, '');

	// Trim and enforce length limit if specified
	if (maxLength && sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength);
	}

	return sanitized;
}

/**
 * Validate and sanitize email format
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
function isValidEmail(email: string): boolean {
	// Basic email validation regex
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Add a contact field with validation and type checking
 * Reduces code duplication in contact validation
 * @param contact - Target contact object
 * @param contactValues - Source contact values
 * @param fieldName - Name of the field to add
 * @param fieldLabel - Display label for error messages
 * @param maxLength - Maximum allowed length for the field
 */
function addContactField(
	contact: IDataObject,
	contactValues: Record<string, unknown>,
	fieldName: string,
	fieldLabel: string,
	maxLength?: number,
): void {
	if (!contactValues[fieldName]) return;

	const fieldType = typeof contactValues[fieldName];
	if (fieldType !== 'string' && fieldType !== 'number') {
		throw new Error(
			`Contact validation failed: ${fieldLabel} must be a string or number, not a complex object. ` +
			'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
		);
	}

	const fieldStr = String(contactValues[fieldName]).trim();
	if (fieldStr !== '') {
		// Sanitize the string value
		const sanitized = sanitizeString(fieldStr, maxLength);

		// Additional validation for email field
		if (fieldName === 'email' && !isValidEmail(sanitized)) {
			throw new Error(
				`Contact validation failed: Invalid email format "${sanitized}". ` +
				'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
			);
		}

		contact[fieldName] = sanitized;
	}
}

/**
 * Add common ticket fields (description, dueDate, priority, secondaryContacts, custom fields)
 * This eliminates code duplication between create and update operations
 * @param body - Target object to add fields to
 * @param fields - Source object containing field values
 */
function addCommonTicketFields(body: IDataObject, fields: IDataObject): void {
	if (fields.description !== undefined) {
		// Sanitize description to prevent injection attacks (max 30000 chars per Zoho Desk limits)
		body.description = typeof fields.description === 'string'
			? sanitizeString(fields.description, 30000)
			: fields.description;
	}
	if (fields.dueDate !== undefined) {
		body.dueDate = fields.dueDate;
	}
	if (fields.priority !== undefined) {
		body.priority = fields.priority;
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
				displayName: 'Department',
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
				description: 'The department to which the ticket belongs',
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
				required: false,
				displayOptions: {
					show: {
						resource: ['ticket'],
						operation: ['create'],
					},
				},
				default: {},
				description: 'Details of the contact who raised the ticket. If email exists, contactId is used; otherwise, a new contact is created. Either lastName or email must be present.',
				options: [
					{
						name: 'contactValues',
						displayName: 'Contact Details',
						values: [
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								default: '',
								description: 'Email address of the contact (required if lastName is not provided)',
							},
							{
								displayName: 'Last Name',
								name: 'lastName',
								type: 'string',
								default: '',
								description: 'Last name of the contact (required if email is not provided)',
							},
							{
								displayName: 'First Name',
								name: 'firstName',
								type: 'string',
								default: '',
								description: 'First name of the contact',
							},
							{
								displayName: 'Phone',
								name: 'phone',
								type: 'string',
								default: '',
								description: 'Phone number of the contact',
							},
							{
								displayName: 'Mobile',
								name: 'mobile',
								type: 'string',
								default: '',
								description: 'Mobile number of the contact',
							},
						],
					},
				],
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
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: {
							rows: 5,
						},
						default: '',
						description: 'Description of the ticket',
					},
					{
						displayName: 'Due Date',
						name: 'dueDate',
						type: 'dateTime',
						default: '',
						description: 'The due date for resolving the ticket',
					},
					{
						displayName: 'Priority',
						name: 'priority',
						type: 'options',
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
						displayName: 'Secondary Contacts',
						name: 'secondaryContacts',
						type: 'string',
						default: '',
						description: 'Comma-separated list of contact IDs for secondary contacts',
						placeholder: '1892000000042038, 1892000000042042',
					},
					{
						displayName: 'Team',
						name: 'teamId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTeams',
							loadOptionsDependsOn: ['departmentId'],
						},
						default: '',
						description: 'The team assigned to the ticket. Note: Teams will only load if Department is selected first.',
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
						displayName: 'Classification',
						name: 'classification',
						type: 'string',
						default: '',
						description: 'Classification of the ticket',
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
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
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						description: 'Comma-separated list of tags associated with the ticket',
						placeholder: 'urgent, customer-service, billing',
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
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: {
							rows: 5,
						},
						default: '',
						description: 'Description of the ticket',
					},
					{
						displayName: 'Due Date',
						name: 'dueDate',
						type: 'dateTime',
						default: '',
						description: 'The due date for resolving the ticket',
					},
					{
						displayName: 'Priority',
						name: 'priority',
						type: 'options',
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
						displayName: 'Classification',
						name: 'classification',
						type: 'string',
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
						displayName: 'Department',
						name: 'departmentId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getDepartments',
						},
						default: '',
						description: 'The department to which the ticket belongs',
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
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
						displayName: 'Team',
						name: 'teamId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTeams',
							loadOptionsDependsOn: ['departmentId'],
						},
						default: '',
						description: 'The team assigned to the ticket. Note: Teams will only load if Department is selected first.',
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
							'orgId': orgId,
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
					if (!response || typeof response !== 'object' ||
						!('data' in response) || !Array.isArray(response.data)) {
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
					return [{
						name: `⚠️ Error loading departments: ${errorMessage}`,
						value: '',
					}];
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
							'orgId': orgId,
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
					if (!response || typeof response !== 'object' ||
						!('data' in response) || !Array.isArray(response.data)) {
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
					return [{
						name: `⚠️ Error loading teams: ${errorMessage}`,
						value: '',
					}];
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
						const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

						// Sanitize subject (max 255 chars per Zoho Desk limits)
						const subject = sanitizeString(rawSubject, 255);

						const body: IDataObject = {
							departmentId,
							subject,
						};

						// Handle and validate contact object
						// Contact is REQUIRED for ticket creation (Zoho Desk API requirement)
						// Contact auto-creation flow:
						// 1. If email exists in Zoho Desk → Existing contact is used
						// 2. If email doesn't exist → New contact is created with provided details
						// 3. Either email OR lastName must be provided (Zoho Desk requirement)
						if (!contactData || !contactData.contactValues) {
							throw new Error(
								'Contact information is required for ticket creation. Please provide at least email or lastName. ' +
								'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
							);
						}

						const contactValues = contactData.contactValues as IDataObject;

						// Type guard for contactValues using isPlainObject helper
						if (!isPlainObject(contactValues)) {
							throw new Error(
								'Contact validation failed: Invalid contact data format. ' +
								'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
							);
						}

						// Build contact object with available non-empty fields
						// Zoho Desk will automatically match by email or create new contact
						// Type validation ensures we only coerce strings/numbers, not complex objects
						const contact: IDataObject = {};

						// Use helper function to add contact fields with validation and sanitization
						addContactField(contact, contactValues, 'email', 'email', 255);
						addContactField(contact, contactValues, 'lastName', 'lastName', 120);
						addContactField(contact, contactValues, 'firstName', 'firstName', 120);
						addContactField(contact, contactValues, 'phone', 'phone', 50);
						addContactField(contact, contactValues, 'mobile', 'mobile', 50);

						// Single consolidated validation: ensure at least email or lastName has a non-empty value
						// This catches all edge cases in one place
						if (!contact.email && !contact.lastName) {
							throw new Error(
								'Contact validation failed: Either email or lastName must have a non-empty value. ' +
								'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_CreateTicket',
							);
						}

						body.contact = contact;

						// Add common fields (description, dueDate, priority, secondaryContacts, custom fields)
						addCommonTicketFields(body, additionalFields);

						// Add other additional fields
						addOptionalFields(body, additionalFields, TICKET_CREATE_OPTIONAL_FIELDS);

						// Handle tags with filtering of empty values
						if (additionalFields.tags && typeof additionalFields.tags === 'string') {
							const tags = parseCommaSeparatedList(additionalFields.tags);
							if (tags.length > 0) {
								body.tags = tags;
							}
						}

						const options = {
							method: 'POST',
							headers: {
								'orgId': orgId,
							},
							body,
							uri: `${baseUrl}/tickets`,
							json: true,
						};

						const response = await this.helpers.requestOAuth2.call(this, 'zohoDeskOAuth2Api', options);

						returnData.push({
							json: response,
							pairedItem: { item: i },
						});
					}

					if (operation === 'update') {
						// Update ticket
						const ticketId = this.getNodeParameter('ticketId', i) as string;
						const updateFields = this.getNodeParameter('updateFields', i) as IDataObject;

						// Validate ticket ID format (should be numeric)
						if (!isValidTicketId(ticketId)) {
							throw new Error(
								`Invalid ticket ID format: "${ticketId}". Ticket ID must be a numeric value. ` +
								'See: https://desk.zoho.com/support/APIDocument#Tickets#Tickets_UpdateTicket',
							);
						}

						const body: IDataObject = {};

						// Add common fields (description, dueDate, priority, secondaryContacts, custom fields)
						addCommonTicketFields(body, updateFields);

						// Add other update fields
						addOptionalFields(body, updateFields, TICKET_UPDATE_OPTIONAL_FIELDS);

						// Handle tags with filtering of empty values
						if (updateFields.tags !== undefined && typeof updateFields.tags === 'string') {
							const tags = parseCommaSeparatedList(updateFields.tags);
							if (tags.length > 0) {
								body.tags = tags;
							}
						}

						const options = {
							method: 'PATCH',
							headers: {
								'orgId': orgId,
							},
							body,
							uri: `${baseUrl}/tickets/${encodeURIComponent(ticketId)}`,
							json: true,
						};

						const response = await this.helpers.requestOAuth2.call(this, 'zohoDeskOAuth2Api', options);

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
