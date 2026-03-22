import type { IExecuteFunctions } from 'n8n-workflow';
import type { NodeProductMedia } from '../actions/product/types';
import { apiRequest } from '../transport';
import { uuidv7 } from './utils';

interface UploadedMedia {
	media: Array<{
		id: string;
		mediaId: string;
		position: number;
	}>;
	coverId: string | null;
}

/**
 * Extracts file name and extension from a URL.
 */
function parseMediaUrl(url: string): { fileName: string; extension: string } {
	const pathname = new URL(url).pathname;
	const lastSegment = pathname.split('/').pop() || 'image.jpg';
	const dotIndex = lastSegment.lastIndexOf('.');

	if (dotIndex === -1) {
		return { fileName: lastSegment, extension: 'jpg' };
	}

	return {
		fileName: lastSegment.substring(0, dotIndex),
		extension: lastSegment.substring(dotIndex + 1).toLowerCase(),
	};
}

/**
 * Uploads media items from URLs to Shopware and returns product_media associations.
 *
 * Shopware media upload flow:
 * 1. Create a media entity: POST /api/media with { id }
 * 2. Upload the file: POST /api/_action/media/{mediaId}/upload?extension=ext&fileName=name
 * 3. Return product_media association entries with { id: productMediaId, mediaId, position }
 *
 * @param nodeMedia - Array of media items with URL, position, and cover flag
 * @param productId - Optional existing product ID (for update operations, used to deduplicate file names)
 * @returns Object with media associations array and optional coverId
 */
export async function uploadProductMedia(
	this: IExecuteFunctions,
	nodeMedia: NodeProductMedia[],
	productId?: string,
): Promise<UploadedMedia> {
	const media: UploadedMedia['media'] = [];
	let coverId: string | null = null;

	for (const item of nodeMedia) {
		const mediaId = uuidv7();
		const productMediaId = uuidv7();
		const { fileName, extension } = parseMediaUrl(item.url);

		const uniqueFileName = productId
			? `${fileName}-${productId.substring(0, 8)}-${mediaId.substring(0, 8)}`
			: `${fileName}-${mediaId.substring(0, 8)}`;

		await apiRequest.call(this, 'POST', `/media`, { id: mediaId });

		await apiRequest.call(
			this,
			'POST',
			`/_action/media/${mediaId}/upload`,
			{ url: item.url } as Record<string, string>,
			{ extension, fileName: uniqueFileName },
		);

		media.push({
			id: productMediaId,
			mediaId,
			position: item.position,
		});

		if (item.setAsCover) {
			coverId = productMediaId;
		}
	}

	return { media, coverId };
}
