// build/generated/mtp.js
async function createMtpModule(moduleArg = {}) {
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = true;
  var ENVIRONMENT_IS_WORKER = false;
  var programArgs = [];
  var thisProgram = "./this.program";
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      readAsync = async (url) => {
        var response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      };
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var wasmBinary;
  var ABORT = false;
  class EmscriptenEH {
  }
  class EmscriptenSjLj extends EmscriptenEH {
  }
  var runtimeInitialized = false;
  function getMemoryBuffer() {
    return wasmMemory.buffer;
  }
  function updateMemoryViews() {
    if (HEAP8?.buffer?.resizable) return;
    var b = getMemoryBuffer();
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }
  function preRun() {
    var preRun2 = Module["preRun"];
    if (preRun2) {
      if (typeof preRun2 == "function") preRun2 = [preRun2];
      onPreRuns.push(...preRun2);
    }
    callRuntimeCallbacks(onPreRuns);
  }
  function initRuntime() {
    runtimeInitialized = true;
    wasmExports["__wasm_call_ctors"]();
  }
  function postRun() {
    var postRun2 = Module["postRun"];
    if (postRun2) {
      if (typeof postRun2 == "function") postRun2 = [postRun2];
      onPostRuns.push(...postRun2);
    }
    callRuntimeCallbacks(onPostRuns);
  }
  function abort(what) {
    Module["onAbort"]?.(what);
    what = `Aborted(${what})`;
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    throw e;
  }
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("mtp.wasm");
    }
    return new URL("mtp.wasm", import.meta.url).href;
  }
  function getBinarySync(file) {
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile);
      var instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary) {
      try {
        var response = fetch(binaryFile, { credentials: "same-origin" });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  function getWasmImports() {
    Asyncify.instrumentWasmImports(wasmImports);
    var imports = { env: wasmImports, wasi_snapshot_preview1: wasmImports };
    return imports;
  }
  async function createWasm() {
    function receiveInstance(instance) {
      wasmExports = instance.exports;
      wasmExports = Asyncify.instrumentWasmExports(wasmExports);
      assignWasmExports(wasmExports);
      updateMemoryViews();
      return wasmExports;
    }
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"]);
    }
    var info = getWasmImports();
    var instantiateWasm = Module["instantiateWasm"];
    if (instantiateWasm) {
      return new Promise((resolve) => {
        instantiateWasm(info, (inst) => resolve(receiveInstance(inst)));
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var HEAP16;
  var HEAP32;
  var HEAP64;
  var HEAP8;
  var HEAPF32;
  var HEAPF64;
  var HEAPU16;
  var HEAPU32;
  var HEAPU64;
  var HEAPU8;
  var callRuntimeCallbacks = (callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  };
  var onPostRuns = [];
  var onPreRuns = [];
  var noExitRuntime = true;
  var stackRestore = (val) => __emscripten_stack_restore(val);
  var stackSave = () => _emscripten_stack_get_current();
  var isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var ydayFromDate = (date) => {
    var leap = isLeapYear(date.getFullYear());
    var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
    var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
    return yday;
  };
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
  function __localtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
    var date = new Date(time * 1e3);
    if (isNaN(date.getTime())) {
      return 1;
    }
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getHours();
    HEAP32[tmPtr + 12 >> 2] = date.getDate();
    HEAP32[tmPtr + 16 >> 2] = date.getMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getDay();
    var yday = ydayFromDate(date) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday;
    HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
    var start = new Date(date.getFullYear(), 0, 1);
    var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[tmPtr + 32 >> 2] = dst;
    return 0;
  }
  var __mktime_js = function(tmPtr) {
    var ret = (() => {
      var date = new Date(HEAP32[tmPtr + 20 >> 2] + 1900, HEAP32[tmPtr + 16 >> 2], HEAP32[tmPtr + 12 >> 2], HEAP32[tmPtr + 8 >> 2], HEAP32[tmPtr + 4 >> 2], HEAP32[tmPtr >> 2], 0);
      if (isNaN(date.getTime())) {
        return -1;
      }
      var dst = HEAP32[tmPtr + 32 >> 2];
      var guessedOffset = date.getTimezoneOffset();
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dstOffset = Math.min(winterOffset, summerOffset);
      if (dst < 0) {
        dst = Number(summerOffset != winterOffset && dstOffset == guessedOffset);
      } else if (dst > 0 != (dstOffset == guessedOffset)) {
        var nonDstOffset = Math.max(winterOffset, summerOffset);
        var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
        date.setTime(date.getTime() + (trueOffset - guessedOffset) * 6e4);
        if (isNaN(date.getTime())) {
          return -1;
        }
      }
      HEAP32[tmPtr + 32 >> 2] = dst;
      HEAP32[tmPtr + 24 >> 2] = date.getDay();
      var yday = ydayFromDate(date) | 0;
      HEAP32[tmPtr + 28 >> 2] = yday;
      HEAP32[tmPtr >> 2] = date.getSeconds();
      HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
      HEAP32[tmPtr + 8 >> 2] = date.getHours();
      HEAP32[tmPtr + 12 >> 2] = date.getDate();
      HEAP32[tmPtr + 16 >> 2] = date.getMonth();
      HEAP32[tmPtr + 20 >> 2] = date.getYear();
      return date.getTime() / 1e3;
    })();
    return BigInt(ret);
  };
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.codePointAt(i);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
    var currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    var winter = new Date(currentYear, 0, 1);
    var summer = new Date(currentYear, 6, 1);
    var winterOffset = winter.getTimezoneOffset();
    var summerOffset = summer.getTimezoneOffset();
    var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
    HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
    HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
    var extractZone = (timezoneOffset) => {
      var sign = timezoneOffset >= 0 ? "-" : "+";
      var absOffset = Math.abs(timezoneOffset);
      var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
      var minutes = String(absOffset % 60).padStart(2, "0");
      return `UTC${sign}${hours}${minutes}`;
    };
    var winterName = extractZone(winterOffset);
    var summerName = extractZone(summerOffset);
    if (summerOffset < winterOffset) {
      stringToUTF8(winterName, std_name, 17);
      stringToUTF8(summerName, dst_name, 17);
    } else {
      stringToUTF8(winterName, dst_name, 17);
      stringToUTF8(summerName, std_name, 17);
    }
  };
  var _emscripten_get_now = () => performance.now();
  var _emscripten_date_now = () => Date.now();
  var getHeapMax = () => 2147483648;
  var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  };
  var ENV = {};
  var getExecutableName = () => thisProgram;
  var getEnvStrings = () => {
    if (!getEnvStrings.strings) {
      var lang = (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8";
      var env = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: lang, _: getExecutableName() };
      for (var x in ENV) {
        if (ENV[x] === void 0) delete env[x];
        else env[x] = ENV[x];
      }
      var strings = [];
      for (var x in env) {
        strings.push(`${x}=${env[x]}`);
      }
      getEnvStrings.strings = strings;
    }
    return getEnvStrings.strings;
  };
  var _environ_get = (__environ, environ_buf) => {
    var bufSize = 0;
    var envp = 0;
    for (var string of getEnvStrings()) {
      var ptr = environ_buf + bufSize;
      HEAPU32[__environ + envp >> 2] = ptr;
      bufSize += stringToUTF8(string, ptr, Infinity) + 1;
      envp += 4;
    }
    return 0;
  };
  var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i);
      if (c <= 127) {
        len++;
      } else if (c <= 2047) {
        len += 2;
      } else if (c >= 55296 && c <= 57343) {
        len += 4;
        ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };
  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
    var strings = getEnvStrings();
    HEAPU32[penviron_count >> 2] = strings.length;
    var bufSize = 0;
    for (var string of strings) {
      bufSize += lengthBytesUTF8(string) + 1;
    }
    HEAPU32[penviron_buf_size >> 2] = bufSize;
    return 0;
  };
  var _fd_close = (fd) => 52;
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    return 70;
  }
  var printCharBuffers = [null, [], []];
  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  };
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  };
  var printChar = (stream, curr) => {
    var buffer = printCharBuffers[stream];
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  };
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
  var _fd_write = (fd, iov, iovcnt, pnum) => {
    var num = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    HEAPU32[pnum >> 2] = num;
    return 0;
  };
  async function _js_stream_pull(bufferPointer, wantLength) {
    const puller = Module.mtpStreamPuller;
    if (!puller) {
      return 0;
    }
    return puller(HEAPU8.subarray(bufferPointer, bufferPointer + wantLength));
  }
  _js_stream_pull.isAsync = true;
  async function _js_stream_push(dataPointer, length) {
    const pusher = Module.mtpStreamPusher;
    if (!pusher) {
      return 1;
    }
    await pusher(HEAPU8.slice(dataPointer, dataPointer + length));
    return 0;
  }
  _js_stream_push.isAsync = true;
  function mtp_usb_registry() {
    if (!Module.mtpUsb) {
      Module.mtpUsb = { devices: [], order: [], nextId: 1, lastError: "", lastLoggedError: "", poisoned: /* @__PURE__ */ new Set() };
    }
    return Module.mtpUsb;
  }
  var libusb_errors = { IO: -1, NO_DEVICE: -4, BUSY: -6, TIMEOUT: -7, PIPE: -9 };
  function _js_usb_active_config_index(id) {
    const device = mtp_usb_registry().devices[id];
    const activeConfig = device?.configuration;
    if (!device || !activeConfig) {
      return -1;
    }
    return device.configurations.findIndex((c) => c.configurationValue === activeConfig.configurationValue);
  }
  function mtp_usb_live_device(id) {
    const registry = mtp_usb_registry();
    const device = registry.devices[id];
    return device && !registry.poisoned.has(id) ? device : null;
  }
  function mtp_usb_set_last_error(message) {
    const registry = mtp_usb_registry();
    registry.lastError = message;
    if (message !== registry.lastLoggedError) {
      registry.lastLoggedError = message;
      console.error("[mtp-webusb]", message);
    }
  }
  function mtp_with_timeout(promise, timeoutMs) {
    if (!timeoutMs) {
      return promise;
    }
    promise.catch(() => void 0);
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
  }
  var usbTimeouts = { stepMs: 5e3, resetMs: 1e4, controlMs: 5e3, bulkMaxMs: 12e4 };
  async function _js_usb_bulk_transfer(id, endpointAddress, data, length, timeoutMs) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    const waitMs = timeoutMs || usbTimeouts.bulkMaxMs;
    const epNum = endpointAddress & 15;
    try {
      if (endpointAddress & 128) {
        const result = await mtp_with_timeout(device.transferIn(epNum, length), waitMs);
        if (result.status === "stall") {
          console.warn(`[mtp-webusb] bulk IN ep=0x${endpointAddress.toString(16)} stalled, clearing halt`);
          await mtp_with_timeout(device.clearHalt("in", epNum), usbTimeouts.stepMs);
          return libusb_errors.PIPE;
        }
        const view = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
        HEAPU8.set(view, data);
        return view.byteLength;
      } else {
        const view = HEAPU8.slice(data, data + length);
        const result = await mtp_with_timeout(device.transferOut(epNum, view), waitMs);
        if (result.status === "stall") {
          console.warn(`[mtp-webusb] bulk OUT ep=0x${endpointAddress.toString(16)} stalled, clearing halt`);
          await mtp_with_timeout(device.clearHalt("out", epNum), usbTimeouts.stepMs);
          return libusb_errors.PIPE;
        }
        return result.bytesWritten ?? 0;
      }
    } catch (e) {
      if (e instanceof Error && e.message === "timeout") {
        mtp_usb_registry().poisoned.add(id);
        console.warn(`[mtp-webusb] bulk transfer ep=0x${endpointAddress.toString(16)} len=${length} timed out after ${waitMs}ms`);
        return libusb_errors.TIMEOUT;
      }
      mtp_usb_set_last_error(`bulk transfer ep=0x${endpointAddress.toString(16)} len=${length} failed: ${e.name}: ${e.message}`);
      return libusb_errors.IO;
    }
  }
  _js_usb_bulk_transfer.isAsync = true;
  function _js_usb_bus_number(_id) {
    return 1;
  }
  async function _js_usb_claim_interface(id, ifaceNumber) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    console.log(`[mtp-webusb] claimInterface(${ifaceNumber})`);
    try {
      await mtp_with_timeout(device.claimInterface(ifaceNumber), usbTimeouts.stepMs);
      console.log(`[mtp-webusb] claimInterface(${ifaceNumber}) succeeded`);
      return 0;
    } catch (e) {
      if (e instanceof Error && e.message === "timeout") {
        mtp_usb_set_last_error(`claimInterface(${ifaceNumber}) timed out after ${usbTimeouts.stepMs}ms`);
        return libusb_errors.IO;
      }
      mtp_usb_set_last_error(`claimInterface(${ifaceNumber}) failed: ${e.name}: ${e.message} - another application is holding this device open (Image Capture, Photos, Android File Transfer, another browser tab); on macOS run: sudo pkill PTPCamera`);
      return libusb_errors.BUSY;
    }
  }
  _js_usb_claim_interface.isAsync = true;
  async function _js_usb_clear_halt(id, endpointAddress) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    const epNum = endpointAddress & 15;
    const direction = endpointAddress & 128 ? "in" : "out";
    try {
      await mtp_with_timeout(device.clearHalt(direction, epNum), usbTimeouts.stepMs);
      return 0;
    } catch {
      return libusb_errors.IO;
    }
  }
  _js_usb_clear_halt.isAsync = true;
  async function _js_usb_close(id) {
    const device = mtp_usb_registry().devices[id];
    if (!device) {
      return;
    }
    try {
      await mtp_with_timeout(device.close(), usbTimeouts.stepMs);
    } catch (e) {
      console.warn("[mtp-webusb] close() failed", e);
    }
  }
  _js_usb_close.isAsync = true;
  function _js_usb_config_value(id, configIndex) {
    const config = mtp_usb_registry().devices[id]?.configurations[configIndex];
    return config ? config.configurationValue : -1;
  }
  async function _js_usb_control_transfer(id, bmRequestType, bRequest, wValue, wIndex, data, wLength, timeoutMs) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    const requestTypeMap = { 0: "standard", 1: "class", 2: "vendor" };
    const recipientMap = { 0: "device", 1: "interface", 2: "endpoint", 3: "other" };
    const setup = { requestType: requestTypeMap[bmRequestType >> 5 & 3] || "vendor", recipient: recipientMap[bmRequestType & 31] || "device", request: bRequest, value: wValue, index: wIndex };
    const waitMs = timeoutMs || usbTimeouts.controlMs;
    try {
      if (bmRequestType & 128) {
        const result = await mtp_with_timeout(device.controlTransferIn(setup, wLength), waitMs);
        if (result.status === "stall") {
          console.warn("[mtp-webusb] control transfer IN", setup, "stalled");
          return libusb_errors.PIPE;
        }
        if (result.status !== "ok" || !result.data) {
          console.warn("[mtp-webusb] control transfer IN", setup, "returned status", result.status);
          return libusb_errors.IO;
        }
        const view = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
        HEAPU8.set(view, data);
        return view.byteLength;
      } else {
        const view = HEAPU8.slice(data, data + wLength);
        const result = await mtp_with_timeout(device.controlTransferOut(setup, view), waitMs);
        if (result.status === "stall") {
          console.warn("[mtp-webusb] control transfer OUT", setup, "stalled");
          return libusb_errors.PIPE;
        }
        if (result.status !== "ok") {
          console.warn("[mtp-webusb] control transfer OUT", setup, "returned status", result.status);
          return libusb_errors.IO;
        }
        return result.bytesWritten ?? 0;
      }
    } catch (e) {
      if (e instanceof Error && e.message === "timeout") {
        console.warn(`[mtp-webusb] control transfer ${JSON.stringify(setup)} timed out after ${waitMs}ms`);
        return libusb_errors.TIMEOUT;
      }
      mtp_usb_set_last_error(`control transfer ${JSON.stringify(setup)} failed: ${e.name}: ${e.message}`);
      return libusb_errors.IO;
    }
  }
  _js_usb_control_transfer.isAsync = true;
  function _js_usb_desc_int(id, field) {
    const device = mtp_usb_registry().devices[id];
    if (!device) {
      return -1;
    }
    switch (field) {
      case 0:
        return device.deviceClass || 0;
      case 1:
        return device.deviceSubclass || 0;
      case 2:
        return device.deviceProtocol || 0;
      case 3:
        return device.vendorId || 0;
      case 4:
        return device.productId || 0;
      case 5:
        return (device.deviceVersionMajor || 0) << 8 | (device.deviceVersionMinor || 0) << 4 | (device.deviceVersionSubminor || 0);
      case 6:
        return (device.usbVersionMajor || 2) << 8 | (device.usbVersionMinor || 0) << 4 | (device.usbVersionSubminor || 0);
      case 7:
        return device.configurations ? device.configurations.length : 0;
      case 8:
        return device.manufacturerName ? 1 : 0;
      case 9:
        return device.productName ? 1 : 0;
      case 10:
        return device.serialNumber ? 1 : 0;
      default:
        return 0;
    }
  }
  function _js_usb_device_address(id) {
    return id;
  }
  function _js_usb_device_id_at(index) {
    return mtp_usb_registry().order[index];
  }
  function _js_usb_ep_field(id, configIndex, ifaceIndex, altIndex, epIndex, field) {
    const alt = mtp_usb_registry().devices[id]?.configurations[configIndex]?.interfaces[ifaceIndex]?.alternates[altIndex];
    const ep = alt?.endpoints[epIndex];
    if (!ep) {
      return -1;
    }
    const typeMap = { bulk: 2, interrupt: 3, isochronous: 1 };
    switch (field) {
      case 0:
        return ep.endpointNumber | (ep.direction === "in" ? 128 : 0);
      case 1:
        return typeMap[ep.type] ?? 0;
      case 2:
        return ep.packetSize;
      default:
        return -1;
    }
  }
  function mtp_write_utf8(text, out2, outlen) {
    const bytes = new TextEncoder().encode(text);
    const n = Math.min(bytes.length, outlen - 1);
    HEAPU8.set(bytes.subarray(0, n), out2);
    HEAPU8[out2 + n] = 0;
    return n;
  }
  function _js_usb_get_last_error(out2, outlen) {
    const message = mtp_usb_registry().lastError;
    if (!message) {
      return 0;
    }
    return mtp_write_utf8(message, out2, outlen);
  }
  function _js_usb_get_string(id, index, out2, outlen) {
    const device = mtp_usb_registry().devices[id];
    if (!device) {
      return -1;
    }
    const stringsByIndex = { 1: device.manufacturerName, 2: device.productName, 3: device.serialNumber };
    const value = stringsByIndex[index];
    if (!value) {
      return -1;
    }
    return mtp_write_utf8(value, out2, outlen);
  }
  function _js_usb_iface_field(id, configIndex, ifaceIndex, altIndex, field) {
    const iface = mtp_usb_registry().devices[id]?.configurations[configIndex]?.interfaces[ifaceIndex];
    const alt = iface?.alternates[altIndex];
    if (!iface || !alt) {
      return -1;
    }
    switch (field) {
      case 0:
        return iface.interfaceNumber;
      case 1:
        return alt.alternateSetting;
      case 2:
        return alt.interfaceClass;
      case 3:
        return alt.interfaceSubclass;
      case 4:
        return alt.interfaceProtocol;
      default:
        return -1;
    }
  }
  function _js_usb_num_altsettings(id, configIndex, ifaceIndex) {
    const iface = mtp_usb_registry().devices[id]?.configurations[configIndex]?.interfaces[ifaceIndex];
    return iface ? iface.alternates.length : -1;
  }
  function _js_usb_num_endpoints(id, configIndex, ifaceIndex, altIndex) {
    const alt = mtp_usb_registry().devices[id]?.configurations[configIndex]?.interfaces[ifaceIndex]?.alternates[altIndex];
    return alt ? alt.endpoints.length : -1;
  }
  function _js_usb_num_interfaces(id, configIndex) {
    const config = mtp_usb_registry().devices[id]?.configurations[configIndex];
    return config ? config.interfaces.length : -1;
  }
  async function _js_usb_open(id) {
    const device = mtp_usb_registry().devices[id];
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    console.log(`[mtp-webusb] open(): calling device.open() for id=${id}`);
    try {
      await mtp_with_timeout(device.open(), usbTimeouts.stepMs);
      console.log("[mtp-webusb] open(): device.open() succeeded, opened =", device.opened, "activeConfig =", device.configuration ? device.configuration.configurationValue : "none");
    } catch (e) {
      mtp_usb_set_last_error(`device.open() failed: ${e.name}: ${e.message}`);
      return libusb_errors.IO;
    }
    if (!device.configuration && device.configurations.length > 0) {
      const wanted = device.configurations[0].configurationValue;
      console.log(`[mtp-webusb] open(): no active configuration, calling selectConfiguration(${wanted})`);
      try {
        await mtp_with_timeout(device.selectConfiguration(wanted), usbTimeouts.stepMs);
        console.log("[mtp-webusb] open(): selectConfiguration succeeded");
      } catch (e) {
        const configAfterFailure = device.configuration;
        console.warn(`[mtp-webusb] open(): selectConfiguration(${wanted}) failed (${e.name}: ${e.message}) - continuing anyway, activeConfig is now`, configAfterFailure ? configAfterFailure.configurationValue : "still none");
      }
    }
    return 0;
  }
  _js_usb_open.isAsync = true;
  async function _js_usb_refresh_devices() {
    const registry = mtp_usb_registry();
    console.log("[mtp-webusb] refreshing paired device list via navigator.usb.getDevices()");
    const paired = await navigator.usb.getDevices();
    console.log("[mtp-webusb] navigator.usb.getDevices() returned", paired.length, "device(s)");
    registry.order = [];
    for (const device of paired) {
      let id = null;
      for (let existingId = 0; existingId < registry.devices.length; existingId++) {
        if (registry.devices[existingId] === device) {
          id = existingId;
          break;
        }
      }
      if (id === null) {
        id = registry.nextId++;
        registry.devices[id] = device;
      }
      registry.order.push(id);
      const activeConfig = device.configuration ? device.configuration.configurationValue : "none";
      console.log(`[mtp-webusb]   device id=${id} vendorId=0x${device.vendorId.toString(16)} productId=0x${device.productId.toString(16)} product="${device.productName}" serial="${device.serialNumber}" opened=${device.opened} configurations=${device.configurations.map((c) => c.configurationValue).join(",")} activeConfig=${activeConfig}`);
    }
    if (paired.length === 0) {
      console.warn("[mtp-webusb] no paired devices found - the page must call navigator.usb.requestDevice() from a user gesture first (a cancelled device picker grants nothing).");
    }
    return registry.order.length;
  }
  _js_usb_refresh_devices.isAsync = true;
  async function _js_usb_release_interface(id, ifaceNumber) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    try {
      await mtp_with_timeout(device.releaseInterface(ifaceNumber), usbTimeouts.stepMs);
      return 0;
    } catch {
      return libusb_errors.IO;
    }
  }
  _js_usb_release_interface.isAsync = true;
  async function _js_usb_reset_device(id) {
    const registry = mtp_usb_registry();
    const device = registry.devices[id];
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    try {
      await mtp_with_timeout(device.reset(), usbTimeouts.resetMs);
      registry.poisoned.delete(id);
      return 0;
    } catch {
      return libusb_errors.IO;
    }
  }
  _js_usb_reset_device.isAsync = true;
  async function _js_usb_set_configuration(id, configValue) {
    const device = mtp_usb_live_device(id);
    if (!device) {
      return libusb_errors.NO_DEVICE;
    }
    console.log(`[mtp-webusb] set_configuration(${configValue})`);
    try {
      await mtp_with_timeout(device.selectConfiguration(configValue), usbTimeouts.stepMs);
      return 0;
    } catch (e) {
      mtp_usb_set_last_error(`selectConfiguration(${configValue}) failed: ${e.name}: ${e.message}`);
      return libusb_errors.IO;
    }
  }
  _js_usb_set_configuration.isAsync = true;
  var Asyncify = { instrumentWasmImports(imports) {
    var importPattern = /^(invoke_.*|__asyncjs__.*)$/;
    for (let [x, original] of Object.entries(imports)) {
      if (typeof original == "function") {
        let isAsyncifyImport = original.isAsync || importPattern.test(x);
        if (isAsyncifyImport) {
          imports[x] = original = new WebAssembly.Suspending(original);
        }
      }
    }
  }, instrumentWasmExports(exports) {
    var exportPattern = /^(main|__main_argc_argv)$/;
    Asyncify.asyncExports = /* @__PURE__ */ new Set();
    var ret = {};
    for (let [x, original] of Object.entries(exports)) {
      if (typeof original == "function") {
        let isAsyncifyExport = exportPattern.test(x);
        if (isAsyncifyExport) {
          Asyncify.asyncExports.add(original);
          original = Asyncify.makeAsyncFunction(original);
        }
        ret[x] = original;
      } else {
        ret[x] = original;
      }
    }
    return ret;
  }, asyncExports: null, isAsyncExport(func) {
    return Asyncify.asyncExports?.has(func);
  }, handleAsync: async (startAsync) => {
    try {
      return await startAsync();
    } finally {
    }
  }, handleSleep: (startAsync) => Asyncify.handleAsync(() => new Promise(startAsync)), makeAsyncFunction(original) {
    return WebAssembly.promising(original);
  } };
  var getCFunc = (ident) => {
    var func = Module["_" + ident];
    return func;
  };
  var writeArrayToMemory = (array, buffer) => {
    HEAP8.set(array, buffer);
  };
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str, ret, size);
    return ret;
  };
  var ccall = (ident, returnType, argTypes, args, opts) => {
    var toC = { string: (str) => {
      var ret2 = 0;
      if (str !== null && str !== void 0 && str !== 0) {
        ret2 = stringToUTF8OnStack(str);
      }
      return ret2;
    }, array: (arr) => {
      var ret2 = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret2);
      return ret2;
    } };
    function convertReturnValue(ret2) {
      if (returnType === "string") {
        return UTF8ToString(ret2);
      }
      if (returnType === "boolean") return Boolean(ret2);
      return ret2;
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func(...cArgs);
    function onDone(ret2) {
      if (stack !== 0) stackRestore(stack);
      return convertReturnValue(ret2);
    }
    var asyncMode = opts?.async;
    if (asyncMode) return ret.then(onDone);
    ret = onDone(ret);
    return ret;
  };
  {
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["arguments"]) programArgs = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    var preInit = Module["preInit"];
    if (preInit) {
      if (typeof preInit == "function") Module["preInit"] = preInit = [preInit];
      while (preInit.length > 0) {
        preInit.shift()();
      }
    }
  }
  Module["ccall"] = ccall;
  Module["UTF8ToString"] = UTF8ToString;
  var _malloc, _free, _webusb_get_last_error, _mtp_set_debug_level, _mtp_detect_raw_devices, _mtp_open_raw_device, _mtp_release_device, _mtp_friendlyname, _mtp_modelname, _mtp_get_storage, _mtp_storage_first, _mtp_storage_next, _mtp_storage_id, _mtp_storage_description, _mtp_get_files_and_folders, _mtp_file_next, _mtp_file_item_id, _mtp_file_is_folder, _mtp_file_size_lo, _mtp_file_size_hi, _mtp_file_modification_time, _mtp_file_name, _mtp_file_destroy, _mtp_free_string, _mtp_free_file_buffer, _mtp_device_supports_operation, _mtp_supported_vendor_ids, _mtp_read_file_range, _mtp_last_ptp_response, _mtp_read_file_stream, _mtp_send_file_stream, _mtp_create_folder, _mtp_delete_object, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, memory, __indirect_function_table, wasmMemory;
  function assignWasmExports(wasmExports2) {
    _malloc = Module["_malloc"] = wasmExports2["malloc"];
    _free = Module["_free"] = wasmExports2["free"];
    _webusb_get_last_error = Module["_webusb_get_last_error"] = wasmExports2["webusb_get_last_error"];
    _mtp_set_debug_level = Module["_mtp_set_debug_level"] = wasmExports2["mtp_set_debug_level"];
    _mtp_detect_raw_devices = Module["_mtp_detect_raw_devices"] = wasmExports2["mtp_detect_raw_devices"];
    _mtp_open_raw_device = Module["_mtp_open_raw_device"] = wasmExports2["mtp_open_raw_device"];
    _mtp_release_device = Module["_mtp_release_device"] = wasmExports2["mtp_release_device"];
    _mtp_friendlyname = Module["_mtp_friendlyname"] = wasmExports2["mtp_friendlyname"];
    _mtp_modelname = Module["_mtp_modelname"] = wasmExports2["mtp_modelname"];
    _mtp_get_storage = Module["_mtp_get_storage"] = wasmExports2["mtp_get_storage"];
    _mtp_storage_first = Module["_mtp_storage_first"] = wasmExports2["mtp_storage_first"];
    _mtp_storage_next = Module["_mtp_storage_next"] = wasmExports2["mtp_storage_next"];
    _mtp_storage_id = Module["_mtp_storage_id"] = wasmExports2["mtp_storage_id"];
    _mtp_storage_description = Module["_mtp_storage_description"] = wasmExports2["mtp_storage_description"];
    _mtp_get_files_and_folders = Module["_mtp_get_files_and_folders"] = wasmExports2["mtp_get_files_and_folders"];
    _mtp_file_next = Module["_mtp_file_next"] = wasmExports2["mtp_file_next"];
    _mtp_file_item_id = Module["_mtp_file_item_id"] = wasmExports2["mtp_file_item_id"];
    _mtp_file_is_folder = Module["_mtp_file_is_folder"] = wasmExports2["mtp_file_is_folder"];
    _mtp_file_size_lo = Module["_mtp_file_size_lo"] = wasmExports2["mtp_file_size_lo"];
    _mtp_file_size_hi = Module["_mtp_file_size_hi"] = wasmExports2["mtp_file_size_hi"];
    _mtp_file_modification_time = Module["_mtp_file_modification_time"] = wasmExports2["mtp_file_modification_time"];
    _mtp_file_name = Module["_mtp_file_name"] = wasmExports2["mtp_file_name"];
    _mtp_file_destroy = Module["_mtp_file_destroy"] = wasmExports2["mtp_file_destroy"];
    _mtp_free_string = Module["_mtp_free_string"] = wasmExports2["mtp_free_string"];
    _mtp_free_file_buffer = Module["_mtp_free_file_buffer"] = wasmExports2["mtp_free_file_buffer"];
    _mtp_device_supports_operation = Module["_mtp_device_supports_operation"] = wasmExports2["mtp_device_supports_operation"];
    _mtp_supported_vendor_ids = Module["_mtp_supported_vendor_ids"] = wasmExports2["mtp_supported_vendor_ids"];
    _mtp_read_file_range = Module["_mtp_read_file_range"] = wasmExports2["mtp_read_file_range"];
    _mtp_last_ptp_response = Module["_mtp_last_ptp_response"] = wasmExports2["mtp_last_ptp_response"];
    _mtp_read_file_stream = Module["_mtp_read_file_stream"] = wasmExports2["mtp_read_file_stream"];
    _mtp_send_file_stream = Module["_mtp_send_file_stream"] = wasmExports2["mtp_send_file_stream"];
    _mtp_create_folder = Module["_mtp_create_folder"] = wasmExports2["mtp_create_folder"];
    _mtp_delete_object = Module["_mtp_delete_object"] = wasmExports2["mtp_delete_object"];
    __emscripten_stack_restore = wasmExports2["_emscripten_stack_restore"];
    __emscripten_stack_alloc = wasmExports2["_emscripten_stack_alloc"];
    _emscripten_stack_get_current = wasmExports2["emscripten_stack_get_current"];
    memory = wasmMemory = wasmExports2["memory"];
    __indirect_function_table = wasmExports2["__indirect_function_table"];
  }
  var wasmImports = { _localtime_js: __localtime_js, _mktime_js: __mktime_js, _tzset_js: __tzset_js, emscripten_date_now: _emscripten_date_now, emscripten_get_now: _emscripten_get_now, emscripten_resize_heap: _emscripten_resize_heap, environ_get: _environ_get, environ_sizes_get: _environ_sizes_get, fd_close: _fd_close, fd_seek: _fd_seek, fd_write: _fd_write, js_stream_pull: _js_stream_pull, js_stream_push: _js_stream_push, js_usb_active_config_index: _js_usb_active_config_index, js_usb_bulk_transfer: _js_usb_bulk_transfer, js_usb_bus_number: _js_usb_bus_number, js_usb_claim_interface: _js_usb_claim_interface, js_usb_clear_halt: _js_usb_clear_halt, js_usb_close: _js_usb_close, js_usb_config_value: _js_usb_config_value, js_usb_control_transfer: _js_usb_control_transfer, js_usb_desc_int: _js_usb_desc_int, js_usb_device_address: _js_usb_device_address, js_usb_device_id_at: _js_usb_device_id_at, js_usb_ep_field: _js_usb_ep_field, js_usb_get_last_error: _js_usb_get_last_error, js_usb_get_string: _js_usb_get_string, js_usb_iface_field: _js_usb_iface_field, js_usb_num_altsettings: _js_usb_num_altsettings, js_usb_num_endpoints: _js_usb_num_endpoints, js_usb_num_interfaces: _js_usb_num_interfaces, js_usb_open: _js_usb_open, js_usb_refresh_devices: _js_usb_refresh_devices, js_usb_release_interface: _js_usb_release_interface, js_usb_reset_device: _js_usb_reset_device, js_usb_set_configuration: _js_usb_set_configuration };
  async function run() {
    preRun();
    var setStatus = Module["setStatus"];
    if (setStatus) {
      setStatus("Running...");
      await new Promise((resolve) => setTimeout(resolve, 1));
      setTimeout(setStatus, 1, "");
    }
    if (ABORT) return;
    initRuntime();
    Module["onRuntimeInitialized"]?.();
    postRun();
  }
  var wasmExports;
  wasmExports = await createWasm();
  await run();
  ;
  return Module;
}
var mtp_default = createMtpModule;

