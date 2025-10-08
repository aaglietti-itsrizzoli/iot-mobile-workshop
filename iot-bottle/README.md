# IoT Bottle an ITS Academy Angelo Rizzoli challenge

Un contest lampo dove il tuo smartphone diventa… una borraccia smart!
L’app usa l'accelerometro: a intervalli casuali sceglie un giocatore, vibra e sul display appare la sfida.
Hai 3 secondi per “bere” inclinandolo e scuotendolo come una vera borraccia.
Ogni sorso conta: più bevi dalla borraccia riutilizzabile, più CO₂ eviti rispetto all’acqua in bottiglia monouso.
Classifiche live, colpi di scena e… sete di sostenibilità!

Livelli & CO₂ risparmiata (per partita):
- Kid: fino a 0,25 kg CO₂ evitata
- Rookie: da 0,26 a 1,00 kg CO₂ evitata
- Hero: oltre 1,00 kg CO₂ evitata

Pronti? Telefono in mano, borraccia virtuale alzata… e che vinca chi risparmia più CO₂!

## The Challenge

La sfida si articola così:
1. ogni partecipante installa Expo Go 
2. ogni partecipante scansionando il QR code di un Expo Snack avvia l'app
3. l'app è un simulatore di borraccia, contiene acqua, quando la inclini l'acqua esce dal beccuccio
4. tramite la dashboard web si avvia la sfida che va in crescendo di 4 minuti in 4 minuti
5. 0-4 minuti: 4-5 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
6. 4-8 minuti: 10-15 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
7. 8-12 minuti: 15-30 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
8. in base a quanti partecipanti attivamente svolgono correttamente il gesto di bevuta dalla borraccia vengono calcolati i valori CO2 risparmiati rispetto ad aver comprato delle bottigliette d'acqua
9. una somma finale della CO2 mostrata a schermo consente al tutor di scegliere la parola chiave corretta associata ad ogni punteggio

## Tech spech

La struttura del progetto è suddivisa in due cartelle frontend e backend.

### frontend

E' un applicazione Expo / React Native pubblicata su Expo Snacks così da poter installarla senza passare dallo store in quando si può utilizzare l'applicazione Expo Go.

L'applicazione Expo è composta da unico file frontend/App.js

#### DONE frontend
- calcolo del fingerprint del device 
- assegnazione casuale di team in base al fingerprint
- funzioni axios per svolgere richieste HTTP al backend
- listener per ottenere gli eventi prodotti dall'accelerometro
- React state per visualizzare dati grezzi dall'accelerometro
- mostra sullo sfondo la sagoma di una borraccia
- la sagoma della borraccia contiene acqua
- l'acqua si anima in base all'inclinazione del telefono
- se il telefono è verticale l'acqua rimane all'interno della borraccia ferma
- se il telefono è inclinato l'acqua si inclina ed eventualmente fuoriesce dal beccuccio della borraccia
- l'acqua fuoriesce dal beccuccio solo se parzialmente inclinata permettendo all'aria di entrare
- non vi è alcuna animazione dell'acqua che fuoriesce dal beccuccio della borraccia
- si verifica i permessi per l'utilizzo dell'accelerometro
- funzione isMyTurn che fa vibrare il telefono e resetta il waterLevel al 100%
- all'avvio l'applicazione utilizza l'API /devices per comunicare il fingerprint e team di appartenenza
- svolgere polling su API /polling, quando tale API contiene nell'elenco dei fingerprint per il turno attivo il fingerprint del device corrente attivare isMyTurn
- isMyTurn porta il waterLevel al 100% solo la prima volta che il fingerprint compare associato ad turnId
- ogni 10% della riduzione di waterLevel causa la chiamata API PATCH /turns/:turnId/devices/:deviceHash/waterLevel per comunicare l'attuale livello
- quando il fingerprint non è più presente in API /polling o la sua risposta non contiene dati del turno o fingerprint il device smette di vibrare

#### TODO frontend

### backend

E' un applicazione Express.js avviata tramite docker-compose.

#### DONE backend
- utilizza come database realtime rethinkdb
- all'interno di index.js si trovano rotte statiche, API e WSS
- backend/public/index.js implementa la dashboard, tramite WSS riceve la presenza di nuovi device e ne mostra il conteggio per ogni team
- backend/public/index.html quando riceve un nuovo device tramite onmessage dovrà aggiornare il conteggio solo se è un nuovo fingerprint
- la tabella devices utilizza il fingerprint come chiave primaria
- all'avvio di backend/index.js se le tabelle già esistono non devono essere create
- la tabella devices ha una colonna lastSeenOn che sarà aggiornata ogni volta che un device con un fingerprint già presente svolge la chiamata API a /devices invece che inserire un nuovo device
- backend/public/index.html deve mostrare quattro colonne, una per team, all'interno un pulsante per ogni fingerprint che mostra i primi 6 caratteri
- backend/index.js espone una API POST /turns che permetta di creare un nuovo turno, con la corrispondente tabella turns(createdOn, status, name, statusUpdatedOn), lo status di default è "open"
- backend/index.js espone una API PATCH /turns/:turnId che permetta di cambiare lo stato di un turno da "open" a "closed"
- backend/index.js espone una API POST /turns/:turnId/devices/:deviceHash che permetta di aggiungere un device ad un turno, con la corrispondente tabella turnsDevices(addedOn, turnId, deviceId)
- backend/index.js espone una API GET /polling che a partire dal turno in status "open" con statusUpdatedOn più recente ritorna il dettaglio del turno attivo e tutti i fingerprint appartenenti a tale turno
- backend/public/index.html mostra il pulsante per creare un nuovo turno, tramite API POST /turns, e una input di testo per impostare il name del nuovo turno
- backend/public/index.html mostra il pulsante per cambiare da "open" a "closed" il turno, tramite API PATCH /turns/:turnId
- backend/public/index.html quando vene cliccato il pusante di un fingerprint, tramite API POST /turns/:turnId/devices/:deviceHash, aggiunge il device al turno
- la tabella turnsDevices ha un attributo waterLevel che indica il livello di acqua rimanente
- backend/index.js espone una API PATCH /turns/:turnId/devices/:deviceHash/waterLevel che permette di registrare il waterLevel di ogni device durante il turno, accetta aggiornamenti solo se il turno è open
- backend/public/index.html ogni volta che arriva un evento turnsDevices aggiorna il waterLevel totale del team visualizzato
