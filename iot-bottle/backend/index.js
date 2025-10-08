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
    res.send('<html><body><h1>Hello World, from express</h1><a href="/static/index.html">Go to static index.html</a></body></html>');
});

app.post('/devices', async (req, res) => {
    const device = {
        ...req.body,
        lastSeenOn: new Date()
    };
    // console.log('POST /devices', { _: new Date(), device });

    try {
        // Cerca di aggiornare un device esistente
        const result = await r.table('devices')
            .get(device.fingerprint)
            .replace(oldDoc => r.branch(
                oldDoc.eq(null),
                device,  // Se non esiste, inserisce il nuovo device
                oldDoc.merge({ lastSeenOn: device.lastSeenOn })  // Se esiste, aggiorna solo lastSeenOn
            ))
            .run(conn);

        // console.log('device updated/stored', { _: new Date(), device });
        res.send('');
    } catch (err) {
        console.error('Error in POST /devices:', err);
        res.status(500).send(err.message);
    }
});

app.post('/devices/:deviceHash/events', (req, res) => {
    const deviceHash = req.params.deviceHash;
    const event = req.body;
    console.log('POST /devices/:deviceHash/events', { _: new Date(), deviceHash, event });
    r.table('events').insert(event).run(conn, function (err, ress) {
        if (err) throw err;
        console.log('event stored', { _: new Date(), deviceHash, event });
        res.send('');
    });
});

// API per creare un nuovo turno
app.post('/turns', async (req, res) => {
    const turn = {
        createdOn: new Date(),
        status: 'open',
        name: req.body.name,
        statusUpdatedOn: new Date()
    };

    try {
        const result = await r.table('turns').insert(turn).run(conn);
        console.log('turn created', { _: new Date(), turn });
        res.json({ id: result.generated_keys[0] });
    } catch (err) {
        console.error('Error creating turn:', err);
        res.status(500).send(err.message);
    }
});

// API per cambiare lo stato di un turno
app.patch('/turns/:turnId', async (req, res) => {
    const { turnId } = req.params;
    const newStatus = 'closed'; // Impostiamo sempre a 'closed' come richiesto

    try {
        await r.table('turns')
            .get(turnId)
            .update({
                status: newStatus,
                statusUpdatedOn: new Date()
            })
            .run(conn);

        console.log('turn status updated', { _: new Date(), turnId, status: newStatus });
        res.send('');
    } catch (err) {
        console.error('Error updating turn status:', err);
        res.status(500).send(err.message);
    }
});

// API per aggiungere un device a un turno
app.post('/turns/:turnId/devices/:deviceHash', async (req, res) => {
    const { turnId, deviceHash } = req.params;
    
    try {
        const turnDevice = {
            addedOn: new Date(),
            turnId: turnId,
            deviceId: deviceHash,
            waterLevel: 1.0  // Livello iniziale al 100%
        };
        
        await r.table('turnsDevices').insert(turnDevice).run(conn);
        console.log('device added to turn', { _: new Date(), turnId, deviceHash });
        res.send('');
    } catch (err) {
        console.error('Error adding device to turn:', err);
        res.status(500).send(err.message);
    }
});
// API per aggiornare il waterLevel di un device in un turno
app.patch('/turns/:turnId/devices/:deviceHash/waterLevel', async (req, res) => {
    const { turnId, deviceHash } = req.params;
    const { waterLevel } = req.body;
    // console.log('PATCH /turns/:turnId/devices/:deviceHash/waterLevel', { _: new Date(), turnId, deviceHash, waterLevel });

    if (typeof waterLevel !== 'number' || waterLevel < 0 || waterLevel > 1) {
        return res.status(400).send('waterLevel deve essere un numero tra 0 e 1');
    }

    try {
        // Verifica che il turno sia ancora aperto
        const turn = await r.table('turns')
            .get(turnId)
            .run(conn);

        if (!turn || turn.status !== 'open') {
            return res.status(400).send('Il turno non è aperto');
        }

        // Aggiorna il waterLevel
        await r.table('turnsDevices')
            .getAll(turnId, { index: 'turnId' })
            .filter({ deviceId: deviceHash })
            .update({ waterLevel })
            .run(conn);

        console.log('waterLevel updated', { _: new Date(), turnId, deviceHash, waterLevel });
        res.send('');
    } catch (err) {
        console.error('Error updating waterLevel:', err);
        res.status(500).send(err.message);
    }
});

