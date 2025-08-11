'use strict';

// eslint-disable-next-line no-unused-vars
class Safe {
  #key = '';

  #encoder = new TextEncoder();
  #decoder = new TextDecoder();

  #buffer(string) {
    const bytes = new Uint8Array(string.length);
    [...string].forEach((c, i) => bytes[i] = c.charCodeAt(0));
    return bytes;
  }

  async open(password) {
    this.#key = await crypto.subtle.digest({
      name: 'SHA-256'
    }, this.#encoder.encode(password)).then(result => crypto.subtle.importKey('raw', result, {
      name: 'AES-CBC'
    }, true, ['encrypt', 'decrypt']));
  }
  export() {
    return crypto.subtle.exportKey('raw', this.#key).then(ab => {
      return btoa(String.fromCharCode(...new Uint8Array(ab)));
    });
  }
  import(data) {/* Uint8Array */
    const decodedKeyData = typeof data === 'string' ?
      new Uint8Array(Array.from(atob(data), c => c.charCodeAt(0))) : data;

    return crypto.subtle.importKey('raw', decodedKeyData, {
      name: 'AES-CBC'
    }, true, ['encrypt', 'decrypt']).then(key => {
      this.#key = key;
    });
  }
  async encrypt(data) {
    const iv = crypto.getRandomValues(new Uint8Array(16));

    if (typeof data === 'string') {
      const result = await crypto.subtle.encrypt({
        name: 'AES-CBC',
        iv
      }, this.#key, this.#encoder.encode(data));

      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob([iv, result], {type: 'text/enc'}));
      });
    }
    else {
      const result = await crypto.subtle.encrypt({
        name: 'AES-CBC',
        iv
      }, this.#key, data);

      return new Blob([iv, result]);
    }
  }
  async decrypt(data) {
    const iv = crypto.getRandomValues(new Uint8Array(16));

    if (typeof data === 'string') {
      // compatibility fix
      data = data.replace('data:application/octet-binary;base64,', '');

      const result = await crypto.subtle.decrypt({
        name: 'AES-CBC',
        iv
      }, this.#key, this.#buffer(atob(data)));

      const ab = (new Uint8Array(result)).subarray(16);
      return this.#decoder.decode(ab);
    }
    else {
      const result = await crypto.subtle.decrypt({
        name: 'AES-CBC',
        iv
      }, this.#key, data);

      return new Blob([(new Uint8Array(result)).subarray(16)]);
    }
  }
}
