"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dgram_1 = require("dgram");
const timers_1 = require("timers");
// import {AES, enc} from "crypto-js";
const aes_js_1 = require("aes-js");
const timestamp = () => Math.floor(Date.now() / 1000).toString();
const noopLogger = {
    log: (level, message) => { }
};
class UdpApiClient {
    constructor(secret, sign = timestamp, timeoutDuration = 5000, retryCount = 5, logger, key_128 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], iv = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]) {
        this.secret = secret;
        this.sign = sign;
        this.timeoutDuration = timeoutDuration;
        this.retryCount = retryCount;
        this.logger = logger;
        this.key_128 = key_128;
        this.iv = iv;
        this.serverErrByCode = {
            SAF: 'Invalid Safety Key',
            NOA: 'Useless operation',
            ERR: 'Unknown error',
        };
        this.logger = logger || noopLogger;
    }
    updateDb(uid, type, port, address) {
        const msg = `UPDATEDB ${uid} ${type}`;
        return this.sendMessage(msg, port, address);
    }
    reserve(uid, durationMinutes, type, port, address) {
        const msg = `FIX_UID_ ${uid} ${durationMinutes} ${type}`;
        return this.sendMessage(msg, port, address);
    }
    stopReservation(uid, durationMinutes, type, port, address) {
        const msg = `FIX_UID_ ${uid} ${durationMinutes} ${type}`;
        return this.sendMessage(msg, port, address);
    }
    startCharging(id, port, address) {
        const msg = `START_ID_${id}`;
        return this.sendMessage(msg, port, address);
    }
    stopCharging(id, port, address) {
        const msg = `STOP_ID_${id}`;
        return this.sendMessage(msg, port, address);
    }
    encrypt(message) {
        const key_128_buffer = Buffer.from(this.key_128);
        const iv_buffer = Buffer.from(this.iv);
        const textBytes = aes_js_1.utils.utf8.toBytes(message);
        const padded_data = aes_js_1.padding.pkcs7.pad(textBytes);
        const aesCbc = new aes_js_1.ModeOfOperation.cbc(key_128_buffer, iv_buffer);
        return aesCbc.encrypt(padded_data);
    }
    decrypt(message) {
        const key_128_buffer = Buffer.from(this.key_128);
        const iv_buffer = Buffer.from(this.iv);
        const aesCbc = new aes_js_1.ModeOfOperation.cbc(key_128_buffer, iv_buffer);
        const decryptedBytes = aesCbc.decrypt(message);
        const unpadded_data = aes_js_1.padding.pkcs7.strip(decryptedBytes);
        return aes_js_1.utils.utf8.fromBytes(unpadded_data);
    }
    sendMessage(msg, port, address) {
        return new Promise((resolve, reject) => {
            const client = dgram_1.createSocket('udp4');
            const signature = this.sign(msg);
            const message = this.encrypt(`${msg}_${signature}`);
            const rejectClose = (err) => {
                client.close();
                reject(err);
            };
            const intervalHandle = timers_1.setInterval((state) => {
                if (state.done) {
                    return;
                }
                if (++state.attempt > this.retryCount) {
                    state.done = true;
                    return rejectClose(new Error(`API did not respond after ${this.retryCount} retries`));
                }
                client.send(message, port, address, (err) => err && rejectClose(err));
            }, this.timeoutDuration, { attempt: 0, done: false });
            client.once('error', rejectClose);
            client.once('close', () => intervalHandle.unref());
            client.once('message', (msg, { port, address }) => {
                const res = this.decrypt(msg);
                const [command, idName, id, timestamp, code] = res.split('_');
                this.logger.log('INFO', `S2C ${res} ${address}:${port}`);
                if (code !== 'OK') {
                    const errMsg = this.serverErrByCode[code] || 'Unknown server error returned';
                    return rejectClose(new Error(`${errMsg}`));
                }
                // const ackMsg = `ACK ${sig}`;
                // const req = this.encrypt(ackMsg);
                // this.logger.log('INFO', `C2S ${msg} ${address}:${port}`);
                // client.send(req, port, address, (err: Error) => {
                client.close(() => {
                    // if (!err) {
                    resolve(res);
                    // } else {
                    //     reject(new Error('Failed to send ACK msg to the server'));
                    // }
                });
                // });
            });
            this.logger.log('INFO', `C2S ${msg} ${address}:${port}`);
            client.send(message, port, address, (err) => err && rejectClose(err));
        });
    }
}
exports.UdpApiClient = UdpApiClient;
