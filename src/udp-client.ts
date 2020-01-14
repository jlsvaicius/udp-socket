import { createSocket } from "dgram";
import { setInterval } from "timers";
import { AddressInfo } from "net";
import { padding, utils, ModeOfOperation } from "aes-js";

interface Signer {
    (msg: string): string;
}

interface Logger {
    log(level: string, message: string): void
}

const timestamp = () => Math.floor(Date.now() / 1000).toString();
const noopLogger = {
    log: (level: string, message: string) => {}
};

export class UdpApiClient {
    protected serverErrByCode: {[key:string]: string} = {
        SAF: 'Invalid Safety Key',
        NOA: 'Useless operation',
        ERR: 'Unknown error',
    };

    constructor(
        public secret: string,
        public sign: Signer = timestamp,
        public timeoutDuration = 5000,
        public retryCount: number = 5,
        public logger?: Logger,
        public key_128: number[] = [2, 51, 9, 12, 1, 85, 27, 56, 10, 14, 75, 42, 78, 4, 23, 64],
        public iv: number[] = [29, 78, 23, 33, 99, 13, 68, 23, 94, 38, 65, 12, 45, 7, 49, 68]
    ) {
        this.logger = logger || noopLogger;
    }

    updateDb(uid: string, type: number, port: number, address: string) {
        const msg = `UPDATEDB ${uid} ${type}`;

        return this.sendMessage(msg, port, address);
    }

    reserve(uid: string, durationMinutes: number, type: number, port: number, address: string) {
        const msg = `FIX_UID_ ${uid} ${durationMinutes} ${type}`;

        return this.sendMessage(msg, port, address);
    }
    stopReservation(uid: string, durationMinutes: number, type: number, port: number, address: string) {
        const msg = `FIX_UID_ ${uid} ${durationMinutes} ${type}`;

        return this.sendMessage(msg, port, address);
    }
    startCharging(id: string, port: number, address: string) {
        const msg = `START_ID_${id}`;

        return this.sendMessage(msg, port, address);
    }

    stopCharging(id: string, port: number, address: string) {
        const msg = `STOP_ID_${id}`;

        return this.sendMessage(msg, port, address);
    }

    protected encrypt(message: string): Uint8Array {
        const key_128_buffer = Buffer.from(this.key_128);
        const iv_buffer = Buffer.from(this.iv);

        const textBytes = utils.utf8.toBytes(message);
        const padded_data = padding.pkcs7.pad(textBytes);
        const aesCbc = new ModeOfOperation.cbc(key_128_buffer, iv_buffer);
        return aesCbc.encrypt(padded_data);
    }

    protected decrypt(message: Buffer): string {
        const key_128_buffer = Buffer.from(this.key_128);
        const iv_buffer = Buffer.from(this.iv);

        const aesCbc = new ModeOfOperation.cbc(key_128_buffer, iv_buffer);
        const decryptedBytes = aesCbc.decrypt(message);
        const unpadded_data = padding.pkcs7.strip(decryptedBytes);

        return utils.utf8.fromBytes(unpadded_data);
    }

    sendMessage(msg: string, port: number, address: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const client = createSocket('udp4');
            const signature = this.sign(msg);
            const message = this.encrypt(`${msg}_${signature}`);

            const rejectClose = (err: Error) => {
                client.close();
                reject(err);
            };
            // const intervalHandle = setInterval((state: any) => {
            //     if (state.done) {
            //         return;
            //     }

            //     if (++state.attempt > this.retryCount) {
            //         state.done = true;

            //         return rejectClose(new Error(`API did not respond after ${this.retryCount} retries`));
            //     }

            //     client.send(message, port, address, (err: Error) => err && rejectClose(err));
            // }, this.timeoutDuration, {attempt: 0, done: false});

            client.once('error', () => client.close());
            // client.once('close', () => intervalHandle.unref());
            client.once('message',(msg: Buffer, {port, address}: AddressInfo) => {
                const res = this.decrypt(msg);
                const [
                    command,
                    idName, 
                    id, 
                    timestamp, 
                    code
                ] = res.split('_');

                this.logger.log('INFO', `S2C ${res} ${address}:${port}`);

                if (code !== 'OK'){
                    if (code === 'NOA') {
                        if (command !== 'STOP') {
                            const errMsg = this.serverErrByCode[code] || 'Unknown server error returned';
                            return rejectClose(new Error(`${errMsg}`));
                        }
                    } else {
                        const errMsg = this.serverErrByCode[code] || 'Unknown server error returned';
                        return rejectClose(new Error(`${errMsg}`));
                    }
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

            client.send(message, port, address, (err: Error) => err && rejectClose(err));
        });
    }
}
