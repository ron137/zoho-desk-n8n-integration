import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

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
						default: '{}',
						description: 'Custom fields as JSON object (e.g., {"cf_modelname": "F3 2017", "cf_phone": "123456"})',
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
					},
					{
						displayName: 'Custom Fields',
						name: 'cf',
						type: 'json',
						default: '{}',
						description: 'Custom fields as JSON object (e.g., {"cf_modelname": "F3 2017", "cf_phone": "123456"})',
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

				const response = await this.helpers.requestOAuth2.call(this, 'zohoDeskOAuth2Api', options);

				const departments = response.data || [];
				return departments.map((department: any) => ({
					name: department.name,
					value: department.id,
				}));
			},

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
					const response = await this.helpers.requestOAuth2.call(this, 'zohoDeskOAuth2Api', options);
					const teams = response.data || [];
					return teams.map((team: any) => ({
						name: team.name,
						value: team.id,
					}));
				} catch (error) {
					// If teams endpoint fails, return empty array
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

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'ticket') {
					const credentials = await this.getCredentials('zohoDeskOAuth2Api');
					const orgId = credentials.orgId as string;

					// Base URL from credentials or default
					const baseUrl = credentials.baseUrl || 'https://desk.zoho.com/api/v1';

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

						// Handle contact object
						if (contactData && contactData.contactValues) {
							const contactValues = contactData.contactValues as IDataObject;
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

						// Add description, dueDate, priority, secondaryContacts at top level
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
							body.secondaryContacts = (additionalFields.secondaryContacts as string)
								.split(',')
								.map(id => id.trim());
						}

						// Add custom fields
						if (additionalFields.cf) {
							try {
								body.cf = typeof additionalFields.cf === 'string'
									? JSON.parse(additionalFields.cf as string)
									: additionalFields.cf;
							} catch (error) {
								throw new Error('Custom fields must be valid JSON');
							}
						}

						// Add other additional fields
						if (additionalFields.accountId) {
							body.accountId = additionalFields.accountId;
						}
						if (additionalFields.assigneeId) {
							body.assigneeId = additionalFields.assigneeId;
						}
						if (additionalFields.category) {
							body.category = additionalFields.category;
						}
						if (additionalFields.channel) {
							body.channel = additionalFields.channel;
						}
						if (additionalFields.classification) {
							body.classification = additionalFields.classification;
						}
						if (additionalFields.email) {
							body.email = additionalFields.email;
						}
						if (additionalFields.language) {
							body.language = additionalFields.language;
						}
						if (additionalFields.phone) {
							body.phone = additionalFields.phone;
						}
						if (additionalFields.productId) {
							body.productId = additionalFields.productId;
						}
						if (additionalFields.resolution) {
							body.resolution = additionalFields.resolution;
						}
						if (additionalFields.status) {
							body.status = additionalFields.status;
						}
						if (additionalFields.subCategory) {
							body.subCategory = additionalFields.subCategory;
						}
						if (additionalFields.tags) {
							body.tags = (additionalFields.tags as string).split(',').map(tag => tag.trim());
						}
						if (additionalFields.teamId) {
							body.teamId = additionalFields.teamId;
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
							body.secondaryContacts = (updateFields.secondaryContacts as string)
								.split(',')
								.map(id => id.trim());
						}

						// Add custom fields
						if (updateFields.cf !== undefined) {
							try {
								body.cf = typeof updateFields.cf === 'string'
									? JSON.parse(updateFields.cf as string)
									: updateFields.cf;
							} catch (error) {
								throw new Error('Custom fields must be valid JSON');
							}
						}

						// Add other update fields
						if (updateFields.accountId !== undefined) {
							body.accountId = updateFields.accountId;
						}
						if (updateFields.assigneeId !== undefined) {
							body.assigneeId = updateFields.assigneeId;
						}
						if (updateFields.category !== undefined) {
							body.category = updateFields.category;
						}
						if (updateFields.channel !== undefined) {
							body.channel = updateFields.channel;
						}
						if (updateFields.classification !== undefined) {
							body.classification = updateFields.classification;
						}
						if (updateFields.contactId !== undefined) {
							body.contactId = updateFields.contactId;
						}
						if (updateFields.departmentId !== undefined) {
							body.departmentId = updateFields.departmentId;
						}
						if (updateFields.email !== undefined) {
							body.email = updateFields.email;
						}
						if (updateFields.language !== undefined) {
							body.language = updateFields.language;
						}
						if (updateFields.phone !== undefined) {
							body.phone = updateFields.phone;
						}
						if (updateFields.productId !== undefined) {
							body.productId = updateFields.productId;
						}
						if (updateFields.resolution !== undefined) {
							body.resolution = updateFields.resolution;
						}
						if (updateFields.status !== undefined) {
							body.status = updateFields.status;
						}
						if (updateFields.subCategory !== undefined) {
							body.subCategory = updateFields.subCategory;
						}
						if (updateFields.subject !== undefined) {
							body.subject = updateFields.subject;
						}
						if (updateFields.tags !== undefined) {
							body.tags = (updateFields.tags as string).split(',').map(tag => tag.trim());
						}
						if (updateFields.teamId !== undefined) {
							body.teamId = updateFields.teamId;
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
