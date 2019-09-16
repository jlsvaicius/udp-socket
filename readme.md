## install

add dependency to package.json file:

```
"dependencies": {
    ...
    "udp-api-client": "git@...",
    ...
}
 ```
 
run ``npm install``

OR if you prefer copy-pasting - copy ```lib/udp-client.js``` file


## usage

Create API client
```js
const {UdpApiClient} = require("udp-api-client");

const secret = '1234567890123456'; // must be 16 symbols length
const client = new UdpApiClient(secret);
```

Send command to arduino server
```js
updateDb(uid, type, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})

reserve(uid, durationMinutes, type, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})
  
stopReservation(uid, durationMinutes, type, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})
  
startCharging(id, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})
  
stopCharging(id, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})
  
```

Send custom message/command to arduino server
```js
const msg = 'FIX_UID_ someuid 90 2';

sendMessage(msg, port, address)
  .then(response => {/* do smth on success*/})
  .catch(err => {/* handle error*/})
```

## test

``npm test``

Tests output:
```
 PASS  tests/udp-client.spec.js
  API tests
    √ encodes and decodes message (19ms)
    √ sendMessage resolves after ACK msg received (19ms)
    √ sendMessage rejects when server returns SAF error (5ms)
    √ sendMessage rejects when server returns NOA error (5ms)
    √ sendMessage rejects when server returns ERR error (7ms)
    √ sendMessage retries 5 times (607ms)
    √ tests update command (8ms)
    √ tests reservation command (8ms)
    √ tests stop reservation command (9ms)
    √ tests start charging command (7ms)
    √ tests stop charging command (9ms)

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total

```