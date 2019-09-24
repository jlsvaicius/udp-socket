import {createSocket, Socket} from "dgram";
import {setInterval} from "timers";
import {AddressInfo} from "net";
// import {AES, enc} from "crypto-js";
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
        // public key_128: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        // public iv: number[] = [ 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,35, 36 ]
        public key_128: string = '5b1203bcac4a85612c8f998d54a7354d',
        public iv: string = '56d7a19850612f5568e898af19a40617'
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
        const key_128_buffer = Buffer.from(this.key_128, 'hex');
        const iv_buffer = Buffer.from(this.iv, 'hex');

        const textBytes = utils.utf8.toBytes(message);
        const padded_data = padding.pkcs7.pad(textBytes);
        const aesCbc = new ModeOfOperation.cbc(key_128_buffer, iv_buffer);
        return aesCbc.encrypt(padded_data);
    }

    protected decrypt(message: Buffer): string {
        const key_128_buffer = Buffer.from(this.key_128, 'hex');
        const iv_buffer = Buffer.from(this.iv, 'hex');

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
            const intervalHandle = setInterval((state: any) => {
                if (state.done) {
                    return;
                }

                if (++state.attempt > this.retryCount) {
                    state.done = true;

                    return rejectClose(new Error(`API did not respond after ${this.retryCount} retries`));
                }

                client.send(message, port, address, (err: Error) => err && rejectClose(err));
            }, this.timeoutDuration, {attempt: 0, done: false});

            client.once('error', rejectClose);
            client.once('close', () => intervalHandle.unref());
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

            client.send(message, port, address, (err: Error) => err && rejectClose(err));
        });
    }
}
