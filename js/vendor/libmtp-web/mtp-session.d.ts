import type { MtpEmscriptenModule } from './mtp-module.js';
/** Folder id under which MTP exposes a storage's root-level contents. */
export declare const MTP_ROOT_FOLDER_ID = 4294967295;
export interface MtpDeviceSummary {
    friendlyName: string;
    modelName: string;
    /** Device advertises ranged reads (PTP GetPartialObject). */
    supportsRangeReads: boolean;
    /** Device advertises ranged writes (the Android SendPartialObject extension libmtp uses). */
    supportsRangeWrites: boolean;
}
export interface MtpStorageInfo {
    storageId: number;
    name: string;
}
export interface MtpEntryInfo {
    id: number;
    name: string;
    isFolder: boolean;
    /** Size in bytes; 0 for folders. */
    size: number;
    /** Epoch milliseconds; 0 when the device reports no timestamp. */
    modificationTimeMs: number;
}
export interface MtpFileRef {
    id: number;
    name: string;
    /** Total bytes; bounds the ranged pump's loop. */
    size: number;
}
export interface MtpSessionOpenOptions {
    isVerboseLogging: boolean;
    wasmUrl?: string | URL;
    /** Overall deadline for detect + open + the first storage walk; defaults to 30000. */
    openTimeoutMs?: number;
}
export declare class MtpSession {
    readonly device: MtpDeviceSummary;
    readonly storages: MtpStorageInfo[];
    private readonly mtp;
    private readonly devicePointer;
    private readonly usbDevice;
    private isClosed;
    private isAborted;
    private disconnectError;
    private deviceQueue;
    private constructor();
    /** Loads the wasm module and opens the first paired device; always settles within openTimeoutMs. */
    static open(options: MtpSessionOpenOptions): Promise<MtpSession>;
    /**
     * Releases the device; all subsequent operations reject with MtpSessionClosedError.
     * A graceful release that exceeds 10 s falls back to closing the USB device directly.
     */
    close(): Promise<void>;
    /**
     * Hard-releases a wedged device, resetting it when needed, so a fresh
     * requestMtpFileSystem() recovers without replugging. Never rejects; all
     * handles become unusable.
     */
    abort(): Promise<void>;
    listChildren(storageId: number, folderId: number): Promise<MtpEntryInfo[]>;
    /** Streams the whole object with backpressure; memory stays bounded by READ_WINDOW_BYTES. */
    readFileStream(file: MtpFileRef): Promise<ReadableStream<Uint8Array>>;
    /** Reads one range; empty when it starts at/past end-of-file. */
    readFileRange(file: Pick<MtpFileRef, 'id' | 'name'>, offset: number, length: number): Promise<Uint8Array>;
    /** Uploads a stream as a new child object, replacing any same-named file. Returns the new object id. */
    writeFileStream(storageId: number, folderId: number, fileName: string, totalBytes: number, contents: ReadableStream<Uint8Array>): Promise<number>;
    /** Returns the new folder's object id. */
    createFolder(storageId: number, folderId: number, name: string): Promise<number>;
    /** Deletes one object (file or empty directory). */
    deleteObject(objectId: number, name: string): Promise<void>;
    private readonly onUsbDisconnect;
    private assertOpen;
    private serialize;
    private pumpFileContents;
    private fetchFileRange;
    private readWholeObjectAsStream;
    private performWriteFileStream;
    /** Makes writes replace: a same-named file is deleted first so re-uploads don't duplicate. */
    private removeExistingChildWithName;
    private scanChildren;
}
/** Loads (and caches) the wasm module without opening a device; MtpSession.open and mtpDeviceFilters() share it. */
export declare function loadMtpModule(wasmUrl?: string | URL): Promise<MtpEmscriptenModule>;
