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
 * Extracts the file extension from a URL.
 */
function parseExtension(url: string): string {
	const pathname = new URL(url).pathname;
	const lastSegment = pathname.split('/').pop() || '';
	const dotIndex = lastSegment.lastIndexOf('.');

	if (dotIndex === -1) {
		return 'jpg';
	}

	return lastSegment.substring(dotIndex + 1).toLowerCase();
}

/**
 * Uploads media items from URLs to Shopware and returns product_media associations.
 *
 * Shopware media upload flow:
 * 1. Create a media entity: POST /api/media with { id }
 * 2. Upload the file: POST /api/_action/media/{mediaId}/upload?extension=ext
 * 3. Return product_media association entries with { id: productMediaId, mediaId, position }
 *
 * @param nodeMedia - Array of media items with URL, position, and cover flag
 * @returns Object with media associations array and optional coverId
 */
export async function uploadProductMedia(
	this: IExecuteFunctions,
	nodeMedia: NodeProductMedia[],
): Promise<UploadedMedia> {
	const media: UploadedMedia['media'] = [];
	let coverId: string | null = null;

	for (const item of nodeMedia) {
		const mediaId = uuidv7();
		const productMediaId = uuidv7();
		const extension = parseExtension(item.url);

		await apiRequest.call(this, 'POST', `/media`, { id: mediaId });

		await apiRequest.call(
			this,
			'POST',
			`/_action/media/${mediaId}/upload`,
			{ url: item.url } as Record<string, string>,
			{ extension },
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
