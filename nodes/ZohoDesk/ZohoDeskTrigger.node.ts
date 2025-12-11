import type {
  IPollFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IDataObject,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from 'n8n-workflow';

/**
 * Default Zoho Desk API base URL
 */
const DEFAULT_BASE_URL = 'https://desk.zoho.com/api/v1';

/**
 * Interface for tracking poll state between executions
 */
interface ZohoDeskPollState {
  /** Timestamp of last successful poll */
  lastPollTime?: number;
  /** IDs of items seen in last poll to prevent duplicates */
  lastSeenIds?: string[];
}

/**
 * Zoho Desk Trigger Node
 * Polls Zoho Desk API for new or updated tickets, contacts, and accounts
 */
export class ZohoDeskTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Zoho Desk Trigger',
    name: 'zohoDeskTrigger',
    icon: 'file:zohoDesk.png',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["event"]}}',
    description: 'Triggers when tickets, contacts, or accounts are created or updated in Zoho Desk',
    defaults: {
      name: 'Zoho Desk Trigger',
    },
    credentials: [
      {
        name: 'zohoDeskOAuth2Api',
        required: true,
      },
    ],
    polling: true,
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Event',
        name: 'event',
        type: 'options',
        options: [
          {
            name: 'Account Updated',
            value: 'accountUpdated',
            description: 'Triggers when an existing account is updated',
          },
          {
            name: 'Contact Updated',
            value: 'contactUpdated',
            description: 'Triggers when an existing contact is updated',
          },
          {
            name: 'New Account',
            value: 'newAccount',
            description: 'Triggers when a new account is created',
          },
          {
            name: 'New Contact',
            value: 'newContact',
            description: 'Triggers when a new contact is created',
          },
          {
            name: 'New Ticket',
            value: 'newTicket',
            description: 'Triggers when a new ticket is created',
          },
          {
            name: 'Ticket Updated',
            value: 'ticketUpdated',
            description: 'Triggers when an existing ticket is updated',
          },
        ],
        default: 'newTicket',
        required: true,
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
          'Filter tickets by department. Leave empty to get tickets from all departments. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        displayOptions: {
          show: {
            event: ['newTicket', 'ticketUpdated'],
          },
        },
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Include',
            name: 'include',
            type: 'multiOptions',
            options: [
              {
                name: 'Contacts',
                value: 'contacts',
                description: 'Include contact details in the response',
              },
              {
                name: 'Products',
                value: 'products',
                description: 'Include product details in the response',
              },
              {
                name: 'Departments',
                value: 'departments',
                description: 'Include department details in the response',
              },
              {
                name: 'Assignee',
                value: 'assignee',
                description: 'Include assignee details in the response',
              },
            ],
            default: [],
            description: 'Additional data to include in the response',
            displayOptions: {
              show: {
                '/event': ['newTicket', 'ticketUpdated'],
              },
            },
          },
          {
            displayName: 'Limit',
            name: 'limit',
            type: 'number',
            default: 50,
            description: 'Max number of results to return',
            typeOptions: {
              minValue: 1,
            },
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      /**
       * Load departments from Zoho Desk for dropdown selection
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

          if (
            !response ||
            typeof response !== 'object' ||
            !('data' in response) ||
            !Array.isArray(response.data)
          ) {
            return [];
          }

          return (response.data as Array<{ id: string; name: string }>).map((dept) => ({
            name: dept.name,
            value: dept.id,
          }));
        } catch (error) {
          return [];
        }
      },
    },
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const event = this.getNodeParameter('event') as string;
    const options = this.getNodeParameter('options', {}) as IDataObject;
    const limit = (options.limit as number) || 50;

    // Get credentials
    const credentials = await this.getCredentials('zohoDeskOAuth2Api');
    const orgId = credentials.orgId as string;
    const baseUrl = (credentials.baseUrl as string | undefined) || DEFAULT_BASE_URL;

    // Get workflow static data for state tracking
    const staticData = this.getWorkflowStaticData('node') as ZohoDeskPollState;

    // Initialize state if first run
    const isFirstRun = staticData.lastPollTime === undefined;
    const lastPollTime = staticData.lastPollTime || Date.now() - 60000; // Default to 1 minute ago
    const lastSeenIds = staticData.lastSeenIds || [];

    // Determine endpoint and time field based on event type
    let endpoint: string;
    let timeField: string;
    let sortField: string;

    switch (event) {
      case 'newTicket':
        endpoint = '/tickets';
        timeField = 'createdTime';
        sortField = 'createdTime';
        break;
      case 'ticketUpdated':
        endpoint = '/tickets';
        timeField = 'modifiedTime';
        sortField = 'modifiedTime';
        break;
      case 'newContact':
        endpoint = '/contacts';
        timeField = 'createdTime';
        sortField = 'createdTime';
        break;
      case 'contactUpdated':
        endpoint = '/contacts';
        timeField = 'modifiedTime';
        sortField = 'modifiedTime';
        break;
      case 'newAccount':
        endpoint = '/accounts';
        timeField = 'createdTime';
        sortField = 'createdTime';
        break;
      case 'accountUpdated':
        endpoint = '/accounts';
        timeField = 'modifiedTime';
        sortField = 'modifiedTime';
        break;
      default:
        endpoint = '/tickets';
        timeField = 'createdTime';
        sortField = 'createdTime';
    }

    // Build query parameters
    const queryParams: IDataObject = {
      limit: limit,
      sortBy: sortField,
    };

    // Add department filter for ticket events
    if (
      (event === 'newTicket' || event === 'ticketUpdated') &&
      this.getNodeParameter('departmentId', '') !== ''
    ) {
      queryParams.departmentId = this.getNodeParameter('departmentId') as string;
    }

    // Add include parameter for tickets
    if ((event === 'newTicket' || event === 'ticketUpdated') && options.include) {
      const includes = options.include as string[];
      if (includes.length > 0) {
        queryParams.include = includes.join(',');
      }
    }

    // Convert last poll time to ISO string for time range filter
    const fromTime = new Date(lastPollTime).toISOString();

    // Use modifiedTimeRange or createdTimeRange based on event type
    if (event.includes('Updated')) {
      queryParams.modifiedTimeRange = fromTime;
    }

    try {
      // Build query string
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

      const requestOptions = {
        method: 'GET',
        headers: {
          orgId: orgId,
        },
        uri: `${baseUrl}${endpoint}?${queryString}`,
        json: true,
      };

      const response = await this.helpers.requestOAuth2.call(
        this,
        'zohoDeskOAuth2Api',
        requestOptions,
      );

      // Parse response
      const items: IDataObject[] = [];
      if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        Array.isArray(response.data)
      ) {
        items.push(...(response.data as IDataObject[]));
      }

      // Filter out items we've already seen and items from before last poll
      const newItems = items.filter((item) => {
        const itemId = item.id as string;
        const itemTime = new Date(item[timeField] as string).getTime();

        // Skip if we've already seen this item
        if (lastSeenIds.includes(itemId)) {
          return false;
        }

        // For first run, only include items from the last minute
        // For subsequent runs, include items created/modified after last poll
        if (isFirstRun) {
          return itemTime >= lastPollTime;
        }

        return itemTime > lastPollTime;
      });

      // Update state for next poll
      const now = Date.now();
      staticData.lastPollTime = now;
      staticData.lastSeenIds = newItems.map((item) => item.id as string);

      // Return null if no new items (n8n convention for empty polls)
      if (newItems.length === 0) {
        return null;
      }

      // Format items for n8n output
      const returnData: INodeExecutionData[] = newItems.map((item) => ({
        json: item,
      }));

      return [returnData];
    } catch (error) {
      // On first run, don't throw error - just initialize state
      if (isFirstRun) {
        staticData.lastPollTime = Date.now();
        staticData.lastSeenIds = [];
        return null;
      }

      // Re-throw error for subsequent runs
      throw error;
    }
  }
}
