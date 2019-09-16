const {createSocket} = require('dgram');
const {UdpApiClient} = require("../lib/udp-client");

describe('API tests', () => {
  const secret = '1234567890123456';
  const signature = 'signature123';
  let port = 31234;
  let server, client;

  beforeEach(done => {
    client = new UdpApiClient(secret, () => Date.now());
    client.sign = () => signature;
    server = createSocket('udp4');
    server.respondWith = respondWithFactory(server, client);
    server.assertReceived = assertServerReceivedFactory(server, client);
    server.bind(port, done);
  });

  afterEach(done => {
    server.close(done);
  });

  it('encodes and decodes message', () => {
    const msg = 'whatever';
    const encrypted = client.encrypt(msg);
    const decrypted  = client.decrypt(encrypted);

    expect(decrypted).toBe(msg);
  });

  it(`sendMessage resolves after ACK msg received`, (done) => {
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.sendMessage('CMD1', port, 'localhost')
      .then(res => {
        expect(res).toBe('CMD1 signature123 OK');
        done();
      });
  });

  it(`sendMessage rejects when server returns SAF error`, (done) => {
    server.respondWith((cmd, sig) => `${cmd} ${sig} SAF`);

    client.sendMessage('CMD', port, 'localhost')
      .catch(err => {
        expect(err.message).toBe('Invalid Safety Key');
        done();
      });
  });

  it(`sendMessage rejects when server returns NOA error`, (done) => {
    server.respondWith((cmd, sig) => `${cmd} ${sig} NOA`);

    client.sendMessage('CMD', port, 'localhost')
      .catch(err => {
        expect(err.message).toBe('Useless operation');
        done();
      });
  });

  it(`sendMessage rejects when server returns ERR error`, (done) => {
    server.respondWith((cmd, sig) => `${cmd} ${sig} ERR`);

    client.sendMessage('CMD', port, 'localhost')
      .catch(err => {
        expect(err.message).toBe('Unknown error');
        done();
      });
  });

  it(`sendMessage retries 5 times`, (done) => {
    expect.assertions(2);

    client.timeoutDuration = 100;
    let msgCnt = 0;

    server.on('message', (msg, rinfo) => {
      msgCnt++;
    });

    client.sendMessage('whateva', port, 'localhost')
      .catch((err) => {
        expect(msgCnt).toBe(6);
        expect(err.message).toMatch('API did not respond');
        done();
      });
  });

  it('tests update command', (done) => {
    expect.assertions(2);

    server.assertReceived(`UPDATEDB uid 1 ${signature}`);
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.updateDb('uid', 1, port, 'localhost')
      .then(res => {
        expect(res).toBe(`UPDATEDB ${signature} OK`);
        done()
      });
  });

  it('tests reservation command', (done) => {
    expect.assertions(2);

    server.assertReceived(`FIX_UID_ uid 60 1 ${signature}`);
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.reserve('uid', 60, 1, port, 'localhost')
      .then(res => {
        expect(res).toBe(`FIX_UID_ ${signature} OK`);
        done()
      });
  });

  it('tests stop reservation command', (done) => {
    expect.assertions(2);

    server.assertReceived(`FIX_UID_ uid 90 1 ${signature}`);
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.stopReservation('uid', 90, 1, port, 'localhost')
      .then(res => {
        expect(res).toBe(`FIX_UID_ ${signature} OK`);
        done()
      });
  });

  it('tests start charging command', (done) => {
    expect.assertions(2);

    server.assertReceived(`OPEN_ID_ id ${signature}`);
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.startCharging('id', port, 'localhost')
      .then(res => {
        expect(res).toBe(`OPEN_ID_ ${signature} OK`);
        done()
      });
  });

  it('tests stop charging command', (done) => {
    expect.assertions(2);

    server.assertReceived(`CLOSE_ID id ${signature}`);
    server.respondWith((cmd, sig) => `${cmd} ${sig} OK`);

    client.stopCharging('id', port, 'localhost')
      .then(res => {
        expect(res).toBe(`CLOSE_ID ${signature} OK`);
        done()
      });
  });

});

function assertServerReceivedFactory(server, client) {
  return expectedMessage => {
    server.once('message', (msg, rinfo) => {
      const message = client.decrypt(msg.toString());

      expect(message).toBe(expectedMessage);
    });
  };
}


function respondWithFactory(server, client) {
  return createMessage => {
    server.on('message', (msg, rinfo) => {
      const args = client.decrypt(msg.toString()).split(' ');
      const command = args[0];
      const signature = args[args.length - 1];
      const message = client.encrypt(createMessage(command, signature));

      server.send(message, rinfo.port, rinfo.address);
    });
  };
}
