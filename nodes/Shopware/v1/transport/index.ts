import type {
	IDataObject,
	IExecuteFunctions,
	IPollFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { normalizeShopwareUrl } from '../helpers/validation';

interface ShopwareApiError {
	status: string;
	code: string;
	title: string;
	detail: string;
	meta?: { parameters: Record<string, string> };
}

/**
 * Extracts a user-friendly message and description from a Shopware API error response.
 */
function parseShopwareError(error: unknown): { message: string; description: string } | null {
	const err = error as { context?: { data?: { errors?: ShopwareApiError[] } } };
	const errors = err?.context?.data?.errors;

	if (!errors || errors.length === 0) {
		return null;
	}

	const first = errors[0];
	return {
		message: `Shopware API error: ${first.title} (${first.code})`,
		description: first.detail,
	};
}

/**
 * Generic request wrapper for Shopware API.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param endpoint - Shopware API endpoint, starting with `/`
 * @param [body] - Optional request body
 * @param [qs] - Optional query string params
 * @returns A promise that resolves to a parsed JSON response from Shopware
 * @throws NodeApiError when the request fails
 */
export async function apiRequest<T extends object = IDataObject>(
	this: IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: T = {} as T,
	query?: IDataObject,
	option: IDataObject = {},
) {
	const credentials = await this.getCredentials('shopwareOAuth2Api');
	const baseUrl = normalizeShopwareUrl(credentials.url as string);

	query = query || {};

	const options: IHttpRequestOptions = {
		headers: {},
		method,
		body: body as unknown as IDataObject,
		qs: query,
		url: `${baseUrl}/api${endpoint}`,
		json: true,
	};

	if (Object.keys(option).length !== 0) {
		Object.assign(options, option);
	}

	if (Object.keys(body).length === 0) {
		delete options.body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'shopwareOAuth2Api', options);
	} catch (error) {
		const shopwareError = parseShopwareError(error);
		if (shopwareError) {
			throw new NodeApiError(this.getNode(), error as JsonObject, shopwareError);
		}
		throw error;
	}
}