// src/mtp-errors.ts
var NamedError = class extends Error {
  /** PTP response code (e.g. 0x2009) when the device reported one; absent for transport-level failures. */
  code;
  constructor(message, code) {
    super(message);
    this.name = new.target.name;
    if (code !== void 0) {
      this.code = code;
    }
  }
};
var MtpDeviceNotFoundError = class extends NamedError {
};
var MtpOpenError = class extends NamedError {
};
var MtpFileReadError = class extends NamedError {
};
var MtpWriteError = class extends NamedError {
};
var MtpSessionClosedError = class extends NamedError {
};
var MtpDeviceDisconnectedError = class extends NamedError {
};
var MtpObjectNotFoundError = class extends NamedError {
};

// src/mtp-session.ts
var LIBMTP_DEBUG_NONE = 0;
var LIBMTP_DEBUG_ALL = 255;
var MTP_ROOT_FOLDER_ID = 4294967295;
var DETECT_NO_MTP_DEVICE_RESULT = -6;
var PTP_OC_GET_PARTIAL_OBJECT = 4123;
var PTP_OC_ANDROID_SEND_PARTIAL_OBJECT = 38338;
var PTP_RC_INVALID_OBJECT_HANDLE = 8201;
var DEFAULT_OPEN_TIMEOUT_MS = 3e4;
var SESSION_CLOSE_TIMEOUT_MS = 1e4;
var ABORT_RELEASE_TIMEOUT_MS = 5e3;
var DEVICE_RESET_TIMEOUT_MS = 1e4;
var DEVICE_CLOSE_TIMEOUT_MS = 5e3;
var SUSPENDING_EXPORTS = [
  "mtp_detect_raw_devices",
  "mtp_open_raw_device",
  "mtp_release_device",
  "mtp_friendlyname",
  "mtp_modelname",
  "mtp_get_storage",
  "mtp_get_files_and_folders",
  "mtp_read_file_range",
  "mtp_read_file_stream",
  "mtp_send_file_stream",
  "mtp_create_folder",
  "mtp_delete_object"
];
var READ_WINDOW_BYTES = 8 * 1024 * 1024;
var RANGE_READ_BYTES = 1024 * 1024;
var modulePromise = null;
var moduleWasmUrl = null;
var MtpSession = class _MtpSession {
  device;
  storages;
  mtp;
  devicePointer;
  usbDevice;
  isClosed = false;
  isAborted = false;
  disconnectError = null;
  // libmtp is not reentrant: device requests run one at a time.
  deviceQueue = Promise.resolve();
  constructor(mtp, devicePointer, usbDevice, device, storages) {
    this.mtp = mtp;
    this.devicePointer = devicePointer;
    this.usbDevice = usbDevice;
    this.device = device;
    this.storages = storages;
  }
  /** Loads the wasm module and opens the first paired device; always settles within openTimeoutMs. */
  static async open(options) {
    const mtp = await loadMtpModule(options.wasmUrl);
    mtp.ccall(
      "mtp_set_debug_level",
      null,
      ["number"],
      [options.isVerboseLogging ? LIBMTP_DEBUG_ALL : LIBMTP_DEBUG_NONE]
    );
    const timeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
    try {
      const opened = await withTimeoutMs(openPairedDevice(mtp), timeoutMs);
      const session = new _MtpSession(
        opened.mtp,
        opened.devicePointer,
        opened.usbDevice,
        opened.device,
        opened.storages
      );
      navigator.usb.addEventListener("disconnect", session.onUsbDisconnect);
      return session;
    } catch (error) {
      if (!isTimeoutError(error)) {
        throw error;
      }
      invalidateMtpModule();
      await releaseRegistryDevices(mtp, [
        (device) => withTimeoutMs(device.reset(), DEVICE_RESET_TIMEOUT_MS),
        (device) => withTimeoutMs(device.close(), DEVICE_CLOSE_TIMEOUT_MS)
      ]);
      throw new MtpOpenError(
        `Opening the MTP device did not complete within ${timeoutMs}ms; the transport may be wedged. A retry starts from a fresh module.`
      );
    }
  }
  /**
   * Releases the device; all subsequent operations reject with MtpSessionClosedError.
   * A graceful release that exceeds 10 s falls back to closing the USB device directly.
   */
  async close() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    try {
      await withTimeoutMs(
        this.serialize(() => callNumberAsync(this.mtp, "mtp_release_device", [this.devicePointer]), {
          isTeardown: true
        }),
        SESSION_CLOSE_TIMEOUT_MS
      );
    } catch (error) {
      if (!isTimeoutError(error)) {
        throw error;
      }
      console.warn(
        `[mtp] close timed out after ${SESSION_CLOSE_TIMEOUT_MS}ms; forcing the device release (abort() additionally resets a wedged device)`
      );
      await releaseRegistryDevices(this.mtp, [(device) => withTimeoutMs(device.close(), DEVICE_CLOSE_TIMEOUT_MS)]);
      invalidateMtpModule();
    } finally {
      navigator.usb.removeEventListener("disconnect", this.onUsbDisconnect);
    }
  }
  /**
   * Hard-releases a wedged device, resetting it when needed, so a fresh
   * requestMtpFileSystem() recovers without replugging. Never rejects; all
   * handles become unusable.
   */
  async abort() {
    if (this.isClosed) {
      return;
    }
    this.isAborted = true;
    this.isClosed = true;
    navigator.usb.removeEventListener("disconnect", this.onUsbDisconnect);
    const gracefulRelease = this.serialize(
      () => callNumberAsync(this.mtp, "mtp_release_device", [this.devicePointer]),
      {
        isTeardown: true
      }
    ).then(
      () => true,
      () => false
    );
    const isGracefulReleaseDone = await withTimeoutMs(gracefulRelease, ABORT_RELEASE_TIMEOUT_MS).catch(() => false);
    if (isGracefulReleaseDone) {
      return;
    }
    console.warn(`[mtp] abort: graceful release did not finish within ${ABORT_RELEASE_TIMEOUT_MS}ms; forcing it`);
    await releaseRegistryDevices(this.mtp, [
      (device) => withTimeoutMs(device.reset(), DEVICE_RESET_TIMEOUT_MS),
      (device) => withTimeoutMs(device.close(), DEVICE_CLOSE_TIMEOUT_MS)
    ]);
    invalidateMtpModule();
  }
  listChildren(storageId, folderId) {
    this.assertOpen();
    return this.serialize(() => this.scanChildren(storageId, folderId));
  }
  /** Streams the whole object with backpressure; memory stays bounded by READ_WINDOW_BYTES. */
  readFileStream(file) {
    this.assertOpen();
    const window = new ByteLengthQueuingStrategy({ highWaterMark: READ_WINDOW_BYTES });
    const pipe = new TransformStream(void 0, window, window);
    void this.serialize(() => this.pumpFileContents(file, pipe.writable.getWriter()));
    return Promise.resolve(pipe.readable);
  }
  /** Reads one range; empty when it starts at/past end-of-file. */
  readFileRange(file, offset, length) {
    this.assertOpen();
    return this.serialize(() => this.fetchFileRange(file, offset, length));
  }
  /** Uploads a stream as a new child object, replacing any same-named file. Returns the new object id. */
  writeFileStream(storageId, folderId, fileName, totalBytes, contents) {
    this.assertOpen();
    return this.serialize(() => this.performWriteFileStream(storageId, folderId, fileName, totalBytes, contents));
  }
  /** Returns the new folder's object id. */
  createFolder(storageId, folderId, name) {
    this.assertOpen();
    return this.serialize(async () => {
      const namePointer = allocUtf8(this.mtp, name);
      try {
        console.log(`[mtp] mtp_create_folder: "${name}" -> storage ${storageId} folder ${folderId}`);
        const newFolderId = await callNumberAsync(this.mtp, "mtp_create_folder", [
          this.devicePointer,
          storageId,
          folderId,
          namePointer
        ]) >>> 0;
        console.log(`[mtp] mtp_create_folder: folder_id=${newFolderId}`);
        if (!newFolderId) {
          throw newWriteError(this.mtp, `Could not create directory "${name}" on the device`);
        }
        return newFolderId;
      } finally {
        this.mtp._free(namePointer);
      }
    });
  }
  /** Deletes one object (file or empty directory). */
  deleteObject(objectId, name) {
    this.assertOpen();
    return this.serialize(async () => {
      console.log(`[mtp] mtp_delete_object: "${name}" (object ${objectId})`);
      const result = await callNumberAsync(this.mtp, "mtp_delete_object", [this.devicePointer, objectId]);
      console.log(`[mtp] mtp_delete_object: rc=${result}`);
      if (result !== 0) {
        throw deviceOperationError(
          this.mtp,
          MtpWriteError,
          `Could not remove "${name}" from the device`,
          lastPtpResponse(this.mtp)
        );
      }
    });
  }
  onUsbDisconnect = (event) => {
    const registry = this.mtp.mtpUsb;
    if (!registry) {
      return;
    }
    if (this.usbDevice !== void 0 && event.device !== this.usbDevice) {
      return;
    }
    let wasDeviceRegistered = false;
    for (let id = 0; id < registry.devices.length; id++) {
      if (registry.devices[id] === event.device) {
        delete registry.devices[id];
        wasDeviceRegistered = true;
      }
    }
    if (wasDeviceRegistered) {
      this.disconnectError = new MtpDeviceDisconnectedError("The MTP device was unplugged.");
    }
  };
  assertOpen() {
    if (this.disconnectError) {
      throw this.disconnectError;
    }
    if (this.isClosed) {
      throw new MtpSessionClosedError("The MTP device session is closed.");
    }
  }
  serialize(action, options) {
    const result = this.deviceQueue.then(async () => {
      if (!options?.isTeardown) {
        if (this.disconnectError) {
          throw this.disconnectError;
        }
        if (this.isAborted) {
          throw new MtpSessionClosedError("The MTP device session was aborted.");
        }
      }
      return action();
    });
    this.deviceQueue = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  async pumpFileContents(file, writer) {
    try {
      if (this.device.supportsRangeReads) {
        let offset = 0;
        while (offset < file.size) {
          const length = Math.min(RANGE_READ_BYTES, file.size - offset);
          const chunk = await this.fetchFileRange(file, offset, length);
          if (chunk.byteLength === 0) {
            throw new MtpFileReadError(
              `Could not read "${file.name}" from the device: it ended at ${offset} of ${file.size} bytes.`
            );
          }
          await writer.write(chunk);
          offset += chunk.byteLength;
        }
      } else {
        await this.readWholeObjectAsStream(file, writer);
      }
      await writer.close();
    } catch (error) {
      const reason = this.disconnectError ?? (error instanceof Error ? error : new Error(String(error)));
      await writer.abort(reason).catch(() => void 0);
    }
  }
  async fetchFileRange(file, offset, length) {
    const mtp = this.mtp;
    const pointerSlot = mtp._malloc(4);
    const lengthSlot = mtp._malloc(4);
    try {
      const result = await callNumberAsync(mtp, "mtp_read_file_range", [
        this.devicePointer,
        file.id,
        offset >>> 0,
        Math.floor(offset / 2 ** 32),
        length,
        pointerSlot,
        lengthSlot
      ]);
      if (result !== 0) {
        throw deviceOperationError(
          mtp,
          MtpFileReadError,
          `Could not read "${file.name}" from the device at offset ${offset}`,
          lastPtpResponse(mtp)
        );
      }
      const bufferPointer = mtp.HEAP32[pointerSlot >> 2] >>> 0;
      const byteLength = mtp.HEAP32[lengthSlot >> 2] >>> 0;
      if (!bufferPointer || byteLength === 0) {
        return new Uint8Array(0);
      }
      const bytes = mtp.HEAPU8.slice(bufferPointer, bufferPointer + byteLength);
      callVoid(mtp, "mtp_free_file_buffer", [bufferPointer]);
      return bytes;
    } finally {
      mtp._free(pointerSlot);
      mtp._free(lengthSlot);
    }
  }
  async readWholeObjectAsStream(file, writer) {
    this.mtp.mtpStreamPusher = async (chunk) => {
      await writer.write(chunk);
    };
    try {
      const result = await callNumberAsync(this.mtp, "mtp_read_file_stream", [this.devicePointer, file.id]);
      if (result !== 0) {
        throw new MtpFileReadError(`Could not read "${file.name}" from the device.`);
      }
    } finally {
      this.mtp.mtpStreamPusher = void 0;
    }
  }
  async performWriteFileStream(storageId, folderId, fileName, totalBytes, contents) {
    const mtp = this.mtp;
    await this.removeExistingChildWithName(storageId, folderId, fileName);
    const reader = contents.getReader();
    let pendingChunk = null;
    let streamErrorMessage = null;
    mtp.mtpStreamPuller = async (target) => {
      try {
        let filled = 0;
        while (filled < target.byteLength) {
          if (!pendingChunk) {
            const { done, value } = await reader.read();
            if (done || !value) {
              break;
            }
            pendingChunk = value;
          }
          const count = Math.min(pendingChunk.byteLength, target.byteLength - filled);
          target.set(pendingChunk.subarray(0, count), filled);
          filled += count;
          pendingChunk = count === pendingChunk.byteLength ? null : pendingChunk.subarray(count);
        }
        return filled;
      } catch (error) {
        streamErrorMessage = error instanceof Error ? error.message : String(error);
        return 0;
      }
    };
    const namePointer = allocUtf8(mtp, fileName);
    try {
      console.log(
        `[mtp] mtp_send_file_stream: "${fileName}" ${totalBytes} bytes -> storage ${storageId} folder ${folderId}`
      );
      const itemId = await callNumberAsync(mtp, "mtp_send_file_stream", [
        this.devicePointer,
        storageId,
        folderId,
        namePointer,
        totalBytes >>> 0,
        Math.floor(totalBytes / 2 ** 32)
      ]) >>> 0;
      console.log(`[mtp] mtp_send_file_stream: item_id=${itemId}`);
      if (!itemId) {
        if (streamErrorMessage) {
          throw new MtpWriteError(
            `Could not write "${fileName}" to the device: the source stream failed (${streamErrorMessage}).`
          );
        }
        throw newWriteError(mtp, `Could not write "${fileName}" to the device`);
      }
      return itemId;
    } finally {
      mtp.mtpStreamPuller = void 0;
      mtp._free(namePointer);
      await reader.cancel().catch(() => void 0);
    }
  }
  /** Makes writes replace: a same-named file is deleted first so re-uploads don't duplicate. */
  async removeExistingChildWithName(storageId, folderId, fileName) {
    for (const child of await this.scanChildren(storageId, folderId)) {
      if (child.name !== fileName) {
        continue;
      }
      if (child.isFolder) {
        throw new MtpWriteError(`A folder named "${fileName}" already exists on the device.`);
      }
      console.log(`[mtp] replacing object ${child.id} ("${fileName}")`);
      const result = await callNumberAsync(this.mtp, "mtp_delete_object", [this.devicePointer, child.id]);
      if (result !== 0) {
        throw deviceOperationError(
          this.mtp,
          MtpWriteError,
          `Could not replace "${fileName}" on the device`,
          lastPtpResponse(this.mtp)
        );
      }
    }
  }
  async scanChildren(storageId, folderId) {
    const mtp = this.mtp;
    let filePointer = await callNumberAsync(mtp, "mtp_get_files_and_folders", [
      this.devicePointer,
      storageId,
      folderId
    ]);
    const children = [];
    while (filePointer) {
      const name = readBorrowedString(mtp, callNumber(mtp, "mtp_file_name", [filePointer]));
      const isFolder = callNumber(mtp, "mtp_file_is_folder", [filePointer]) !== 0;
      const sizeLo = callNumber(mtp, "mtp_file_size_lo", [filePointer]) >>> 0;
      const sizeHi = callNumber(mtp, "mtp_file_size_hi", [filePointer]) >>> 0;
      const modificationTimeMs = callNumber(mtp, "mtp_file_modification_time", [filePointer]) * 1e3;
      const id = callNumber(mtp, "mtp_file_item_id", [filePointer]) >>> 0;
      children.push({ id, name, isFolder, size: sizeHi * 2 ** 32 + sizeLo, modificationTimeMs });
      const nextPointer = callNumber(mtp, "mtp_file_next", [filePointer]);
      callVoid(mtp, "mtp_file_destroy", [filePointer]);
      filePointer = nextPointer;
    }
    return children;
  }
};
async function openPairedDevice(mtp) {
  console.log("[mtp] detecting raw devices...");
  const rawDeviceCount = await callNumberAsync(mtp, "mtp_detect_raw_devices", []);
  console.log(`[mtp] mtp_detect_raw_devices: result=${rawDeviceCount}`);
  if (rawDeviceCount === DETECT_NO_MTP_DEVICE_RESULT) {
    const pairedCount = (await navigator.usb.getDevices()).length;
    throw new MtpDeviceNotFoundError(
      pairedCount === 0 ? "No paired MTP device found. Pair a device first." : "A paired USB device was found but none presented an MTP interface. The device may not be in MTP mode."
    );
  }
  if (rawDeviceCount <= 0) {
    throw new MtpDeviceNotFoundError(`MTP device detection failed (libmtp error ${-(rawDeviceCount + 1)}).`);
  }
  const devicePointer = await callNumberAsync(mtp, "mtp_open_raw_device", [0]);
  if (!devicePointer) {
    const detail = lastWebUsbError(mtp);
    throw new MtpOpenError(
      detail ? `Could not open the MTP device: ${detail}` : "Could not open the MTP device. Check the browser console for details."
    );
  }
  console.log("[mtp] device opened successfully");
  const friendlyName = takeOwnedString(mtp, await callNumberAsync(mtp, "mtp_friendlyname", [devicePointer])) ?? "";
  const modelName = takeOwnedString(mtp, await callNumberAsync(mtp, "mtp_modelname", [devicePointer])) ?? "";
  const supportsRangeReads = callNumber(mtp, "mtp_device_supports_operation", [devicePointer, PTP_OC_GET_PARTIAL_OBJECT]) !== 0;
  const supportsRangeWrites = callNumber(mtp, "mtp_device_supports_operation", [devicePointer, PTP_OC_ANDROID_SEND_PARTIAL_OBJECT]) !== 0;
  console.log(`[mtp] capabilities: rangeReads=${supportsRangeReads} rangeWrites=${supportsRangeWrites}`);
  const storageRc = await callNumberAsync(mtp, "mtp_get_storage", [devicePointer]);
  console.log(`[mtp] mtp_get_storage: rc=${storageRc}`);
  const storages = [];
  let storagePointer = callNumber(mtp, "mtp_storage_first", [devicePointer]);
  while (storagePointer) {
    const storageId = callNumber(mtp, "mtp_storage_id", [storagePointer]) >>> 0;
    const description = readBorrowedString(mtp, callNumber(mtp, "mtp_storage_description", [storagePointer]));
    console.log(`[mtp] storage id=${storageId} (${description})`);
    storages.push({ storageId, name: description || `Storage ${storageId}` });
    storagePointer = callNumber(mtp, "mtp_storage_next", [storagePointer]);
  }
  return {
    mtp,
    devicePointer,
    usbDevice: findClaimedRegistryDevice(mtp),
    device: { friendlyName, modelName, supportsRangeReads, supportsRangeWrites },
    storages
  };
}
async function loadMtpModule(wasmUrl) {
  moduleWasmUrl = resolveWasmUrl(wasmUrl);
  return loadModule();
}
async function loadModule() {
  if (!modulePromise) {
    const load = importMtpModule();
    load.catch(() => {
      if (modulePromise === load) {
        modulePromise = null;
      }
    });
    modulePromise = load;
  }
  return modulePromise;
}
async function importMtpModule() {
  const mtp = await mtp_default({
    locateFile: (path) => moduleWasmUrl !== null && path.endsWith(".wasm") ? moduleWasmUrl : path
  });
  for (const exportName of SUSPENDING_EXPORTS) {
    const wasmExport = mtp["_" + exportName];
    mtp["_" + exportName] = WebAssembly.promising(wasmExport);
  }
  return mtp;
}
function invalidateMtpModule() {
  modulePromise = null;
  moduleWasmUrl = null;
}
function resolveWasmUrl(wasmUrl) {
  if (wasmUrl instanceof URL) {
    return wasmUrl.href;
  }
  if (wasmUrl === void 0) {
    return new URL("./mtp.wasm", import.meta.url).href;
  }
  const base = typeof document === "undefined" ? self.location.href : document.baseURI;
  return new URL(wasmUrl, base).href;
}
function findClaimedRegistryDevice(mtp) {
  return mtp.mtpUsb?.devices.find((device) => device?.opened === true);
}
async function releaseRegistryDevices(mtp, steps) {
  const registry = mtp.mtpUsb;
  if (!registry) {
    return;
  }
  for (const id of registry.order) {
    const device = registry.devices[id];
    if (!device) {
      continue;
    }
    for (const step of steps) {
      try {
        await step(device);
      } catch {
      }
    }
    delete registry.devices[id];
  }
}
function withTimeoutMs(promise, timeoutMs) {
  promise.catch(() => void 0);
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);
}
function isTimeoutError(error) {
  return error instanceof Error && error.message === "timeout";
}
function callNumber(mtp, exportName, args) {
  return mtp.ccall(
    exportName,
    "number",
    args.map(() => "number"),
    args
  );
}
function callNumberAsync(mtp, exportName, args) {
  return mtp.ccall(
    exportName,
    "number",
    args.map(() => "number"),
    args,
    { async: true }
  );
}
function callVoid(mtp, exportName, args) {
  mtp.ccall(
    exportName,
    null,
    args.map(() => "number"),
    args
  );
}
function readBorrowedString(mtp, pointer) {
  return pointer ? mtp.UTF8ToString(pointer) : "";
}
function takeOwnedString(mtp, pointer) {
  if (!pointer) {
    return null;
  }
  const value = mtp.UTF8ToString(pointer);
  callVoid(mtp, "mtp_free_string", [pointer]);
  return value;
}
function allocUtf8(mtp, text) {
  const encoded = new TextEncoder().encode(text);
  const pointer = mtp._malloc(encoded.byteLength + 1);
  mtp.HEAPU8.set(encoded, pointer);
  mtp.HEAPU8[pointer + encoded.byteLength] = 0;
  return pointer;
}
function deviceOperationError(mtp, errorClass, message, code) {
  if (code === PTP_RC_INVALID_OBJECT_HANDLE) {
    return new MtpObjectNotFoundError(`${message}: the device reports the object no longer exists.`, code);
  }
  const detail = lastWebUsbError(mtp);
  const suffixed = detail ? `${message}: ${detail}` : `${message}.`;
  return new errorClass(suffixed, code || void 0);
}
function newWriteError(mtp, message) {
  return deviceOperationError(mtp, MtpWriteError, message, 0);
}
function lastPtpResponse(mtp) {
  return callNumber(mtp, "mtp_last_ptp_response", []) >>> 0;
}
function lastWebUsbError(mtp) {
  return readBorrowedString(mtp, callNumber(mtp, "webusb_get_last_error", []));
}

