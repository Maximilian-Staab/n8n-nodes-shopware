import { NodeOperationError } from 'n8n-workflow';
import { normalizeShopwareUrl, validateShopwareId } from '../../../v1/helpers/validation';

describe('validation helpers', () => {
	it('normalizes valid Shopware URLs', () => {
		expect(normalizeShopwareUrl('https://shop.example.com/')).toBe(
			'https://shop.example.com',
		);
	});

	it('rejects non-http protocols', () => {
		expect(() => normalizeShopwareUrl('ftp://shop.example.com')).toThrow(
			'Invalid Shopware URL: must start with http:// or https://',
		);
	});

	it('rejects malformed Shopware IDs', () => {
		expect(() =>
			validateShopwareId({ name: 'Test Node', type: 'test' } as never, '../../admin', 0, 'Order ID'),
		).toThrow(NodeOperationError);
	});
});
