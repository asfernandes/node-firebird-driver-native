import { AttachmentImpl } from './attachment';

import { Blob } from 'node-firebird-driver';
import { AbstractBlobStream, blobInfo, getPortableInteger } from 'node-firebird-driver/dist/lib/impl';

import * as fb from 'node-firebird-native-api';
import { TransactionImpl } from './transaction';


/** BlobStream implementation. */
export class BlobStreamImpl extends AbstractBlobStream {
	// Override declarations.
	attachment: AttachmentImpl;

	blobHandle?: fb.Blob;

	static async create(attachment: AttachmentImpl, transaction: TransactionImpl): Promise<BlobStreamImpl> {
		return await attachment.client.statusAction(async status => {
			const blobId = new Uint8Array(8);
			const blobHandle = await attachment.attachmentHandle!.createBlobAsync(
				status, transaction.transactionHandle, blobId, 0, undefined);

			const blob = new Blob(attachment, blobId);

			const blobStream = new BlobStreamImpl(blob, attachment);
			blobStream.blobHandle = blobHandle;
			return blobStream;
		});
	}

	static async open(attachment: AttachmentImpl, transaction: TransactionImpl, blob: Blob): Promise<BlobStreamImpl> {
		return await attachment.client.statusAction(async status => {
			const blobStream = new BlobStreamImpl(blob, attachment);
			blobStream.blobHandle = await attachment.attachmentHandle!.openBlobAsync(
				status, transaction.transactionHandle, blob.id, 0, undefined);
			return blobStream;
		});
	}

	protected async internalGetLength(): Promise<number> {
		return await this.attachment.client.statusAction(async status => {
			const infoReq = new Uint8Array([blobInfo.totalLength]);
			const infoRet = new Uint8Array(20);
			await this.blobHandle!.getInfoAsync(status, infoReq.byteLength, infoReq, infoRet.byteLength, infoRet);

			if (infoRet[0] != blobInfo.totalLength || infoRet[1] != 4 || infoRet[2] != 0)
				throw new Error('Unrecognized response from Blob::getInfo.');

			return getPortableInteger(infoRet.subarray(3), 4);
		});
	}

	protected async internalClose(): Promise<void> {
		await this.attachment.client.statusAction(status => this.blobHandle!.closeAsync(status));
		this.blobHandle = undefined;
	}

	protected async internalCancel(): Promise<void> {
		await this.attachment.client.statusAction(status => this.blobHandle!.cancelAsync(status));
		this.blobHandle = undefined;
	}

	protected async internalRead(buffer: Buffer): Promise<number> {
		return await this.attachment.client.statusAction(async status => {
			const segLength = new Uint32Array(1);
			const result = await this.blobHandle!.getSegmentAsync(status, buffer.length, buffer, segLength);

			if (result == fb.Status.RESULT_NO_DATA)
				return -1;

			return segLength[0];
		});
	}

	protected async internalWrite(buffer: Buffer): Promise<void> {
		await this.attachment.client.statusAction(status => this.blobHandle!.putSegmentAsync(status, buffer.length, buffer));
	}
}