// src/mtp-filesystem.ts
async function requestMtpFileSystem(options = {}) {
  const session = await MtpSession.open({
    isVerboseLogging: options.isVerboseLogging ?? false,
    wasmUrl: options.wasmUrl,
    openTimeoutMs: options.openTimeoutMs
  });
  return new MtpFileSystem(session);
}
var MtpFileSystem = class {
  name;
  device;
  root;
  session;
  constructor(session) {
    this.session = session;
    this.name = session.device.friendlyName || session.device.modelName || "MTP device";
    this.device = session.device;
    this.root = new MtpDirectoryHandle(this, null, 0, "", "/");
  }
  /** Releases the device; all handles become unusable. */
  async close() {
    await this.session.close();
  }
  /** Hard-releases a wedged device so a fresh requestMtpFileSystem() recovers without replugging. */
  async abort() {
    await this.session.abort();
  }
};
var MtpHandleBase = class {
  name;
  fullPath;
  filesystem;
  constructor(filesystem, name, fullPath) {
    this.filesystem = filesystem;
    this.name = name;
    this.fullPath = fullPath;
  }
  // WebUSB permission is granted at pairing time.
  queryPermission() {
    return Promise.resolve("granted");
  }
  requestPermission() {
    return Promise.resolve("granted");
  }
  async isSameEntry(other) {
    return isMtpHandle(other) && other.fullPath === this.fullPath;
  }
};
var MtpDirectoryHandle = class _MtpDirectoryHandle extends MtpHandleBase {
  kind = "directory";
  /** Null on the device root, whose children are the storages. */
  storageId;
  /** MTP folder id; MTP_ROOT_FOLDER_ID on a storage's root. */
  folderId;
  constructor(filesystem, storageId, folderId, name, fullPath) {
    super(filesystem, name, fullPath);
    this.storageId = storageId;
    this.folderId = folderId;
  }
  async getFileHandle(name, options) {
    assertPlainName(name);
    const child = await this.findChild(name);
    if (child) {
      if (child.isFolder) {
        throw entryKindMismatchError(name, "file");
      }
      return this.childFileHandle(child);
    }
    if (!options?.create) {
      throw notFoundError(name);
    }
    this.assertWritableDirectory("creating files");
    return new MtpFileHandle(this.filesystem, this, null, name, joinPath(this.fullPath, name), Date.now(), 0);
  }
  async getDirectoryHandle(name, options) {
    assertPlainName(name);
    const child = await this.findChild(name);
    if (child) {
      if (!child.isFolder) {
        throw entryKindMismatchError(name, "directory");
      }
      return this.childDirectoryHandle(child);
    }
    if (!options?.create) {
      throw notFoundError(name);
    }
    this.assertWritableDirectory("creating directories");
    const folderId = await this.filesystem.session.createFolder(this.storageId, this.folderId, name);
    return new _MtpDirectoryHandle(this.filesystem, this.storageId, folderId, name, joinPath(this.fullPath, name));
  }
  /** Fails with MtpWriteError when a non-empty directory is removed without { recursive: true }. */
  async removeEntry(name, options) {
    assertPlainName(name);
    const child = await this.findChild(name);
    if (!child) {
      throw notFoundError(name);
    }
    if (this.storageId === null) {
      throw new DOMException(`Storage "${name}" is a device storage root and cannot be removed.`, "NotSupportedError");
    }
    if (child.isFolder && options?.recursive) {
      await this.removeRecursively(child);
    }
    await this.filesystem.session.deleteObject(child.id, child.name);
  }
  async resolve(possibleDescendant) {
    if (!isMtpHandle(possibleDescendant) || possibleDescendant.fullPath === this.fullPath) {
      return null;
    }
    const prefix = this.fullPath === "/" ? "/" : `${this.fullPath}/`;
    if (!possibleDescendant.fullPath.startsWith(prefix)) {
      return null;
    }
    return possibleDescendant.fullPath.slice(prefix.length).split("/");
  }
  entries() {
    return this.projectChildren((handle) => [handle.name, handle]);
  }
  keys() {
    return this.projectChildren((handle) => handle.name);
  }
  values() {
    return this.projectChildren((handle) => handle);
  }
  [Symbol.asyncIterator]() {
    return this.entries();
  }
  /** Uploads contents as this directory's child file, replacing any same-named file. */
  async writeChildFileStream(name, totalBytes, contents) {
    this.assertWritableDirectory("writing files");
    const id = await this.filesystem.session.writeFileStream(
      this.storageId,
      this.folderId,
      name,
      totalBytes,
      contents
    );
    return { id, size: totalBytes };
  }
  async *projectChildren(project) {
    for (const child of await this.listChildren()) {
      yield project(this.childHandle(child));
    }
  }
  listChildren() {
    if (this.storageId === null) {
      const storages = this.filesystem.session.storages;
      return Promise.resolve(storages.map(storageEntry));
    }
    return this.filesystem.session.listChildren(this.storageId, this.folderId);
  }
  async findChild(name) {
    for (const child of await this.listChildren()) {
      if (child.name === name) {
        return child;
      }
    }
    return void 0;
  }
  childHandle(child) {
    return child.isFolder ? this.childDirectoryHandle(child) : this.childFileHandle(child);
  }
  childFileHandle(child) {
    return new MtpFileHandle(
      this.filesystem,
      this,
      child.id,
      child.name,
      joinPath(this.fullPath, child.name),
      child.modificationTimeMs,
      child.size
    );
  }
  childDirectoryHandle(child) {
    if (this.storageId === null) {
      return new _MtpDirectoryHandle(
        this.filesystem,
        child.id,
        MTP_ROOT_FOLDER_ID,
        child.name,
        joinPath(this.fullPath, child.name)
      );
    }
    return new _MtpDirectoryHandle(
      this.filesystem,
      this.storageId,
      child.id,
      child.name,
      joinPath(this.fullPath, child.name)
    );
  }
  /** The device root only lists storages; real entries live inside them. */
  assertWritableDirectory(operationName) {
    if (this.storageId === null) {
      throw notSupportedError(`${operationName} on the device root`);
    }
  }
  async removeRecursively(child) {
    const childDirectory = new _MtpDirectoryHandle(
      this.filesystem,
      this.storageId,
      child.id,
      child.name,
      joinPath(this.fullPath, child.name)
    );
    for (const grandchild of await childDirectory.listChildren()) {
      if (grandchild.isFolder) {
        await childDirectory.removeRecursively(grandchild);
      }
      await this.filesystem.session.deleteObject(grandchild.id, grandchild.name);
    }
  }
};
function storageEntry(storage) {
  return { id: storage.storageId, name: storage.name, isFolder: true, size: 0, modificationTimeMs: 0 };
}
var MtpFileHandle = class extends MtpHandleBase {
  kind = "file";
  parentDirectory;
  /** Null until the first writable stream closes, for handles created with { create: true }. */
  fileId;
  lastModifiedMs;
  /** Bytes as last listed; the session's ranged pump delivers exactly this count. */
  sizeBytes;
  constructor(filesystem, parentDirectory, fileId, name, fullPath, lastModifiedMs, sizeBytes) {
    super(filesystem, name, fullPath);
    this.parentDirectory = parentDirectory;
    this.fileId = fileId;
    this.lastModifiedMs = lastModifiedMs;
    this.sizeBytes = sizeBytes;
  }
  /** Bytes as of the listing that produced this handle; moves to the uploaded count after a writable close. */
  get size() {
    return this.sizeBytes;
  }
  /** Epoch milliseconds as of the listing that produced this handle. */
  get lastModified() {
    return this.lastModifiedMs;
  }
  /** Rejects with NotFoundError for handles created with { create: true } until the first writable stream closes. */
  async getFile() {
    const contents = await this.createReadable();
    return new File([await new Response(contents).blob()], this.name, { lastModified: this.lastModifiedMs });
  }
  /**
   * Streams the object chunk-by-chunk with backpressure; memory stays bounded
   * regardless of size.
   */
  async createReadable() {
    if (this.fileId === null) {
      throw notFoundError(this.name);
    }
    return this.filesystem.session.readFileStream(this.fileRef());
  }
  /**
   * Reads an arbitrary byte range; repeatable and order-independent. Rejects
   * NotSupportedError unless device.supportsRangeReads. Ranges starting at or
   * past end-of-file return empty; offsets address the first 4 GiB (the PTP
   * op libmtp sends is 32-bit). The response materializes in full, so length
   * is the caller's memory budget.
   */
  async readRange(offset, length) {
    if (this.fileId === null) {
      throw notFoundError(this.name);
    }
    if (!this.filesystem.device.supportsRangeReads) {
      throw notSupportedError("readRange", "the device does not support ranged reads");
    }
    if (offset < 0 || length < 0) {
      throw new TypeError("offset and length must be non-negative.");
    }
    if (offset > 4294967295) {
      throw new RangeError("Ranged reads address the first 4 GiB of a file.");
    }
    if (length === 0) {
      return new Uint8Array(0);
    }
    return this.filesystem.session.readFileRange({ id: this.fileId, name: this.name }, offset, length);
  }
  /**
   * Uploads written bytes as this file on close(), replacing any same-named
   * object. { size } starts a streaming upload with backpressure; without it
   * content buffers until close(). { keepExistingData: true } prefixes the
   * current content, streamed from the device rather than buffered.
   */
  async createWritable(options) {
    let seed;
    if (options?.keepExistingData) {
      if (this.fileId === null) {
        throw notFoundError(this.name);
      }
      seed = { stream: await this.createReadable(), size: this.sizeBytes };
    }
    return new MtpWritableFileStream({
      seed,
      totalSize: options?.size,
      target: { uploadStreamed: (contents, totalBytes) => this.uploadStreamed(contents, totalBytes) }
    });
  }
  createSyncAccessHandle(_options) {
    return Promise.reject(notSupportedError("createSyncAccessHandle"));
  }
  fileRef() {
    return { id: this.fileId, name: this.name, size: this.sizeBytes };
  }
  async uploadStreamed(contents, totalBytes) {
    const uploaded = await this.parentDirectory.writeChildFileStream(this.name, totalBytes, contents);
    this.fileId = uploaded.id;
    this.sizeBytes = uploaded.size;
  }
};
var STREAM_WINDOW_BYTES = 16 * 1024 * 1024;
var WRITE_PART_BYTES = 4 * 1024 * 1024;
var MtpWritableFileStream = class extends WritableStream {
  target;
  pipe;
  writer;
  /** Non-null when the upload runs concurrently with writes. */
  streamingUpload;
  /** Pumps the seed ahead of user writes; failures surface on the next write()/close(). */
  seedPump;
  seedReader = null;
  queuedBytes = 0;
  isSettled = false;
  isAborted = false;
  constructor(options) {
    super({
      write: (chunk) => this.write(chunk),
      close: () => this.finish(),
      abort: () => this.discard()
    });
    this.target = options.target;
    const windowBytes = options.totalSize === void 0 ? Number.POSITIVE_INFINITY : STREAM_WINDOW_BYTES;
    const strategy = new ByteLengthQueuingStrategy({ highWaterMark: windowBytes });
    this.pipe = new TransformStream(void 0, strategy, strategy);
    this.writer = this.pipe.writable.getWriter();
    this.streamingUpload = options.totalSize === void 0 ? null : this.captureUpload(
      this.target.uploadStreamed(this.pipe.readable, (options.seed?.size ?? 0) + options.totalSize)
    );
    const seedPump = options.seed === void 0 ? null : this.pumpSeed(options.seed.stream);
    seedPump?.catch(() => void 0);
    this.seedPump = seedPump;
  }
  async write(data) {
    this.assertWritable();
    if (isWriteParams(data)) {
      if (data.type === "write" && (data.position === void 0 || data.position === null)) {
        if (data.data !== void 0 && data.data !== null) {
          await this.writeSnapshot(data.data);
        }
        return;
      }
      const operationName = data.type === "write" ? "positional writes" : data.type;
      throw notSupportedError(operationName, "MTP uploads whole objects");
    }
    await this.writeSnapshot(data);
  }
  seek(_position) {
    return Promise.reject(notSupportedError("seek", "MTP uploads whole objects"));
  }
  truncate(_size) {
    return Promise.reject(notSupportedError("truncate", "MTP uploads whole objects"));
  }
  async close() {
    if (this.locked) {
      throw new DOMException("The writable stream is locked.", "InvalidStateError");
    }
    this.assertWritable();
    await this.getWriter().close();
  }
  /** User writes wait for the seed so its chunks enqueue first. */
  async writeSnapshot(data) {
    await this.seedPump;
    for await (const part of snapshotParts(data)) {
      await this.writePart(part);
    }
  }
  async pumpSeed(stream) {
    const reader = stream.getReader();
    this.seedReader = reader;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        await this.writePart(value);
      }
    } finally {
      this.seedReader = null;
    }
  }
  async writePart(part) {
    this.queuedBytes += part.byteLength;
    await this.writer.write(part);
  }
  async finish() {
    if (this.isSettled) {
      return;
    }
    this.isSettled = true;
    await this.seedPump;
    await this.writer.close();
    if (this.streamingUpload) {
      await this.streamingUpload;
      return;
    }
    await this.target.uploadStreamed(this.pipe.readable, this.queuedBytes);
  }
  async discard() {
    this.isSettled = true;
    this.isAborted = true;
    await this.seedReader?.cancel().catch(() => void 0);
    await this.writer.abort().catch(() => void 0);
    if (this.streamingUpload) {
      await this.streamingUpload.catch(() => void 0);
    }
  }
  assertWritable() {
    if (this.isSettled) {
      const state = this.isAborted ? "was aborted" : "has already been closed";
      throw new DOMException(`The writable stream ${state}.`, "InvalidStateError");
    }
  }
  /** Keeps a concurrent-upload rejection unobserved until finish() rethrows it or the pipe surfaces it. */
  captureUpload(upload) {
    upload.catch(() => void 0);
    return upload;
  }
};
function isMtpHandle(handle) {
  return handle instanceof MtpFileHandle || handle instanceof MtpDirectoryHandle;
}
function isWriteParams(data) {
  return typeof data === "object" && !(data instanceof Blob) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data);
}
async function* snapshotParts(data) {
  if (typeof data === "string") {
    yield new TextEncoder().encode(data);
    return;
  }
  if (data instanceof Blob) {
    for (let offset = 0; offset < data.size; offset += WRITE_PART_BYTES) {
      yield new Uint8Array(await data.slice(offset, Math.min(offset + WRITE_PART_BYTES, data.size)).arrayBuffer());
    }
    return;
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += WRITE_PART_BYTES) {
    yield bytes.slice(offset, Math.min(offset + WRITE_PART_BYTES, bytes.byteLength));
  }
}
function joinPath(parentPath, name) {
  return parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
}
function assertPlainName(name) {
  if (name === "" || name === "." || name === ".." || name.includes("/")) {
    throw new TypeError(`"${name}" is not a valid entry name.`);
  }
}
function notFoundError(name) {
  return new DOMException(`No entry named "${name}".`, "NotFoundError");
}
function entryKindMismatchError(name, wantedKind) {
  return new DOMException(`Entry "${name}" is not a ${wantedKind}.`, "TypeMismatchError");
}
function notSupportedError(operationName, hint) {
  const detail = hint ? `; ${hint}` : "";
  return new DOMException(`${operationName} is not supported on the MTP file system${detail}.`, "NotSupportedError");
}

// src/mtp-device-filters.ts
var MTP_INTERFACE_FILTER = { classCode: 6, subclassCode: 1, protocolCode: 1 };
async function mtpDeviceFilters(options = {}) {
  const module = await loadMtpModule(options.wasmUrl);
  let capacity = 256;
  for (; ; ) {
    const out = module._malloc(capacity * 2);
    try {
      const count = module.ccall("mtp_supported_vendor_ids", "number", ["number", "number"], [out, capacity]);
      if (count >= 0) {
        const vendorIds = Array.from(new Uint16Array(module.HEAPU8.buffer, out, count), (vendorId) => ({ vendorId }));
        return [MTP_INTERFACE_FILTER, ...vendorIds];
      }
    } finally {
      module._free(out);
    }
    capacity *= 2;
  }
}
export {
  MTP_INTERFACE_FILTER,
  MtpDeviceDisconnectedError,
  MtpDeviceNotFoundError,
  MtpDirectoryHandle,
  MtpFileHandle,
  MtpFileReadError,
  MtpFileSystem,
  MtpObjectNotFoundError,
  MtpOpenError,
  MtpSessionClosedError,
  MtpWritableFileStream,
  MtpWriteError,
  mtpDeviceFilters,
  requestMtpFileSystem
};