// API per il polling dei device attivi
app.get('/polling', async (req, res) => {
    try {
        // Trova il turno attivo più recente
        const activeTurns = await r.table('turns')
            .getAll('open', { index: 'status' })
            .orderBy('statusUpdatedOn')
            .limit(1)
            .run(conn)
            .then(cursor => cursor.toArray())
            
        if (!activeTurns || activeTurns.length === 0) {
            return res.json([]); // Nessun turno attivo
        }
        const activeTurn = activeTurns[0];
        
        // Ottiene tutti i deviceId per il turno attivo
        const devices = await r.table('turnsDevices')
            .getAll(activeTurn.id, { index: 'turnId' })
            .run(conn)
            .then(cursor => cursor.toArray());
        const fingerprints = devices.map(d => d.deviceId);

        res.json({
            turn: activeTurn,
            fingerprints: fingerprints
        });
    } catch (err) {
        console.error('Error in polling:', err);
        res.status(500).send(err.message);
    }
});

app.ws('/echo', function (ws, req) {
    console.log('WSS /echo connected', { _: new Date(), req })
    ws.on('message', function (msg) {
        console.log('WSS /echo onmessage', { _: new Date(), msg })
        r.table('devices').changes().run(conn, function (err, cursor) {
            if (err) {
                console.log('error getting devices changefeed', { _: new Date(), err })
                return;
            }
            cursor.each((err, data) => {
                if (err) {
                    console.log('error getting devices cursor.each', { _: new Date(), err })
                    return;
                }
                // console.log('devices cursor oneach', { _: new Date(), data })
                ws.send(JSON.stringify({ type: 'devices', data: data.new_val }))
            });
        });

        r.table('turnsDevices').changes().run(conn, function (err, cursor) {
            if (err) {
                console.log('error getting turnsDevices changefeed', { _: new Date(), err })
                return;
            }
            cursor.each((err, data) => {
                if (err) {
                    console.log('error getting turnsDevices cursor.each', { _: new Date(), err })
                    return;
                }
                // console.log('turnsDevices cursor oneach', { _: new Date(), data })
                ws.send(JSON.stringify({ type: 'turnsDevices', data: data.new_val }))
            });
        });
    });
});

async function initializeDatabase(conn) {
    try {
        // Lista delle tabelle esistenti
        const tables = await r.db('test').tableList().run(conn);

        // Creazione tabella devices se non esiste
        if (!tables.includes('devices')) {
            await r.db('test').tableCreate('devices', {
                primaryKey: 'fingerprint'
            }).run(conn);
            console.log('devices table created', { _: new Date() });
        }

        // Creazione tabella events se non esiste
        if (!tables.includes('events')) {
            await r.db('test').tableCreate('events').run(conn);
            console.log('events table created', { _: new Date() });
        }

        // Creazione tabella turns se non esiste
        if (!tables.includes('turns')) {
            await r.db('test').tableCreate('turns').run(conn);
            console.log('turns table created', { _: new Date() });
            // Creare indice su status e statusUpdatedOn per ottimizzare le query
            await r.db('test').table('turns').indexCreate('status').run(conn);
            await r.db('test').table('turns').indexCreate('statusUpdatedOn').run(conn);
        }

        // Creazione tabella turnsDevices se non esiste
        if (!tables.includes('turnsDevices')) {
            await r.db('test').tableCreate('turnsDevices').run(conn);
            console.log('turnsDevices table created', { _: new Date() });
            // Creare indice sul turnId per ottimizzare le query
            await r.db('test').table('turnsDevices').indexCreate('turnId').run(conn);
        }

        console.log('Database initialization completed');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    }
}

r.connect({ host: 'db', port: 28015 }, async function (err, _conn) {
    if (err) throw err;
    conn = _conn;
    console.log('rethink db connection created', { _: new Date(), conn });

    await initializeDatabase(conn);

    app.listen(PORT, () => console.log(`Hello world app listening on port ${PORT}!`));
});
