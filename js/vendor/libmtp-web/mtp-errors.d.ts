declare abstract class NamedError extends Error {
    /** PTP response code (e.g. 0x2009) when the device reported one; absent for transport-level failures. */
    readonly code?: number;
    constructor(message: string, code?: number);
}
export declare class MtpDeviceNotFoundError extends NamedError {
}
export declare class MtpOpenError extends NamedError {
}
export declare class MtpFileReadError extends NamedError {
}
export declare class MtpWriteError extends NamedError {
}
export declare class MtpSessionClosedError extends NamedError {
}
/** The device was unplugged mid-session; permanent until a new requestMtpFileSystem(). */
export declare class MtpDeviceDisconnectedError extends NamedError {
}
/** The device reports the object handle is gone (deleted on-device, PTP 0x2009); permanent, do not retry. */
export declare class MtpObjectNotFoundError extends NamedError {
}
export {};
