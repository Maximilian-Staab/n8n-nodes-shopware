export interface NodeProductMedia {
	url: string;
	position: number;
	setAsCover: boolean;
}

export interface ProductCreatePayload {
	id?: string;
	parentId?: string;
	manufacturer?: { name: string };
	active?: boolean;
	displayGroup?: string;
	ratingAverage?: number;
	weight?: number;
	width?: number;
	height?: number;
	length?: number;
	productNumber: string;
	name: string;
	description?: string;
	availableStock?: number;
	stock: number;
	price: Array<{
		currencyId: string;
		gross: number;
		net: number;
		linked: boolean;
	}>;
	taxId: string;
	categories?: Array<{
		id: string;
		name: string;
	}>;
	visibilities?: Array<{
		salesChannelId: string;
		visibility: number;
	}>;
	media?: Array<{
		id: string;
		mediaId: string;
		position: number;
	}>;
	coverId?: string;
	ean?: string;
	createdAt?: string;
	updatedAt?: string;
}

export type ProductUpdatePayload = Partial<ProductCreatePayload>;

export type CurrencyOption = {
	id: string;
	name: string;
};

export type TaxOption = {
	id: string;
	name: string;
	taxRate: number;
};

export type NodePrice = {
	currency: string;
	grossPrice: number;
	autoCalculateNet: boolean;
	netPrice: number;
};
