"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dgram_1 = require("dgram");
const timers_1 = require("timers");
const crypto_js_1 = require("crypto-js");
const timestamp = () => Math.floor(Date.now() / 1000).toString();
const noopLogger = {
    log: (level, message) => { }
};
class UdpApiClient {
    constructor(secret, sign = timestamp, timeoutDuration = 5000, retryCount = 5, logger) {
        this.secret = secret;
        this.sign = sign;
        this.timeoutDuration = timeoutDuration;
        this.retryCount = retryCount;
        this.logger = logger;
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
        const msg = `OPEN_ID_ ${id}`;
        return this.sendMessage(msg, port, address);
    }
    stopCharging(id, port, address) {
        const msg = `CLOSE_ID ${id}`;
        return this.sendMessage(msg, port, address);
    }
    encrypt(message) {
        return crypto_js_1.AES.encrypt(message, this.secret)
            .toString();
    }
    decrypt(message) {
        return crypto_js_1.AES
            .decrypt(message, this.secret)
            .toString(crypto_js_1.enc.Utf8);
    }
    sendMessage(msg, port, address) {
        return new Promise((resolve, reject) => {
            const client = dgram_1.createSocket('udp4');
            const signature = this.sign(msg);
            const message = this.encrypt(`${msg} ${signature}`);
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
                const res = this.decrypt(msg.toString());
                const [ns, sig, code] = res.split(' ');
                this.logger.log('INFO', `S2C ${res} ${address}:${port}`);
                if (code !== 'OK') {
                    const errMsg = this.serverErrByCode[code] || 'Unknown server error returned';
                    return rejectClose(new Error(`${errMsg}`));
                }
                const ackMsg = `ACK ${sig}`;
                const req = this.encrypt(ackMsg);
                this.logger.log('INFO', `C2S ${msg} ${address}:${port}`);
                client.send(req, port, address, (err) => {
                    client.close(() => {
                        if (!err) {
                            resolve(res);
                        }
                        else {
                            reject(new Error('Failed to send ACK msg to the server'));
                        }
                    });
                });
            });
            this.logger.log('INFO', `C2S ${msg} ${address}:${port}`);
            client.send(message, port, address, (err) => err && rejectClose(err));
        });
    }
}
exports.UdpApiClient = UdpApiClient;
