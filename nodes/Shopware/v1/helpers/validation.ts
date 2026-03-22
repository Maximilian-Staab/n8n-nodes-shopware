import { NodeOperationError, type INode } from 'n8n-workflow';

const SHOPWARE_ID_PATTERN = /^[0-9a-f]{32}$/i;

export function normalizeShopwareUrl(url: string): string {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(url);
	} catch {
		throw new Error('Invalid Shopware URL: must be a valid http:// or https:// URL');
	}

	if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
		throw new Error('Invalid Shopware URL: must start with http:// or https://');
	}

	return parsedUrl.toString().replace(/\/$/, '');
}

export function validateShopwareId(
	node: INode,
	id: string,
	itemIndex: number,
	fieldLabel: string,
): string {
	if (!SHOPWARE_ID_PATTERN.test(id)) {
		throw new NodeOperationError(node, 'Invalid ID format', {
			description: `${fieldLabel} must be a 32-character hexadecimal Shopware ID`,
			itemIndex,
		});
	}

	return id;
}
