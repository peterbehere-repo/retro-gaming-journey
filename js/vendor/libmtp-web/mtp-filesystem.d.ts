/**
 * File System Access API-shaped facade over an MtpSession. MTP deviations:
 * { create: true } files appear on the device at writable close,
 * createWritable({ size }) streams while an omitted size buffers, and
 * seek/truncate/positional writes reject (MTP sizes objects before the first
 * byte flows).
 */
import { MtpSession, type MtpDeviceSummary } from './mtp-session.js';
export interface RequestMtpFileSystemOptions {
    /** URL of dist/mtp.wasm; relative strings resolve against the page URL. Defaults to the module-relative copy bundlers emit. */
    wasmUrl?: string | URL;
    /** Defaults to false; enables libmtp and WebUSB trace logging in the console. */
    isVerboseLogging?: boolean;
    /** Overall deadline for loading the module, detecting, and opening the device; defaults to 30000. */
    openTimeoutMs?: number;
}
/** Opens the first paired device; the returned file system holds it open until close(). */
export declare function requestMtpFileSystem(options?: RequestMtpFileSystemOptions): Promise<MtpFileSystem>;
export declare class MtpFileSystem {
    readonly name: string;
    readonly device: MtpDeviceSummary;
    readonly root: MtpDirectoryHandle;
    readonly session: MtpSession;
    constructor(session: MtpSession);
    /** Releases the device; all handles become unusable. */
    close(): Promise<void>;
    /** Hard-releases a wedged device so a fresh requestMtpFileSystem() recovers without replugging. */
    abort(): Promise<void>;
}
export type MtpHandle = MtpFileHandle | MtpDirectoryHandle;
declare abstract class MtpHandleBase implements FileSystemHandle {
    abstract readonly kind: 'file' | 'directory';
    readonly name: string;
    readonly fullPath: string;
    protected readonly filesystem: MtpFileSystem;
    protected constructor(filesystem: MtpFileSystem, name: string, fullPath: string);
    queryPermission(): Promise<PermissionState>;
    requestPermission(): Promise<PermissionState>;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
}
export declare class MtpDirectoryHandle extends MtpHandleBase implements FileSystemDirectoryHandle {
    readonly kind: "directory";
    /** Null on the device root, whose children are the storages. */
    private readonly storageId;
    /** MTP folder id; MTP_ROOT_FOLDER_ID on a storage's root. */
    private readonly folderId;
    constructor(filesystem: MtpFileSystem, storageId: number | null, folderId: number, name: string, fullPath: string);
    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<MtpFileHandle>;
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<MtpDirectoryHandle>;
    /** Fails with MtpWriteError when a non-empty directory is removed without { recursive: true }. */
    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    entries(): AsyncIterableIterator<[string, MtpHandle]>;
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<MtpHandle>;
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, MtpHandle]>;
    /** Uploads contents as this directory's child file, replacing any same-named file. */
    writeChildFileStream(name: string, totalBytes: number, contents: ReadableStream<Uint8Array>): Promise<{
        id: number;
        size: number;
    }>;
    private projectChildren;
    private listChildren;
    private findChild;
    private childHandle;
    private childFileHandle;
    private childDirectoryHandle;
    /** The device root only lists storages; real entries live inside them. */
    private assertWritableDirectory;
    private removeRecursively;
}
export declare class MtpFileHandle extends MtpHandleBase implements FileSystemFileHandle {
    readonly kind: "file";
    private readonly parentDirectory;
    /** Null until the first writable stream closes, for handles created with { create: true }. */
    private fileId;
    private readonly lastModifiedMs;
    /** Bytes as last listed; the session's ranged pump delivers exactly this count. */
    private sizeBytes;
    constructor(filesystem: MtpFileSystem, parentDirectory: MtpDirectoryHandle, fileId: number | null, name: string, fullPath: string, lastModifiedMs: number, sizeBytes: number);
    /** Bytes as of the listing that produced this handle; moves to the uploaded count after a writable close. */
    get size(): number;
    /** Epoch milliseconds as of the listing that produced this handle. */
    get lastModified(): number;
    /** Rejects with NotFoundError for handles created with { create: true } until the first writable stream closes. */
    getFile(): Promise<File>;
    /**
     * Streams the object chunk-by-chunk with backpressure; memory stays bounded
     * regardless of size.
     */
    createReadable(): Promise<ReadableStream<Uint8Array>>;
    /**
     * Reads an arbitrary byte range; repeatable and order-independent. Rejects
     * NotSupportedError unless device.supportsRangeReads. Ranges starting at or
     * past end-of-file return empty; offsets address the first 4 GiB (the PTP
     * op libmtp sends is 32-bit). The response materializes in full, so length
     * is the caller's memory budget.
     */
    readRange(offset: number, length: number): Promise<Uint8Array>;
    /**
     * Uploads written bytes as this file on close(), replacing any same-named
     * object. { size } starts a streaming upload with backpressure; without it
     * content buffers until close(). { keepExistingData: true } prefixes the
     * current content, streamed from the device rather than buffered.
     */
    createWritable(options?: FileSystemCreateWritableOptions & {
        size?: number;
    }): Promise<FileSystemWritableFileStream>;
    createSyncAccessHandle(_options?: FileSystemCreateWritableOptions): Promise<never>;
    private fileRef;
    private uploadStreamed;
}
export interface MtpUploadTarget {
    uploadStreamed(contents: ReadableStream<Uint8Array>, totalBytes: number): Promise<void>;
}
/** Prefix for keepExistingData uploads; the existing object streams in rather than buffering. */
export interface MtpWritableSeed {
    stream: ReadableStream<Uint8Array>;
    /** Declared byte count: SendObjectInfo needs the total before the first byte flows. */
    size: number;
}
/**
 * A real WritableStream piping write() chunks to the device as one object.
 * A declared totalSize caps queued bytes at STREAM_WINDOW_BYTES and uploads
 * concurrently; without one the bytes queue in memory and upload at close().
 */
export declare class MtpWritableFileStream extends WritableStream<FileSystemWriteChunkType> implements FileSystemWritableFileStream {
    private readonly target;
    private readonly pipe;
    private readonly writer;
    /** Non-null when the upload runs concurrently with writes. */
    private readonly streamingUpload;
    /** Pumps the seed ahead of user writes; failures surface on the next write()/close(). */
    private readonly seedPump;
    private seedReader;
    private queuedBytes;
    private isSettled;
    private isAborted;
    constructor(options: {
        seed?: MtpWritableSeed;
        totalSize?: number;
        target: MtpUploadTarget;
    });
    write(data: FileSystemWriteChunkType): Promise<void>;
    seek(_position: number): Promise<void>;
    truncate(_size: number): Promise<void>;
    close(): Promise<void>;
    /** User writes wait for the seed so its chunks enqueue first. */
    private writeSnapshot;
    private pumpSeed;
    private writePart;
    private finish;
    private discard;
    private assertWritable;
    /** Keeps a concurrent-upload rejection unobserved until finish() rethrows it or the pipe surfaces it. */
    private captureUpload;
}
export {};
