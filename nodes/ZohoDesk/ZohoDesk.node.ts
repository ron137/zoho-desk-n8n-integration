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
	id: string;
	name: string;
}

/**
 * Zoho Desk Team response structure
 */
interface ZohoDeskTeam {
	id: string;
	name: string;
}

/**
 * Zoho Desk API list response wrapper
 */
interface ZohoDeskListResponse<T> {
	data: T[];
}

/**
 * Parse comma-separated list and filter out empty values
 * @param value - Comma-separated string
 * @returns Array of trimmed non-empty values
 */
function parseCommaSeparatedList(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/**
 * Parse custom fields JSON with enhanced error handling
 * @param cf - Custom fields as JSON string or object
 * @returns Parsed custom fields object
 * @throws Error with detailed message if JSON parsing fails
 */
function parseCustomFields(cf: unknown): IDataObject {
	try {
		if (typeof cf === 'string') {
			return JSON.parse(cf) as IDataObject;
		}
		return cf as IDataObject;
	} catch (error) {
		throw new Error(
			`Custom fields must be valid JSON. Parse error: ${error.message}. ` +
				`Please ensure your JSON is properly formatted, e.g., {"cf_field": "value"}`,
		);
	}
}

/**
 * Add optional fields to request body if they exist in source object
 * @param body - Target object to add fields to
 * @param source - Source object containing field values
 * @param fields - Array of field names to copy
 */
function addOptionalFields(
	body: IDataObject,
	source: IDataObject,
	fields: string[],
): void {
	for (const field of fields) {
		if (source[field] !== undefined) {
			body[field] = source[field];
		}
	}
}

/**
 * Validate ticket ID format
 * @param ticketId - Ticket ID to validate
 * @returns True if ticket ID is valid (numeric), false otherwise
 */
function isValidTicketId(ticketId: string): boolean {
	// Ticket IDs in Zoho Desk are numeric strings
	return /^\d+$/.test(ticketId.trim());
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
						description: 'The team assigned to the ticket',
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
						default: 'Open',
						description: 'Status of the ticket',
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
						description: 'Status of the ticket',
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
						description: 'The team assigned to the ticket',
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
				const credentials = await this.getCredentials('zohoDeskOAuth2Api');
				const orgId = credentials.orgId as string;
				const baseUrl = credentials.baseUrl || 'https://desk.zoho.com/api/v1';

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
				) as ZohoDeskListResponse<ZohoDeskDepartment>;

				const departments = response.data || [];
				return departments.map((department) => ({
					name: department.name,
					value: department.id,
				}));
			},

			/**
			 * Load teams for a specific department from Zoho Desk
			 * @returns Array of team options for dropdown, or empty array if department not selected
			 */
			async getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('zohoDeskOAuth2Api');
				const orgId = credentials.orgId as string;
				const baseUrl = credentials.baseUrl || 'https://desk.zoho.com/api/v1';
				const departmentId = this.getCurrentNodeParameter('departmentId') as string;

				if (!departmentId) {
					return [];
				}

				const options = {
					method: 'GET',
					headers: {
						'orgId': orgId,
					},
					uri: `${baseUrl}/departments/${departmentId}/teams`,
					json: true,
				};

				try {
					const response = await this.helpers.requestOAuth2.call(
						this,
						'zohoDeskOAuth2Api',
						options,
					) as ZohoDeskListResponse<ZohoDeskTeam>;

					const teams = response.data || [];
					return teams.map((team) => ({
						name: team.name,
						value: team.id,
					}));
				} catch (error) {
					// Return empty array if department has no teams or if there's an API error
					// This prevents the UI from breaking when a department has no teams
					console.warn(`Failed to load teams for department ${departmentId}: ${error.message}`);
					return [];
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
		const baseUrl = (credentials.baseUrl as string) || 'https://desk.zoho.com/api/v1';

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'ticket') {
					if (operation === 'create') {
						// Create ticket
						const departmentId = this.getNodeParameter('departmentId', i) as string;
						const subject = this.getNodeParameter('subject', i) as string;
						const contactData = this.getNodeParameter('contact', i) as IDataObject;
						const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

						const body: IDataObject = {
							departmentId,
							subject,
						};

						// Handle and validate contact object
						if (contactData && contactData.contactValues) {
							const contactValues = contactData.contactValues as IDataObject;

							// Validate that at least email or lastName is provided
							if (!contactValues.email && !contactValues.lastName) {
								throw new Error(
									'Contact validation failed: Either email or lastName must be provided for the contact',
								);
							}

							if (contactValues.email || contactValues.lastName) {
								const contact: IDataObject = {};
								if (contactValues.email) contact.email = contactValues.email;
								if (contactValues.lastName) contact.lastName = contactValues.lastName;
								if (contactValues.firstName) contact.firstName = contactValues.firstName;
								if (contactValues.phone) contact.phone = contactValues.phone;
								if (contactValues.mobile) contact.mobile = contactValues.mobile;
								body.contact = contact;
							}
						}

						// Add description, dueDate, priority, secondaryContacts
						if (additionalFields.description) {
							body.description = additionalFields.description;
						}
						if (additionalFields.dueDate) {
							body.dueDate = additionalFields.dueDate;
						}
						if (additionalFields.priority) {
							body.priority = additionalFields.priority;
						}
						if (additionalFields.secondaryContacts) {
							const contacts = parseCommaSeparatedList(additionalFields.secondaryContacts as string);
							if (contacts.length > 0) {
								body.secondaryContacts = contacts;
							}
						}

						// Add custom fields with enhanced error handling
						if (additionalFields.cf) {
							body.cf = parseCustomFields(additionalFields.cf);
						}

						// Add other additional fields
						addOptionalFields(body, additionalFields, [
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
						]);

						// Handle tags with filtering of empty values
						if (additionalFields.tags) {
							const tags = parseCommaSeparatedList(additionalFields.tags as string);
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
								`Invalid ticket ID format: "${ticketId}". Ticket ID must be a numeric value.`,
							);
						}

						const body: IDataObject = {};

						// Add description, dueDate, priority, secondaryContacts
						if (updateFields.description !== undefined) {
							body.description = updateFields.description;
						}
						if (updateFields.dueDate !== undefined) {
							body.dueDate = updateFields.dueDate;
						}
						if (updateFields.priority !== undefined) {
							body.priority = updateFields.priority;
						}
						if (updateFields.secondaryContacts !== undefined) {
							const contacts = parseCommaSeparatedList(updateFields.secondaryContacts as string);
							if (contacts.length > 0) {
								body.secondaryContacts = contacts;
							}
						}

						// Add custom fields with enhanced error handling
						if (updateFields.cf !== undefined) {
							body.cf = parseCustomFields(updateFields.cf);
						}

						// Add other update fields
						addOptionalFields(body, updateFields, [
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
						]);

						// Handle tags with filtering of empty values
						if (updateFields.tags !== undefined) {
							const tags = parseCommaSeparatedList(updateFields.tags as string);
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
							uri: `${baseUrl}/tickets/${ticketId}`,
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
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
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
