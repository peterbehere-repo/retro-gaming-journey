/** The MTP/PTP still-image interface triple. */
export declare const MTP_INTERFACE_FILTER: USBDeviceFilter;
export interface MtpDeviceFiltersOptions {
    /** URL of dist/mtp.wasm; relative strings resolve against the page URL. Defaults to the module-relative copy bundlers emit. */
    wasmUrl?: string | URL;
}
/**
 * Filters covering every device libmtp can open; pass to
 * navigator.usb.requestDevice. Loads the wasm module (cached for the later
 * open), so compute these before the user gesture that opens the picker.
 */
export declare function mtpDeviceFilters(options?: MtpDeviceFiltersOptions): Promise<USBDeviceFilter[]>;
