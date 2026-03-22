import { NodeOperationError } from 'n8n-workflow';
import * as transport from '../../../v1/transport';
import {
	getDefaultCurrencyId,
	getLineItemDataBatch,
	getShippingMethodFullData,
	getShippingMethodData,
} from '../../../v1/helpers/utils';

jest.mock('../../../v1/transport', () => ({
	apiRequest: jest.fn(),
}));

const apiRequestMock = jest.mocked(transport.apiRequest);

function createExecuteContext() {
	return {
		getNode: () => ({ name: 'Test Node', type: 'test' }),
	} as never;
}

describe('utils helper error paths', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
	});

	it('throws a descriptive error when the default currency lookup is empty', async () => {
		apiRequestMock.mockResolvedValueOnce({ data: [] } as never);

		await expect(getDefaultCurrencyId.call(createExecuteContext())).rejects.toThrow(
			NodeOperationError,
		);
	});

	it('throws a descriptive error when a shipping method lacks a price for the selected currency', async () => {
		apiRequestMock.mockResolvedValueOnce({
			data: [
				{
					prices: [
						{
							currencyPrice: [{ currencyId: 'other-currency', net: 10 }],
						},
					],
					taxId: 'tax-id',
				},
			],
		} as never);

		await expect(
			getShippingMethodData.call(createExecuteContext(), 'shipping-id', 'currency-id'),
		).rejects.toThrow(NodeOperationError);
	});

	it('batches product and tax lookups for line item data', async () => {
		apiRequestMock
			.mockResolvedValueOnce({
				data: [
					{
						id: 'product-1',
						productNumber: 'P-1',
						name: 'Product 1',
						states: ['state-1'],
						price: [{ currencyId: 'currency-id', net: 10 }],
						taxId: 'tax-1',
					},
					{
						id: 'product-2',
						productNumber: 'P-2',
						name: 'Product 2',
						states: ['state-2'],
						price: [{ currencyId: 'currency-id', net: 20 }],
						taxId: 'tax-2',
					},
				],
			} as never)
			.mockResolvedValueOnce({
				data: [
					{ id: 'tax-1', taxRate: 7 },
					{ id: 'tax-2', taxRate: 19 },
				],
			} as never);

		const result = await getLineItemDataBatch.call(
			createExecuteContext(),
			['P-1', 'P-2', 'P-1'],
			'currency-id',
			0,
		);

		expect(apiRequestMock).toHaveBeenCalledTimes(2);
		expect(result.get('P-1')).toEqual({
			identifier: 'product-1',
			productId: 'product-1',
			label: 'Product 1',
			states: ['state-1'],
			unitPrice: 10,
			taxRate: 7,
		});
		expect(result.get('P-2')).toEqual({
			identifier: 'product-2',
			productId: 'product-2',
			label: 'Product 2',
			states: ['state-2'],
			unitPrice: 20,
			taxRate: 19,
		});
	});

	it('loads shipping price, delivery time, and tax data from a consolidated helper path', async () => {
		apiRequestMock
			.mockResolvedValueOnce({
				data: [
					{
						prices: [
							{
								currencyPrice: [{ currencyId: 'currency-id', net: 12 }],
							},
						],
						taxId: 'tax-1',
						deliveryTime: {
							min: 1,
							max: 3,
							unit: 'day',
						},
					},
				],
			} as never)
			.mockResolvedValueOnce({
				data: [{ id: 'tax-1', taxRate: 19 }],
			} as never);

		const result = await getShippingMethodFullData.call(
			createExecuteContext(),
			'shipping-id',
			'currency-id',
		);

		expect(apiRequestMock).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			unitPrice: 12,
			taxRate: 19,
			deliveryTime: {
				min: 1,
				max: 3,
				unit: 'day',
			},
		});
	});
});
