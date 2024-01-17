const r = require('rethinkdb')
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const expressWs = require('express-ws')(app);

app.use(cors());
app.use(bodyParser.json());

app.use('/static', express.static('public'))

const PORT = 3000;

let conn;

app.get('/', (req, res) => {
    console.log('GET /', { _: new Date() })
    res.send('Hello World, from express');
});

app.post('/devices', (req, res) => {
    const device = req.body;
    console.log('POST /devices', { _: new Date(), device });
    r.table('devices').insert(device).run(conn, function (err, ress) {
        if (err) throw err;
        console.log('device stored', { _: new Date(), device });
        res.send('');
    });
});

app.post('/devices/:deviceHash/events', (req, res) => {
    const deviceHash = req.params.deviceHash;
    const event = req.body;
    console.log('POST /devices', { _: new Date(), deviceHash, event });
    r.table('events').insert(event).run(conn, function (err, ress) {
        if (err) throw err;
        console.log('device stored', { _: new Date(), deviceHash, event });
        res.send('');
    });
});

app.ws('/echo', function (ws, req) {
    console.log('WSS /echo connected', { _: new Date(), req })
    ws.on('message', function (msg) {
        console.log('WSS /echo onmessage', { _: new Date(), msg })
        r.table('devices').changes().run(conn, function (err, cursor) {
            if (err) {
                console.log('error getting devices changefeed', {_: new Date(), err})
                return;
            }
            cursor.each((err, data) => {
                if (err) {
                    console.log('error getting devices cursor.each', {_: new Date(), err})
                    return;
                }
                console.log('devices cursor oneach', {_: new Date(), data})
                // ws.send(JSON.stringify(data))
            });
        });
        r.table('events').changes().run(conn, function (err, cursor) {
            if (err) {
                console.log('error getting events changefeed', {_: new Date(), err})
                return;
            }
            cursor.each((err, data) => {
                if (err) {
                    console.log('error getting events cursor.each', {_: new Date(), err})
                    return;
                }
                console.log('events cursor oneach', {_: new Date(), data})
                ws.send(JSON.stringify(data))
            });
        });
    });
});

r.connect({ host: 'db', port: 28015 }, function (err, _conn) {
    conn = _conn;
    if (err) throw err;
    console.log('rethink db connection created', { _: new Date(), conn })
    r.db('test').tableCreate('devices').run(conn, function (err, res) {
        if (err) throw err;
        console.log('devices table created', { _: new Date(), res });
        r.db('test').tableCreate('events').run(conn, function (err, res) {
            if (err) throw err;
            console.log('events table created', { _: new Date(), res });
            app.listen(PORT, () => console.log(`Hello world app listening on port ${PORT}!`))
        });
    });
});
