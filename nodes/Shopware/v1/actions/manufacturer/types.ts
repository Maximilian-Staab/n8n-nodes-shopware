export interface ManufacturerCreatePayload {
	id?: string;
	name: string;
	link?: string;
	mediaId?: string;
	description?: string;
}

export type ManufacturerUpdatePayload = Partial<ManufacturerCreatePayload>;

export interface ManufacturerOption {
	id: string;
	name: string;
}
