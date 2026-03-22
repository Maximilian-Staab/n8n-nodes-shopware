import { NodeOperationError } from 'n8n-workflow';
import * as transport from '../../../v1/transport';
import { getDefaultCurrencyId, getShippingMethodData } from '../../../v1/helpers/utils';

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
});
